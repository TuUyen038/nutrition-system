"""Lõi đánh giá định lượng tầng truy xuất (dùng chung cho scripts/eval_retrieval.py và scripts/eval_ablation.py).

Định dạng câu hỏi (jsonl), mỗi dòng:
    {"question": "...",
     "relevant": [{"doc_id": "who_physical_activity_2020", "section": "Adults (aged 18–64 years) – physical activity"}],
     "accept":   [{"doc_id": "cam_nang_hoat_dong_the_luc_2026", "section": "Người từ 18 - 59 tuổi: khuyến cáo"}],
     "topic": "who", "audience": "adult", "style": "goc"}
    {"question": "...", "expect": "none", "topic": "ngoai_kb"}         # KB không có đáp án

`section` là chuỗi con của đường dẫn mục của chunk (bỏ trống = cả tài liệu).
Mức liên quan của một chunk (graded relevance): 2 = khớp `relevant`, 1 = khớp `accept`, 0 = không liên quan.

Chỉ số cho câu có đáp án (K = mỗi giá trị trong ks):
  Hit@K        top-K có ít nhất 1 chunk liên quan
  Recall@K     tỷ lệ mục `relevant` được phủ (có `accept` -> cả câu là 1 mục tiêu, đạt nếu khớp bất kỳ)
  Precision@K  tỷ lệ chunk liên quan trong top-K
  nDCG@K       DCG = sum (2^g - 1) / log2(i + 1); IDCG lấy từ mọi chunk liên quan có trong collection
  AP@K -> MAP  average precision trên top-K
  MRR          1 / hạng của chunk liên quan đầu tiên
  Usable@K     có chunk liên quan trong top-K VÀ chunk đó vượt ngưỡng `relevant` -> LLM thật sự nhận được nó
               (Node chỉ gửi chunk relevant cho Gemini; Hit cao mà Usable thấp = ngưỡng đang quá cao)
Câu "none": Reject@K = không chunk nào trong top-K vượt ngưỡng (từ chối đúng).
"""
import hashlib
import json
import math
import subprocess
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from . import config, vector_store


def load_rows(path: Path) -> List[Dict[str, Any]]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def matches(chunk: Dict[str, Any], label: Dict[str, Any]) -> bool:
    if chunk.get("doc_id") != label["doc_id"]:
        return False
    sec = label.get("section")
    return not sec or sec.lower() in (chunk.get("section") or "").lower()


def grade(chunk: Dict[str, Any], row: Dict[str, Any]) -> int:
    if any(matches(chunk, r) for r in row.get("relevant", [])):
        return 2
    if any(matches(chunk, r) for r in row.get("accept", [])):
        return 1
    return 0


def covered(top: List[Dict[str, Any]], row: Dict[str, Any]) -> float:
    rels, alts = row.get("relevant", []), row.get("accept", [])
    if alts:
        return 1.0 if any(grade(c, row) for c in top) else 0.0
    return sum(1 for r in rels if any(matches(c, r) for c in top)) / len(rels) if rels else 0.0


class CorpusIndex:
    """Metadata mọi chunk trong collection: để tính IDCG (số chunk liên quan thật sự có trong kho) và kiểm tra nhãn."""

    def __init__(self, collection: str):
        col = vector_store.get_collection(collection, create=False)
        metas = col.get(include=["metadatas"]).get("metadatas") or []
        self.metas = [m for m in metas if m]

    def ideal_grades(self, row: Dict[str, Any]) -> List[int]:
        return sorted((g for g in (grade(m, row) for m in self.metas) if g), reverse=True)

    def dangling_labels(self, row: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Nhãn không khớp chunk nào trong kho (gõ sai section / tài liệu chưa nạp)."""
        return [l for l in row.get("relevant", []) + row.get("accept", []) if not any(matches(m, l) for m in self.metas)]


def _dcg(grades: List[int]) -> float:
    return sum((2 ** g - 1) / math.log2(i + 2) for i, g in enumerate(grades))


def score_question(row, chunks, ks, ideal, usable_k=5) -> Dict[str, Any]:
    grades = [grade(c, row) for c in chunks]
    flags = [bool(c.get("relevant")) for c in chunks]
    first = next((i + 1 for i, g in enumerate(grades) if g), None)
    m: Dict[str, Any] = {"rr": 1.0 / first if first else 0.0, "first_rank": first}
    for k in ks:
        g = grades[:k]
        n_rel = sum(1 for x in g if x)
        m[f"hit@{k}"] = 1.0 if n_rel else 0.0
        m[f"recall@{k}"] = covered(chunks[:k], row)
        m[f"precision@{k}"] = n_rel / k
        idcg = _dcg(ideal[:k])
        m[f"ndcg@{k}"] = _dcg(g) / idcg if idcg else 0.0
        hits, ap = 0, 0.0
        for i, x in enumerate(g):
            if x:
                hits += 1
                ap += hits / (i + 1)
        denom = min(k, len(ideal))
        m[f"ap@{k}"] = ap / denom if denom else 0.0
    m[f"usable@{usable_k}"] = 1.0 if any(g and f for g, f in zip(grades[:usable_k], flags[:usable_k])) else 0.0
    return m


def apply_thresholds(chunks: List[Dict[str, Any]], thresholds: Optional[Dict[str, float]]) -> None:
    """Giả lập ngưỡng khác (không cần sửa .env): tính lại cờ relevant từ cosine thô theo ngôn ngữ chunk."""
    if not thresholds:
        return
    for c in chunks:
        lang = (c.get("lang") or "").lower()
        thr = thresholds.get(lang, thresholds.get("*", config.vector_threshold(lang)))
        c["relevant"] = c["vector_score"] >= thr
        c["threshold"] = thr


def run(
    rows: List[Dict[str, Any]],
    retrieve: Callable[[str], Dict[str, Any]],
    ks: List[int],
    corpus: CorpusIndex,
    thresholds: Optional[Dict[str, float]] = None,
    usable_k: int = 5,
) -> Dict[str, Any]:
    """retrieve(question) -> kết quả của retriever.retrieve (top-K >= max(ks)). Trả {summary, breakdown, questions}."""
    per_q, latencies = [], []
    for row in rows:
        t0 = time.perf_counter()
        res = retrieve(row["question"])
        latencies.append((time.perf_counter() - t0) * 1000)
        chunks = res["chunks"]
        apply_thresholds(chunks, thresholds)
        item = {
            "question": row["question"],
            "topic": row.get("topic", ""),
            "audience": row.get("audience", ""),
            "style": row.get("style", "goc"),
            "top": [
                {"doc_id": c.get("doc_id"), "section": c.get("section"), "lang": c.get("lang"),
                 "vector_score": c.get("vector_score"), "relevant": bool(c.get("relevant")), "grade": grade(c, row)}
                for c in chunks[: max(ks)]
            ],
        }
        if row.get("expect") == "none":
            item["kind"] = "none"
            item["reject@5"] = 0.0 if any(c.get("relevant") for c in chunks[:usable_k]) else 1.0
        else:
            item["kind"] = "answerable"
            item.update(score_question(row, chunks, ks, corpus.ideal_grades(row), usable_k))
        per_q.append(item)

    return {"summary": summarize(per_q, ks, usable_k, latencies), "breakdown": breakdown(per_q, ks, usable_k),
            "questions": per_q}


def _metric_names(ks, usable_k):
    names = []
    for k in ks:
        names += [f"hit@{k}", f"recall@{k}", f"precision@{k}", f"ndcg@{k}", f"ap@{k}"]
    return names + ["rr", f"usable@{usable_k}"]


def _mean(items, key):
    vals = [it[key] for it in items if key in it]
    return round(sum(vals) / len(vals), 4) if vals else None


def summarize(per_q, ks, usable_k, latencies=None) -> Dict[str, Any]:
    ans = [q for q in per_q if q["kind"] == "answerable"]
    none = [q for q in per_q if q["kind"] == "none"]
    out: Dict[str, Any] = {"n_answerable": len(ans), "n_none": len(none)}
    for name in _metric_names(ks, usable_k):
        label = "mrr" if name == "rr" else name.replace("ap@", "map@")
        out[label] = _mean(ans, name)
    out["reject@5"] = _mean(none, "reject@5")
    if ans:
        en = sum(1 for q in ans for c in q["top"][:5] if c["lang"] == "en")
        out["en_share@5"] = round(en / sum(len(q["top"][:5]) for q in ans), 4)
    if latencies:
        s = sorted(latencies)
        out["latency_p50_ms"] = round(s[len(s) // 2], 1)
        out["latency_p95_ms"] = round(s[min(len(s) - 1, int(len(s) * 0.95))], 1)
    return out


def breakdown(per_q, ks, usable_k) -> Dict[str, Dict[str, Any]]:
    k5 = 5 if 5 in ks else max(ks)
    out: Dict[str, Dict[str, Any]] = {}
    for field in ("style", "topic", "audience"):
        groups = defaultdict(list)
        for q in per_q:
            if q["kind"] == "answerable" and q.get(field):
                groups[q[field]].append(q)
        out[field] = {
            g: {"n": len(items), "hit@1": _mean(items, "hit@1"), f"hit@{k5}": _mean(items, f"hit@{k5}"),
                f"ndcg@{k5}": _mean(items, f"ndcg@{k5}"), "mrr": _mean(items, "rr"),
                f"usable@{usable_k}": _mean(items, f"usable@{usable_k}")}
            for g, items in sorted(groups.items())
        }
    return out


def run_metadata(datasets: List[Path], collection: str, options: Dict[str, Any]) -> Dict[str, Any]:
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                                cwd=config.BASE_DIR, timeout=5).stdout.strip()
    except Exception:
        commit = ""
    return {
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "git_commit": commit,
        "files": [d.name for d in datasets],
        # Đổi câu hỏi/nhãn -> hash đổi: chỉ so sánh hai lần chạy có cùng hash
        "dataset_sha256": {d.name: hashlib.sha256(d.read_bytes()).hexdigest()[:16] for d in datasets},
        "collection": collection,
        "embed_model": config.EMBED_MODEL,
        "thresholds": {"default": config.VECTOR_RELEVANCE_THRESHOLD, **config.VECTOR_RELEVANCE_THRESHOLDS},
        "lang_offsets": config.LANG_SCORE_OFFSETS,
        **options,
    }
