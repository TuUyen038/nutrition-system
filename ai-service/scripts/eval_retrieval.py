"""Đánh giá định lượng tầng truy xuất (không gọi LLM): Hit, Recall, Precision, nDCG, MAP, MRR, Usable, Reject, độ trễ.

Dùng đúng quy trình truy xuất của API (lọc đối tượng -> ứng viên theo ngôn ngữ -> độ lệch ngôn ngữ -> rerank tùy chọn
-> cờ relevant theo ngưỡng), nên số liệu phản ánh chatbot thật. Định nghĩa từng chỉ số: xem app/evaluation.py.

Bộ câu hỏi (data/eval/):
  retrieval_exercise.jsonl  vận động / tập luyện: WHO 2020, WHO fact sheet, ACSM 2026, HHS 2018, Bộ Y tế (+ câu ngoài kho)
  retrieval_qa.jsonl        dinh dưỡng + vận động (bộ cũ)

Ví dụ:
    python scripts/eval_retrieval.py                                   # cả hai bộ, K = 1 3 5 10
    python scripts/eval_retrieval.py --file data/eval/retrieval_exercise.jsonl --verbose
    python scripts/eval_retrieval.py --thresholds vi=0.59 en=0.54      # thử ngưỡng khác, không cần sửa .env
    python scripts/eval_retrieval.py --save baseline                   # lưu data/eval/results/baseline.json
    python scripts/eval_retrieval.py --compare data/eval/results/baseline.json
    python scripts/eval_retrieval.py --no-lang-offset | --no-audience-filter | --rerank | --collection kb_x
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, embedding, evaluation, reranker, retriever  # noqa: E402

DEFAULT_FILES = [config.EVAL_DIR / "retrieval_exercise.jsonl", config.EVAL_DIR / "retrieval_qa.jsonl"]
RESULTS_DIR = config.EVAL_DIR / "results"


def parse_thresholds(items):
    """['vi=0.59', 'en=0.54'] -> {'vi': 0.59, 'en': 0.54}; '*=0.6' áp cho mọi ngôn ngữ."""
    out = {}
    for item in items or []:
        lang, _, value = item.partition("=")
        out[lang.strip().lower()] = float(value)
    return out


def add_args(ap: argparse.ArgumentParser):
    ap.add_argument("--file", type=Path, nargs="+", default=DEFAULT_FILES)
    ap.add_argument("--collection", default=config.CHROMA_COLLECTION)
    ap.add_argument("--ks", type=int, nargs="+", default=[1, 3, 5, 10])
    ap.add_argument("--rerank", action="store_true", help="bật rerank (mặc định tắt)")
    ap.add_argument("--no-lang-offset", action="store_true", help="bỏ độ lệch điểm theo ngôn ngữ khi xếp hạng")
    ap.add_argument("--no-audience-filter", action="store_true", help="không lọc tài liệu theo đối tượng")
    ap.add_argument("--per-lang", type=int, default=None, help="số ứng viên mỗi ngôn ngữ (mặc định RERANK_CANDIDATES_PER_LANG)")
    ap.add_argument("--audience-penalty", type=float, default=None, help="ghi đè SECTION_AUDIENCE_PENALTY (0 = tắt)")
    ap.add_argument("--thresholds", nargs="*", metavar="LANG=X", help="giả lập ngưỡng relevant, VD vi=0.59 en=0.54")


def make_retrieve(args, max_k):
    def run(question):
        return retriever.retrieve(
            question,
            top_k=max_k,
            collection=args.collection,
            rerank=args.rerank,
            audience_filter=not args.no_audience_filter,
            lang_offset=not args.no_lang_offset,
            audience_penalty=getattr(args, "audience_penalty", None),
            per_lang=max(args.per_lang or config.RERANK_CANDIDATES_PER_LANG, max_k),
        )
    return run


def load_rows(files):
    rows = []
    for f in files:
        for r in evaluation.load_rows(f):
            r.setdefault("topic", f.stem.replace("retrieval_", ""))
            r["dataset"] = f.stem
            rows.append(r)
    return rows


def evaluate(args, rows=None):
    rows = rows if rows is not None else load_rows(args.file)
    max_k = max(args.ks)
    embedding.get_model()
    if args.rerank:
        reranker.preload()
    retrieve = make_retrieve(args, max_k)
    retrieve("warmup")  # không tính thời gian nạp model vào độ trễ
    corpus = evaluation.CorpusIndex(args.collection)
    dangling = [(r["question"], d) for r in rows for d in [corpus.dangling_labels(r)] if d]
    result = evaluation.run(rows, retrieve, args.ks, corpus, parse_thresholds(args.thresholds))
    result["meta"] = evaluation.run_metadata(
        args.file,
        args.collection,
        {"ks": args.ks, "rerank": args.rerank,
         "lang_offset": not args.no_lang_offset, "audience_filter": not args.no_audience_filter,
         "audience_penalty": config.SECTION_AUDIENCE_PENALTY if getattr(args, "audience_penalty", None) is None else args.audience_penalty,
         "per_lang": args.per_lang or config.RERANK_CANDIDATES_PER_LANG,
         "threshold_override": parse_thresholds(args.thresholds) or None},
    )
    result["dangling_labels"] = dangling
    return result


def fmt(v):
    return "  -  " if v is None else f"{v:.3f}"


def print_report(result, ks, verbose=False, compare=None):
    s = result["summary"]
    meta = result["meta"]
    print(f"\nCollection: {meta['collection']} | model: {meta['embed_model']} | files: {', '.join(meta['files'])}")
    print(f"Câu có đáp án: {s['n_answerable']} | câu ngoài kho: {s['n_none']} | "
          f"{'rerank' if meta['rerank'] else 'chỉ vector'}"
          + ("" if meta["lang_offset"] else " | không độ lệch ngôn ngữ")
          + ("" if meta["audience_filter"] else " | không lọc đối tượng")
          + (f" | ngưỡng giả lập {meta['threshold_override']}" if meta["threshold_override"] else ""))
    if result["dangling_labels"]:
        print(f"  ! {len(result['dangling_labels'])} câu có nhãn không khớp chunk nào (sai section hoặc tài liệu chưa nạp):")
        for q, d in result["dangling_labels"][:10]:
            print(f"      {q[:60]} -> {d}")

    base = compare["summary"] if compare else {}

    def line(name, key):
        v = s.get(key)
        delta = ""
        if compare and base.get(key) is not None and v is not None:
            d = v - base[key]
            delta = f"  ({'+' if d >= 0 else ''}{d:.3f})"
        print(f"  {name:<14}{fmt(v)}{delta}")

    print("\n  -- Chất lượng xếp hạng (câu có đáp án)")
    for k in ks:
        line(f"Hit@{k}", f"hit@{k}")
    for k in ks:
        line(f"Recall@{k}", f"recall@{k}")
    for k in ks:
        line(f"Precision@{k}", f"precision@{k}")
    for k in ks:
        line(f"nDCG@{k}", f"ndcg@{k}")
    line(f"MAP@{max(ks)}", f"map@{max(ks)}")
    line("MRR", "mrr")
    print("  -- Ngưỡng relevant (cái LLM thật sự nhận được)")
    line("Usable@5", "usable@5")
    line("Reject@5", "reject@5")
    print(f"  -- Khác: chunk tiếng Anh trong top-5 {s.get('en_share@5', 0):.0%} | "
          f"độ trễ p50 {s.get('latency_p50_ms')}ms p95 {s.get('latency_p95_ms')}ms")

    k5 = 5 if 5 in ks else max(ks)
    for field, title in (("topic", "Theo nguồn / chủ đề"), ("style", "Theo kiểu câu hỏi ('goc' = sát chữ tài liệu)"),
                         ("audience", "Theo đối tượng")):
        groups = result["breakdown"][field]
        if len(groups) <= 1:
            continue
        print(f"\n  {title}:")
        print(f"    {'nhóm':<16}{'n':>4}  Hit@1   Hit@{k5}   nDCG@{k5}  MRR    Usable@5")
        for g, v in groups.items():
            print(f"    {g:<16}{v['n']:>4}  {fmt(v['hit@1'])}  {fmt(v[f'hit@{k5}'])}  {fmt(v[f'ndcg@{k5}'])}  "
                  f"{fmt(v['mrr'])}  {fmt(v['usable@5'])}")

    misses = [q for q in result["questions"] if q["kind"] == "answerable" and not q.get("hit@1")]
    wrong_none = [q for q in result["questions"] if q["kind"] == "none" and not q.get("reject@5")]
    if verbose:
        print(f"\n  Câu top-1 KHÔNG đúng nguồn ({len(misses)}):")
        for q in misses:
            t = q["top"][0]
            print(f"    - {q['question'][:62]:<62} hạng đúng={q['first_rank'] or '>' + str(max(ks))} | top-1: "
                  f"{t['doc_id'][:28]} / {(t['section'] or '')[-45:]} ({t['vector_score']:.3f})")
        print(f"\n  Câu ngoài kho nhưng vẫn có chunk vượt ngưỡng ({len(wrong_none)}):")
        for q in wrong_none:
            t = next(c for c in q["top"][:5] if c["relevant"])
            print(f"    - {q['question'][:62]:<62} -> {t['doc_id'][:28]} / {(t['section'] or '')[-40:]} ({t['vector_score']:.3f})")
        unusable = [q for q in result["questions"] if q["kind"] == "answerable" and q.get("hit@5") and not q.get("usable@5")]
        if unusable:
            print(f"\n  Câu tìm ĐÚNG trong top-5 nhưng chunk đúng bị ngưỡng loại -> LLM không nhận được ({len(unusable)}):")
            for q in unusable:
                c = next(c for c in q["top"][:5] if c["grade"])
                print(f"    - {q['question'][:62]:<62} {c['doc_id'][:28]} ({c['lang']}, cos {c['vector_score']:.3f})")


def main():
    ap = argparse.ArgumentParser()
    add_args(ap)
    ap.add_argument("--verbose", action="store_true", help="in câu sai top-1, câu ngoài kho bị trả lời, chunk đúng bị ngưỡng loại")
    ap.add_argument("--save", metavar="NAME", help="lưu kết quả vào data/eval/results/NAME.json")
    ap.add_argument("--compare", type=Path, metavar="FILE", help="in chênh lệch so với một kết quả đã lưu")
    args = ap.parse_args()

    result = evaluate(args)
    compare = json.loads(args.compare.read_text(encoding="utf-8")) if args.compare else None
    print_report(result, args.ks, args.verbose, compare)
    if args.save:
        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        out = RESULTS_DIR / f"{args.save}.json"
        out.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nĐã lưu {out}")


if __name__ == "__main__":
    main()
