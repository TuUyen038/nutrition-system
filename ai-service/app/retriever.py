"""Truy xuất dùng chung cho API (main.py) và các script đánh giá.

Quy trình: lọc đối tượng -> lấy ứng viên theo từng ngôn ngữ -> (rerank tùy chọn) -> xếp hạng -> top-K + cờ "liên quan".
Khi không rerank: xếp hạng theo cosine + độ lệch theo ngôn ngữ, còn cờ "liên quan" so cosine thô với ngưỡng của ngôn ngữ chunk.
"""
import re
from typing import Any, Dict, List, Optional

from . import config, embedding, reranker, vector_store
from .intent_router import strip_accents

# Từ khóa cho biết câu hỏi nói về trẻ nhỏ (khớp trên văn bản đã bỏ dấu, nên có dấu/không dấu đều khớp)
INFANT_RE = re.compile(
    r"\b(be|tre|tre em|tre nho|em be|bu me|bu sua|sua me|sua cong thuc|an dam|an bo sung|"
    r"so sinh|thang tuoi|baby|infant|toddler|breastfe\w*|complementary feeding)\b"
)


# Mục (section) dành riêng cho một nhóm đối tượng. Câu hỏi KHÔNG nhắc nhóm đó -> chunk của mục bị trừ nhẹ điểm xếp hạng
# (không loại, cờ relevant vẫn theo cosine thô). Sửa lỗi: hỏi "người lớn ... bao nhiêu phút" lại ra mục người cao tuổi.
# Khớp trên văn bản đã bỏ dấu. (?<!and ) để "Adults and older adults with chronic conditions" không bị coi là mục người cao tuổi.
SECTION_AUDIENCES = {
    "older": (
        re.compile(r"(?<!and )older adults|aged 65|65 years and older|nguoi cao tuoi|nguoi tu 60 tuoi"),
        re.compile(r"cao tuoi|lon tuoi|nguoi gia|\bong (toi|noi|ngoai|ba)\b|\bba (toi|noi|ngoai)\b|ve huu|older|elderly|senior"),
    ),
    "child": (
        re.compile(r"children|adolescents|aged 5.17|preschool|tre em|nguoi tu 5 - 17|duoi 5 tuoi|infants"),
        re.compile(r"\btre (em|nho|so sinh)\b|\bcon (toi|cua toi|nho|gai|trai)\b|\bbe (trai|gai|nha)\b|\bem be\b|"
                   r"\bchau (toi|be)\b|hoc sinh|cap [123]\b|vi thanh nien|thieu nien|child|kid|teen|infant|baby"),
    ),
    "pregnant": (
        re.compile(r"pregnan|postpartum|mang thai|sau sinh"),
        re.compile(r"\bbau\b|mang thai|sau sinh|thai ky|pregnan|postpartum"),
    ),
    "disability": (
        re.compile(r"disabilit|khuyet tat"),
        re.compile(r"khuyet tat|disab|xe lan|wheelchair"),
    ),
}
AGE_RE = re.compile(r"(\d{1,3})\s*tuoi")


def query_audiences(query: str) -> set:
    """Các nhóm đối tượng câu hỏi nhắc tới (theo từ khóa và số tuổi: <18 -> trẻ em, >=60 -> người cao tuổi)."""
    q = strip_accents(query)
    found = {name for name, (_, kw) in SECTION_AUDIENCES.items() if kw.search(q)}
    for m in AGE_RE.finditer(q):
        age = int(m.group(1))
        found.add("child" if age < 18 else "older" if age >= 60 else "adult")
    return found


def section_audiences(chunk: Dict[str, Any]) -> set:
    sec = strip_accents(chunk.get("section") or "")
    return {name for name, (pat, _) in SECTION_AUDIENCES.items() if pat.search(sec)}


def detect_audiences(query: str, audiences: Optional[List[str]] = None) -> Optional[List[str]]:
    """Danh sách audience_group được phép tìm, hoặc None = không lọc.

    - Truyền `audiences` rõ ràng -> dùng đúng như vậy.
    - Câu hỏi có từ khóa về trẻ nhỏ -> tìm tất cả tài liệu.
    - Ngược lại -> chỉ tài liệu "general" (không để tài liệu dành cho trẻ nhỏ trả lời câu hỏi người lớn).
    """
    if audiences:
        return list(audiences)
    if INFANT_RE.search(strip_accents(query)):
        return None
    return ["general"]


def _where(lang: Optional[str], allowed: Optional[List[str]], doc_ids: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    conds: List[Dict[str, Any]] = []
    if lang is not None:
        conds.append({"lang": lang})
    if allowed is not None:
        conds.append({"audience_group": {"$in": allowed}})
    if doc_ids:
        conds.append({"doc_id": {"$in": list(doc_ids)}})
    if not conds:
        return None
    return conds[0] if len(conds) == 1 else {"$and": conds}


def retrieve(
    query: str,
    top_k: Optional[int] = None,
    collection: Optional[str] = None,
    audiences: Optional[List[str]] = None,
    rerank: bool = True,
    audience_filter: bool = True,
    per_lang: Optional[int] = None,
    lang_offset: bool = True,
    audience_penalty: Optional[float] = None,
    doc_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Trả {"chunks": [...], "reranked": bool, "threshold": float, "thresholds": dict, "audiences": list|None}.

    Mỗi chunk có: id, text, score (điểm rerank nếu có, ngược lại cosine thô), vector_score (cosine thô),
    rank_score (điểm dùng để xếp hạng), relevant (bool), threshold (ngưỡng áp cho chunk này),
    cùng metadata (doc_id, title, org, year, url, lang, section, heading, h1..h5, audience_group...).
    `lang_offset=False` bỏ độ lệch theo ngôn ngữ khi xếp hạng (để so sánh trong eval).
    `audience_penalty` ghi đè SECTION_AUDIENCE_PENALTY (0 = tắt).
    `doc_ids` chỉ tìm trong các tài liệu này (VD trích dẫn khuyến nghị WHO cho một chỉ số cụ thể).
    """
    top_k = top_k or config.TOP_K
    collection = collection or config.CHROMA_COLLECTION
    n_each = per_lang or config.RERANK_CANDIDATES_PER_LANG

    qvec = embedding.embed_queries([query])[0]
    allowed = detect_audiences(query, audiences) if audience_filter else None

    # Lấy ứng viên riêng cho từng ngôn ngữ để tài liệu tiếng Anh không bị tiếng Việt lấn át
    langs: List[Optional[str]] = list(vector_store.distinct_values("lang", collection)) or [None]

    def gather(audience_list: Optional[List[str]]) -> Dict[str, Dict[str, Any]]:
        found: Dict[str, Dict[str, Any]] = {}
        for lang in langs:
            for chunk in vector_store.search(qvec, n_each, collection, where=_where(lang, audience_list, doc_ids)):
                found[chunk["id"]] = chunk
        return found

    candidates = gather(allowed)
    if not candidates and allowed is not None:
        # Bộ lọc loại hết (VD collection cũ chưa có metadata audience_group): bỏ lọc để vẫn có kết quả
        allowed = None
        candidates = gather(None)
    cands = list(candidates.values())
    penalty = config.SECTION_AUDIENCE_PENALTY if audience_penalty is None else audience_penalty
    asked = query_audiences(query) if penalty else set()
    for c in cands:
        bonus = config.lang_offset(c.get("lang")) if lang_offset else 0.0
        if penalty and section_audiences(c) - asked:
            bonus -= penalty  # mục dành cho nhóm đối tượng mà câu hỏi không nhắc tới
        c["rank_score"] = round(c["vector_score"] + bonus, 4)
    cands.sort(key=lambda c: c["rank_score"], reverse=True)

    scores = reranker.rerank(query, [c["text"] for c in cands]) if (rerank and cands) else None
    reranked = scores is not None
    if reranked:
        for c, s in zip(cands, scores):
            c["score"] = round(s, 4)
            c["rank_score"] = c["score"]
        cands.sort(key=lambda c: c["rank_score"], reverse=True)

    chunks = cands[:top_k]
    for c in chunks:
        if reranked:
            threshold = config.RELEVANCE_THRESHOLD
            c["relevant"] = c["score"] >= threshold
        else:
            threshold = config.vector_threshold(c.get("lang"))
            c["relevant"] = c["vector_score"] >= threshold
        c["threshold"] = threshold

    if reranked:
        base, per = config.RELEVANCE_THRESHOLD, {}
    else:
        base = config.VECTOR_RELEVANCE_THRESHOLD
        per = {str(l): config.vector_threshold(l) for l in langs if l is not None}
    return {"chunks": chunks, "reranked": reranked, "threshold": base, "thresholds": per, "audiences": allowed}
