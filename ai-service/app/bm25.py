"""BM25 thuần Python (không thêm thư viện) trên văn bản ĐÃ BỎ DẤU.

Dùng để bổ sung cho vector khi câu hỏi tiếng Việt gõ không dấu: bge-m3 hiểu kém loại câu này nhưng khớp từ khóa
trên văn bản đã bỏ dấu (cả câu hỏi lẫn chunk) vẫn hoạt động. Chỉ mục dựng trong bộ nhớ từ collection, cache theo
(collection, số chunk) nên ingest lại thì tự dựng lại.
"""
import math
import re
import unicodedata
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple


def strip_accents(text: str) -> str:
    """Bỏ dấu tiếng Việt, đ -> d, chữ thường (giống intent_router.strip_accents, không kéo theo model embedding)."""
    text = text.replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn").lower()


K1 = 1.5
B = 0.75
TOKEN_RE = re.compile(r"[a-z0-9]+")

# Ký tự có dấu tiếng Việt (nếu câu hỏi chứa một ký tự này thì KHÔNG phải câu không dấu)
VI_DIACRITICS = set("àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ")
# Từ tiếng Việt không dấu thường gặp (không trùng từ tiếng Anh phổ biến). Cần >= 2 từ khớp mới coi là tiếng Việt.
VI_WORDS = {
    "khong", "nhieu", "bao", "nguoi", "thi", "moi", "ngay", "nen", "duoc", "cua", "sao", "nao", "lam", "tre",
    "thieu", "tuoi", "gi", "bi", "muon", "dung", "hay", "an", "uong", "de", "bo", "sung", "co", "can", "giam",
    "tap", "voi", "cho", "mot", "nhung", "la", "va", "khi", "rat", "nhat", "cao", "thap", "bao", "nhieu",
}


# Từ chức năng (tiếng Việt không dấu + tiếng Anh) bỏ khỏi chỉ mục và câu hỏi để từ khóa nội dung (ephedra, muoi, sat...) trội hơn
STOPWORDS = {
    "la", "va", "cua", "co", "khong", "nhu", "the", "nao", "gi", "bao", "nhieu", "cho", "thi", "bi", "de", "moi",
    "nen", "duoc", "mot", "nhung", "cac", "khi", "hay", "sao", "chua", "voi", "trong", "ve", "tu", "den", "o",
    "a", "of", "and", "or", "to", "in", "is", "are", "for", "on", "with", "the", "by", "as", "be",
}


def tokens(text: str) -> List[str]:
    """Từ đơn + cặp từ liền kề (bigram) trên văn bản đã bỏ dấu, chữ thường, đã bỏ từ chức năng."""
    words = [w for w in TOKEN_RE.findall(strip_accents(text or "")) if w not in STOPWORDS]
    return words + [f"{a}_{b}" for a, b in zip(words, words[1:])]


def is_unaccented_vietnamese(query: str) -> bool:
    """Câu hỏi không có dấu tiếng Việt nhưng có >= 2 từ tiếng Việt thường gặp."""
    q = (query or "").lower()
    if any(ch in VI_DIACRITICS for ch in q):
        return False
    words = set(TOKEN_RE.findall(q))
    return len(words & VI_WORDS) >= 2


class Index:
    def __init__(self, ids: List[str], texts: List[str], metas: List[Dict[str, Any]]):
        self.ids, self.texts, self.metas = ids, texts, metas
        self.postings: Dict[str, List[Tuple[int, int]]] = defaultdict(list)
        self.lengths: List[int] = []
        for i, text in enumerate(texts):
            toks = tokens(text)
            self.lengths.append(len(toks))
            for term, tf in Counter(toks).items():
                self.postings[term].append((i, tf))
        self.n = len(texts)
        self.avgdl = (sum(self.lengths) / self.n) if self.n else 0.0

    def search(self, query: str, top_n: int, allowed_idx: Optional[set] = None) -> List[Tuple[int, float]]:
        scores: Dict[int, float] = defaultdict(float)
        for term in set(tokens(query)):
            plist = self.postings.get(term)
            if not plist:
                continue
            idf = math.log(1 + (self.n - len(plist) + 0.5) / (len(plist) + 0.5))
            for i, tf in plist:
                if allowed_idx is not None and i not in allowed_idx:
                    continue
                norm = tf + K1 * (1 - B + B * self.lengths[i] / (self.avgdl or 1.0))
                scores[i] += idf * tf * (K1 + 1) / norm
        return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:top_n]


_cache: Dict[str, Tuple[int, Index]] = {}


def get_index(collection_name: Optional[str] = None) -> Optional[Index]:
    from . import config, vector_store
    name = collection_name or config.CHROMA_COLLECTION
    try:
        col = vector_store.get_collection(name, create=False)
    except Exception:
        return None
    count = col.count()
    if count == 0:
        return None
    cached = _cache.get(name)
    if cached and cached[0] == count:
        return cached[1]
    data = col.get(include=["documents", "metadatas"])
    index = Index(list(data["ids"]), list(data["documents"]), [m or {} for m in data["metadatas"]])
    _cache[name] = (count, index)
    return index


def search(
    query: str,
    top_n: int,
    collection_name: Optional[str] = None,
    audiences: Optional[List[str]] = None,
    doc_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Trả các chunk xếp theo BM25 giảm dần: {id, text, bm25_score, **metadata}. Lọc đối tượng/tài liệu như vector."""
    index = get_index(collection_name)
    if index is None:
        return []
    allowed = None
    if audiences is not None or doc_ids:
        allowed = {
            i for i, m in enumerate(index.metas)
            if (audiences is None or m.get("audience_group") in audiences)
            and (not doc_ids or m.get("doc_id") in doc_ids)
        }
    out = []
    for i, s in index.search(query, top_n, allowed):
        out.append({"id": index.ids[i], "text": index.texts[i], "bm25_score": round(s, 4), **index.metas[i]})
    return out
