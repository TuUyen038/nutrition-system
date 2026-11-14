"""Kiểm tra câu trả lời của LLM có bám vào nguồn RAG hay không (chống ảo giác).

Không gọi LLM. Ba lớp kiểm tra:
  1. Trích dẫn: mọi [Sx] trong câu trả lời phải là nguồn có thật trong lượt này.
  2. Số liệu: mọi con số trong câu trả lời phải xuất hiện trong nguồn được trích của câu đó
     (hoặc trong `allowed_context`: câu hỏi, hồ sơ user, dữ liệu DB của user).
     Câu có số liệu mà không có [Sx] cũng là lỗi.
  3. Ngữ nghĩa (tùy chọn): cosine giữa câu và chunk được trích, thấp hơn ngưỡng thì cảnh báo.

Mức độ:
  - error   : invalid_citation, unsupported_number, uncited_number  -> câu trả lời KHÔNG đạt
  - warning : number_in_other_source, low_semantic_support, uncited_recommendation -> chỉ ghi nhận

Kết quả có `fixed_answer`: bỏ các câu có số liệu không có trong nguồn hoặc trích dẫn sai,
tự gắn [Sx] cho câu có số liệu đúng nhưng quên trích dẫn. Node dùng bản này khi LLM sửa lại vẫn lỗi.

Phần 1-2 chỉ dùng thư viện chuẩn (chạy được trong script eval, unit test mà không cần tải model).
"""
import re
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from . import config

CITATION_RE = re.compile(r"\[\s*(S\d+(?:\s*[,;]\s*S\d+)*)\s*\]", re.IGNORECASE)
# 10.000 | 10,000 | 2,5 | 2.5 | 150
NUMBER_RE = re.compile(r"(?<![\w.,])\d+(?:[.,]\d+)*")
LIST_MARKER_RE = re.compile(r"^(\s*(?:[-*•+]|\d{1,2}[.)])\s+)")
HEADING_RE = re.compile(r"^\s*#{1,6}\s")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?;:])\s+")
# Từ cho thấy câu đang đưa ra khuyến nghị (cần nguồn), dùng cho cảnh báo uncited_recommendation
RECOMMEND_RE = re.compile(
    r"\b(khuyến nghị|khuyen nghi|nên|không nên|tối thiểu|tối đa|ít nhất|recommend\w*|should|at least)\b",
    re.IGNORECASE,
)

ERROR_ISSUES = {"invalid_citation", "unsupported_number", "uncited_number"}


# ─── Số liệu ──────────────────────────────────────────────────────────────────

def _parse_number(token: str) -> Optional[float]:
    """'10.000' / '10,000' -> 10000; '2,5' / '2.5' -> 2.5; '1.5.2' -> None."""
    if re.fullmatch(r"\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*", token):
        # Nhóm hàng nghìn (cả kiểu VN lẫn EN). '1.500' cũng hiểu là 1500.
        return float(re.sub(r"[.,]", "", token))
    if re.fullmatch(r"\d+", token):
        return float(token)
    if re.fullmatch(r"\d+[.,]\d+", token):
        return float(token.replace(",", "."))
    return None


def extract_numbers(text: str) -> Set[float]:
    text = CITATION_RE.sub(" ", text or "")
    out: Set[float] = set()
    for m in NUMBER_RE.finditer(text):
        value = _parse_number(m.group(0))
        if value is not None:
            out.add(value)
    return out


def _ignored_numbers() -> Set[float]:
    return {float(x) for x in config.GROUNDING_IGNORE_NUMBERS}


def _fmt(n: float) -> str:
    return str(int(n)) if n == int(n) else str(n)


# ─── Tách câu ─────────────────────────────────────────────────────────────────

def _split_line(line: str) -> Tuple[str, List[str]]:
    """Trả (tiền tố markdown như '- ' / '1. ', danh sách câu). Câu chỉ gồm trích dẫn được gộp vào câu trước."""
    prefix = ""
    m = LIST_MARKER_RE.match(line)
    if m:
        prefix, line = m.group(1), line[m.end():]
    parts = [p for p in SENTENCE_SPLIT_RE.split(line.strip()) if p]
    sentences: List[str] = []
    for p in parts:
        if sentences and not CITATION_RE.sub("", p).strip(" .,;:"):
            sentences[-1] = f"{sentences[-1]} {p}"
        else:
            sentences.append(p)
    return prefix, sentences


def _citations(sentence: str) -> List[str]:
    ids: List[str] = []
    for m in CITATION_RE.finditer(sentence):
        for sid in re.split(r"\s*[,;]\s*", m.group(1)):
            sid = sid.strip().upper()
            if sid not in ids:
                ids.append(sid)
    return ids


# ─── Kiểm tra ─────────────────────────────────────────────────────────────────

def _source_text(src: Dict[str, Any]) -> str:
    # Năm/tên tài liệu nằm trong metadata, không nằm trong chunk -> cho phép trích luôn.
    return " ".join(str(src.get(k) or "") for k in ("text", "title", "org", "year", "section"))


def _semantic_scores(pairs: List[Tuple[str, List[Dict[str, Any]]]]) -> List[Optional[Tuple[float, float]]]:
    """(cosine tốt nhất, ngưỡng áp dụng) cho từng (câu, các nguồn được trích)."""
    from . import embedding  # import muộn: không cần model khi tắt kiểm tra ngữ nghĩa

    todo = [(i, s, srcs) for i, (s, srcs) in enumerate(pairs) if srcs]
    out: List[Optional[Tuple[float, float]]] = [None] * len(pairs)
    if not todo:
        return out
    qv = embedding.embed_queries([CITATION_RE.sub("", s) for _, s, _ in todo])
    texts: List[str] = []
    index: Dict[str, int] = {}
    for _, _, srcs in todo:
        for src in srcs:
            if src["id"] not in index:
                index[src["id"]] = len(texts)
                texts.append(src.get("text") or "")
    pv = embedding.embed_passages(texts)
    for row, (i, _, srcs) in enumerate(todo):
        best, thr = -1.0, config.GROUNDING_SIM_THRESHOLD
        for src in srcs:
            sim = float(qv[row] @ pv[index[src["id"]]])
            # Câu tiếng Việt vs chunk tiếng Anh có cosine thấp hơn dù cùng nội dung -> hạ ngưỡng tương ứng
            t = config.GROUNDING_SIM_THRESHOLD - config.lang_offset(src.get("lang"))
            if sim - t > best - thr:
                best, thr = sim, t
        out[i] = (round(best, 4), round(thr, 4))
    return out


def verify(
    answer: str,
    sources: Iterable[Dict[str, Any]],
    allowed_context: Optional[Iterable[str]] = None,
    semantic: Optional[bool] = None,
) -> Dict[str, Any]:
    """sources: [{"id": "S1", "text": "...", "title", "org", "year", "lang", ...}]"""
    semantic = config.GROUNDING_SEMANTIC if semantic is None else semantic
    src_by_id = {str(s["id"]).upper(): s for s in sources if s.get("id")}
    src_numbers = {sid: extract_numbers(_source_text(s)) for sid, s in src_by_id.items()}
    all_src_numbers: Set[float] = set().union(*src_numbers.values()) if src_numbers else set()
    allowed = _ignored_numbers()
    for ctx in allowed_context or []:
        allowed |= extract_numbers(ctx)

    lines = (answer or "").splitlines()
    records: List[Dict[str, Any]] = []
    layout: List[Tuple[str, List[int]]] = []  # mỗi dòng: (tiền tố, chỉ số câu)

    for line in lines:
        if not line.strip() or HEADING_RE.match(line):
            layout.append((line, []))  # giữ nguyên dòng trống / heading
            continue
        prefix, sentences = _split_line(line)
        idxs = []
        for s in sentences:
            idxs.append(len(records))
            records.append(_check_sentence(s, src_by_id, src_numbers, all_src_numbers, allowed))
        layout.append((prefix, idxs))

    if semantic and src_by_id:
        pairs = [
            (r["text"], [src_by_id[c] for c in r["citations"] if c in src_by_id]) for r in records
        ]
        try:
            for r, sc in zip(records, _semantic_scores(pairs)):
                if sc is None:
                    continue
                r["support"], r["support_threshold"] = sc
                if sc[0] < sc[1]:
                    r["issues"].append({"type": "low_semantic_support", "severity": "warning",
                                        "detail": f"cosine {sc[0]} < {sc[1]}"})
        except Exception as exc:  # model chưa nạp được: bỏ qua lớp này, không làm hỏng kết quả
            semantic = False
            print(f"[grounding] Bỏ qua kiểm tra ngữ nghĩa: {exc}")

    for r in records:
        r["ok"] = not any(i["severity"] == "error" for i in r["issues"])

    claims = [r for r in records if r["is_claim"]]
    errors = [dict(i, sentence=r["text"]) for r in records for i in r["issues"] if i["severity"] == "error"]
    warnings = [dict(i, sentence=r["text"]) for r in records for i in r["issues"] if i["severity"] == "warning"]
    used = sorted({c for r in records for c in r["citations"] if c in src_by_id}, key=lambda x: int(x[1:]))

    return {
        "passed": not errors,
        "support_ratio": round(sum(r["ok"] for r in claims) / len(claims), 4) if claims else 1.0,
        "claims": len(claims),
        "errors": errors,
        "warnings": warnings,
        "unsupported_numbers": sorted({n for r in records for n in r["unsupported_numbers"]}),
        "used_citations": used,
        "semantic_checked": bool(semantic and src_by_id),
        "sentences": records,
        "fixed_answer": _rebuild(layout, records),
    }


def _check_sentence(
    sentence: str,
    src_by_id: Dict[str, Dict[str, Any]],
    src_numbers: Dict[str, Set[float]],
    all_src_numbers: Set[float],
    allowed: Set[float],
) -> Dict[str, Any]:
    cites = _citations(sentence)
    valid = [c for c in cites if c in src_by_id]
    numbers = sorted(n for n in extract_numbers(sentence) if n not in allowed)
    issues: List[Dict[str, Any]] = []
    unsupported: List[str] = []
    suggested: List[str] = []

    for c in cites:
        if c not in src_by_id:
            issues.append({"type": "invalid_citation", "severity": "error", "detail": f"[{c}] không tồn tại"})

    cited_numbers: Set[float] = set().union(*(src_numbers[c] for c in valid)) if valid else set()
    for n in numbers:
        if n in cited_numbers:
            continue
        holders = [sid for sid, nums in src_numbers.items() if n in nums]
        if not holders:
            unsupported.append(_fmt(n))
            issues.append({"type": "unsupported_number", "severity": "error",
                           "detail": f"số {_fmt(n)} không có trong nguồn nào"})
        elif valid:
            issues.append({"type": "number_in_other_source", "severity": "warning",
                           "detail": f"số {_fmt(n)} nằm ở {', '.join(holders)}, không ở nguồn được trích"})
            suggested += [h for h in holders if h not in suggested]
        else:
            suggested += [h for h in holders if h not in suggested]

    if numbers and not cites:
        issues.append({"type": "uncited_number", "severity": "error",
                       "detail": "câu có số liệu nhưng không có [Sx]"})
    elif not numbers and not cites and RECOMMEND_RE.search(sentence) and src_by_id:
        issues.append({"type": "uncited_recommendation", "severity": "warning",
                       "detail": "câu khuyến nghị nhưng không có [Sx]"})

    return {
        "text": sentence,
        "citations": cites,
        "numbers": [_fmt(n) for n in numbers],
        "unsupported_numbers": unsupported,
        "suggested_citations": suggested,
        "is_claim": bool(numbers or cites),
        "issues": issues,
    }


def _rebuild(layout: List[Tuple[str, List[int]]], records: List[Dict[str, Any]]) -> str:
    out: List[str] = []
    for prefix, idxs in layout:
        if not idxs:
            out.append(prefix)
            continue
        kept: List[str] = []
        for i in idxs:
            r = records[i]
            types = {x["type"] for x in r["issues"]}
            if types & {"unsupported_number", "invalid_citation"}:
                continue  # bỏ câu chứa số bịa hoặc trích nguồn không tồn tại
            text = r["text"]
            if "uncited_number" in types:
                if not r["suggested_citations"]:
                    continue
                tag = "[" + ", ".join(r["suggested_citations"]) + "]"
                m = re.search(r"[.!?;:]$", text)
                text = f"{text[:-1]} {tag}{text[-1]}" if m else f"{text} {tag}"
            kept.append(text)
        if kept:
            out.append(prefix + " ".join(kept))
    # gộp nhiều dòng trống liên tiếp do bỏ câu
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()
    return text
