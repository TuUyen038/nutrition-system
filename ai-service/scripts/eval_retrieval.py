"""Đánh giá tầng truy xuất: Hit@K, Recall@K, MRR + độ trễ p50/p95 (không gọi LLM).

Dùng đúng quy trình truy xuất của API (lọc đối tượng -> ứng viên theo ngôn ngữ -> độ lệch ngôn ngữ -> rerank tùy chọn),
nên số liệu phản ánh chatbot thật. Tắt từng thành phần để xem nó đóng góp bao nhiêu.

File câu hỏi (jsonl), mỗi dòng:
    {"question": "...", "relevant": [{"doc_id": "who_healthy_diet", "section": "Carbohydrates"}],
     "accept": [{"doc_id": "an_rau_qua_dung_cach", "section": ""}]}
`section` là chuỗi con của đường dẫn mục trong chunk (bỏ trống = chỉ cần đúng tài liệu).
`relevant`: các mục CẦN tìm thấy (Recall tính trên danh sách này).
`accept` (tùy chọn): các mục thay thế cũng được chấp nhận, VD cùng đáp án nằm ở tài liệu tiếng Việt.
Khi có `accept`, câu hỏi được coi là một mục tiêu duy nhất, đạt nếu chunk khớp BẤT KỲ mục nào trong relevant + accept.

Ví dụ:
    python scripts/eval_retrieval.py --ks 1 5 20
    python scripts/eval_retrieval.py --no-lang-offset           # bỏ độ lệch ngôn ngữ khi xếp hạng
    python scripts/eval_retrieval.py --rerank                   # bật rerank (mặc định tắt)
    python scripts/eval_retrieval.py --no-audience-filter --verbose
    python scripts/eval_retrieval.py --collection kb_path       # so sánh với collection khác
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, embedding, reranker, retriever  # noqa: E402


def matches(chunk: dict, rel: dict) -> bool:
    if chunk.get("doc_id") != rel["doc_id"]:
        return False
    sec = rel.get("section")
    return not sec or sec.lower() in (chunk.get("section") or "").lower()


def covered_count(top: list, rels: list, alts: list) -> int:
    """Số mục tiêu được phủ trong `top`. Có accept -> chỉ 1 mục tiêu, đạt nếu khớp relevant hoặc accept."""
    if alts:
        group = rels + alts
        return 1 if any(matches(c, r) for c in top for r in group) else 0
    return sum(1 for r in rels if any(matches(c, r) for c in top))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", type=Path, default=config.EVAL_DIR / "retrieval_qa.jsonl")
    ap.add_argument("--collection", default=config.CHROMA_COLLECTION)
    ap.add_argument("--ks", type=int, nargs="+", default=[1, 3, 5])
    ap.add_argument("--rerank", action="store_true", help="bật rerank (mặc định tắt)")
    ap.add_argument("--no-lang-offset", action="store_true", help="bỏ độ lệch điểm theo ngôn ngữ khi xếp hạng")
    ap.add_argument("--no-audience-filter", action="store_true", help="không lọc tài liệu theo đối tượng")
    ap.add_argument("--verbose", action="store_true", help="in các câu truy xuất sai")
    args = ap.parse_args()

    rows = [json.loads(l) for l in args.file.read_text(encoding="utf-8").splitlines() if l.strip()]
    max_k = max(args.ks)
    hits = {k: 0 for k in args.ks}
    recalls = {k: 0.0 for k in args.ks}
    rr_sum, latencies = 0.0, []
    en_chunks, all_chunks = 0, 0
    by_style = {}

    def run(question):
        return retriever.retrieve(
            question,
            top_k=max_k,
            collection=args.collection,
            rerank=args.rerank,
            audience_filter=not args.no_audience_filter,
            lang_offset=not args.no_lang_offset,
            # đủ ứng viên để lấy được top-K lớn
            per_lang=max(config.RERANK_CANDIDATES_PER_LANG, max_k),
        )

    embedding.get_model()
    if args.rerank:
        reranker.preload()
    run("warmup")  # không tính thời gian nạp model vào latency

    reranked = False
    for row in rows:
        t0 = time.perf_counter()
        result = run(row["question"])
        latencies.append((time.perf_counter() - t0) * 1000)
        chunks, reranked = result["chunks"], result["reranked"]

        rels, alts = row["relevant"], row.get("accept", [])
        group = rels + alts
        first_rank = next(
            (i + 1 for i, c in enumerate(chunks) if any(matches(c, r) for r in group)), None
        )
        rr_sum += 1.0 / first_rank if first_rank else 0.0
        target = len(rels) if not alts else 1
        for k in args.ks:
            top = chunks[:k]
            covered = covered_count(top, rels, alts)
            hits[k] += 1 if covered else 0
            recalls[k] += covered / target

        st = by_style.setdefault(row.get("style", "goc"), {"n": 0, "h1": 0, "h5": 0, "rr": 0.0})
        st["n"] += 1
        st["h1"] += 1 if covered_count(chunks[:1], rels, alts) else 0
        st["h5"] += 1 if covered_count(chunks[:5], rels, alts) else 0
        st["rr"] += 1.0 / first_rank if first_rank else 0.0

        top5 = chunks[:5]
        all_chunks += len(top5)
        en_chunks += sum(1 for c in top5 if c.get("lang") == "en")
        if args.verbose:
            print(f"\n{'=' * 100}")
            print(f"QUESTION: {row['question']}")

            for rank, c in enumerate(chunks[:3], start=1):
                print(f"\n[TOP {rank}]")
                print(f"Score: {c.get('score', 0):.3f}")
                print(f"Language: {c.get('lang')}")
                print(f"Document: {c.get('doc_id')}")
                print(f"Section: {c.get('heading') or c.get('section')}")

                print("\nCONTENT:")
                print(c.get("text", "Không có nội dung"))

                print("-" * 100)
    n = len(rows)
    mode = "rerank" if reranked else "chỉ vector"
    extras = ""
    if args.no_lang_offset:
        extras += " | không độ lệch ngôn ngữ"
    if args.no_audience_filter:
        extras += " | không lọc đối tượng"
    print(f"\nCollection: {args.collection} | {n} câu hỏi | {mode}{extras}")
    for k in args.ks:
        print(f"  Hit@{k}: {hits[k] / n:.3f}   Recall@{k}: {recalls[k] / n:.3f}")
    print(f"  MRR@{max_k}: {rr_sum / n:.3f}")
    if len(by_style) > 1:
        print("  Theo kiểu câu hỏi ('goc' = sát chữ trong tài liệu; các kiểu khác = diễn đạt lệch chữ):")
        for s in sorted(by_style, key=lambda x: (x != "goc", x)):
            v = by_style[s]
            print(f"    {s:<13} n={v['n']:<3} Hit@1 {v['h1'] / v['n']:.3f}  Hit@5 {v['h5'] / v['n']:.3f}  MRR {v['rr'] / v['n']:.3f}")
    if all_chunks:
        print(f"  Tỷ lệ chunk tiếng Anh trong top-5: {en_chunks / all_chunks:.0%}")
    print(f"  Latency p50={np.percentile(latencies, 50):.0f}ms  p95={np.percentile(latencies, 95):.0f}ms")


if __name__ == "__main__":
    main()
