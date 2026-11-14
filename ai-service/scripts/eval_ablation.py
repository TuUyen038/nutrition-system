"""Ablation + quét ngưỡng cho tầng truy xuất -> bảng Markdown để đưa vào báo cáo.

1. Ablation: chạy cùng bộ câu hỏi với từng cấu hình (bỏ độ lệch ngôn ngữ, bỏ lọc đối tượng, đổi số ứng viên, rerank...),
   mỗi cấu hình một dòng: Hit@1, Hit@5, nDCG@5, MAP@10, MRR, Usable@5, Reject@5, độ trễ.
2. Quét ngưỡng relevant theo ngôn ngữ (VECTOR_RELEVANCE_THRESHOLD_VI / _EN): dùng lại kết quả truy xuất của cấu hình
   gốc, chỉ tính lại cờ relevant -> Usable@5 (câu có đáp án: LLM nhận được chunk đúng) và Reject@5 (câu ngoài kho:
   không chunk nào vượt ngưỡng). Chọn cặp ngưỡng có trung bình điều hòa (F1) của hai chỉ số cao nhất.
   Câu ngoài kho lấy từ mọi file được truyền vào (kể cả retrieval_generic.jsonl).

    python scripts/eval_ablation.py                      # ghi data/eval/results/ablation.md (+ .json)
    python scripts/eval_ablation.py --with-rerank        # thêm cấu hình rerank (tải model ~2 GB lần đầu)
    python scripts/eval_ablation.py --name after_tuning
"""
import argparse
import itertools
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import config, evaluation  # noqa: E402
from eval_retrieval import RESULTS_DIR, evaluate, load_rows  # noqa: E402

COLUMNS = [("Hit@1", "hit@1"), ("Hit@5", "hit@5"), ("nDCG@5", "ndcg@5"), ("MAP@10", "map@10"), ("MRR", "mrr"),
           ("Usable@5", "usable@5"), ("Reject@5", "reject@5"), ("p95 ms", "latency_p95_ms")]


def load_generic(path: Path):
    """retrieval_generic.jsonl: dùng câu ngoài kho (expect=none) cho quét ngưỡng; câu có đáp án đổi expect_docs -> accept."""
    rows = []
    for r in evaluation.load_rows(path):
        r = dict(r, topic="generic", dataset=path.stem)
        if r.get("expect") != "none":
            r["accept"] = [{"doc_id": d} for d in r.get("expect_docs", [])]
            r["relevant"] = []
        rows.append(r)
    return rows


def ns(**kw):
    base = dict(collection=config.CHROMA_COLLECTION, ks=[1, 3, 5, 10], rerank=False, no_lang_offset=False,
                no_audience_filter=False, per_lang=None, thresholds=None, file=[], audience_penalty=0.0)
    base.update(kw)
    return argparse.Namespace(**base)


def f1(a, b):
    return 0.0 if not a or not b else 2 * a * b / (a + b)


def sweep(questions, vi_grid, en_grid):
    ans = [q for q in questions if q["kind"] == "answerable"]
    none = [q for q in questions if q["kind"] == "none"]

    def rel(c, thr):
        return c["vector_score"] >= thr.get(c["lang"], config.vector_threshold(c["lang"]))

    rows = []
    for vi, en in itertools.product(vi_grid, en_grid):
        thr = {"vi": vi, "en": en}
        usable = sum(any(c["grade"] and rel(c, thr) for c in q["top"][:5]) for q in ans) / len(ans)
        reject = sum(not any(rel(c, thr) for c in q["top"][:5]) for q in none) / len(none) if none else None
        rows.append({"vi": vi, "en": en, "usable@5": round(usable, 4), "reject@5": round(reject, 4) if reject is not None else None,
                     "f1": round(f1(usable, reject or 0), 4)})
    return rows


def table(rows, cols):
    head = "| " + " | ".join(c for c, _ in cols) + " |"
    sep = "|" + "---|" * len(cols)
    body = []
    for r in rows:
        cells = []
        for _, key in cols:
            v = r.get(key)
            cells.append("-" if v is None else (f"{v:.3f}" if isinstance(v, float) and key != "latency_p95_ms" else str(v)))
        body.append("| " + " | ".join(cells) + " |")
    return "\n".join([head, sep] + body)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", type=Path, nargs="+",
                    default=[config.EVAL_DIR / "retrieval_exercise.jsonl", config.EVAL_DIR / "retrieval_qa.jsonl"])
    ap.add_argument("--generic", type=Path, default=config.EVAL_DIR / "retrieval_generic.jsonl",
                    help="lấy thêm câu ngoài kho cho quét ngưỡng (bỏ trống để không dùng)")
    ap.add_argument("--with-rerank", action="store_true")
    ap.add_argument("--name", default="ablation")
    args = ap.parse_args()

    rows = load_rows(args.file)
    configs = [
        ("Gốc: ngưỡng .env, không trừ điểm", {"audience_penalty": 0.0}),
        ("Bỏ độ lệch ngôn ngữ", {"no_lang_offset": True}),
        ("Bỏ lọc đối tượng", {"no_audience_filter": True}),
        ("5 ứng viên / ngôn ngữ", {"per_lang": 5}),
        ("20 ứng viên / ngôn ngữ", {"per_lang": 20}),
    ]
    for x in (0.02, 0.04, 0.06):
        configs.append((f"Trừ điểm mục sai đối tượng {x}", {"audience_penalty": x}))
    if args.with_rerank:
        configs.append(("Bật rerank (cross-encoder)", {"rerank": True}))

    results = []
    for label, kw in configs:
        print(f"[ablation] {label} ...", flush=True)
        res = evaluate(ns(file=args.file, **kw), rows)
        results.append({"config": label, **res["summary"]})

    # Quét ngưỡng trên kết quả truy xuất của cấu hình gốc (+ câu ngoài kho của bộ generic)
    sweep_rows = rows + ([r for r in load_generic(args.generic) if r.get("expect") == "none"] if args.generic and args.generic.exists() else [])
    print("[sweep] truy xuất cho quét ngưỡng ...", flush=True)
    base = evaluate(ns(file=args.file), sweep_rows)
    vi_grid = [round(0.50 + 0.02 * i, 2) for i in range(17)]   # 0.50 .. 0.82
    en_grid = [round(0.44 + 0.02 * i, 2) for i in range(12)]   # 0.44 .. 0.66
    grid = sweep(base["questions"], vi_grid, en_grid)
    best = max(grid, key=lambda r: (r["f1"], r["usable@5"]))
    current = {"vi": config.vector_threshold("vi"), "en": config.vector_threshold("en")}
    cur = sweep(base["questions"], [current["vi"]], [current["en"]])[0]

    # Kiểm định chéo 2-fold: chọn ngưỡng trên một nửa câu hỏi, đo trên nửa còn lại (tránh "chọn trên chính bộ test")
    import random
    qs = list(base["questions"])
    random.Random(42).shuffle(qs)
    folds = [qs[0::2], qs[1::2]]
    cv = []
    for i in (0, 1):
        train, test = folds[i], folds[1 - i]
        b = max(sweep(train, vi_grid, en_grid), key=lambda r: (r["f1"], r["usable@5"]))
        t = sweep(test, [b["vi"]], [b["en"]])[0]
        cv.append({"fold": i + 1, "vi": b["vi"], "en": b["en"], "train_f1": b["f1"], **{f"test_{k}": t[k] for k in ("usable@5", "reject@5", "f1")}})

    n_none = sum(1 for q in base["questions"] if q["kind"] == "none")
    n_ans = sum(1 for q in base["questions"] if q["kind"] == "answerable")
    thr = [f"vi={best['vi']}", f"en={best['en']}"]
    tuned = evaluate(ns(file=args.file, thresholds=thr, audience_penalty=0.0), rows)
    results.append({"config": f"Chỉ đổi ngưỡng vi={best['vi']} en={best['en']}", **tuned["summary"]})
    best_pen = max((r for r in results if r["config"].startswith("Trừ điểm")), key=lambda r: (r["mrr"], r["hit@1"]))
    pen = float(best_pen["config"].split()[-1])
    both = evaluate(ns(file=args.file, thresholds=thr, audience_penalty=pen), rows)
    results.append({"config": f"**Đề xuất: ngưỡng trên + trừ điểm {pen}**", **both["summary"]})

    meta = base["meta"]
    md = [
        f"# Đánh giá truy xuất ({time.strftime('%Y-%m-%d')})",
        "",
        f"- Model embedding: `{meta['embed_model']}` | collection: `{meta['collection']}` | commit: `{meta['git_commit']}`",
        f"- Bộ câu hỏi: {', '.join(f.name for f in args.file)} ({results[0]['n_answerable']} câu có đáp án, "
        f"{results[0]['n_none']} câu ngoài kho); hash: `{json.dumps(meta['dataset_sha256'])}`",
        f"- Ngưỡng hiện tại: vi={current['vi']} en={current['en']}",
        "",
        "## Ablation",
        "",
        table(results, [("Cấu hình", "config")] + COLUMNS),
        "",
        "Usable@5: chunk đúng nằm trong top-5 VÀ vượt ngưỡng (LLM thật sự nhận được). "
        "Reject@5: câu ngoài kho không có chunk nào vượt ngưỡng.",
        "",
        f"## Quét ngưỡng ({n_ans} câu có đáp án, {n_none} câu ngoài kho kể cả bộ generic)",
        "",
        f"- Hiện tại vi={current['vi']} en={current['en']}: Usable@5 {cur['usable@5']:.3f}, Reject@5 {cur['reject@5']:.3f}, F1 {cur['f1']:.3f}",
        f"- **Đề xuất vi={best['vi']} en={best['en']}**: Usable@5 {best['usable@5']:.3f}, Reject@5 {best['reject@5']:.3f}, F1 {best['f1']:.3f}",
        "",
        "Kiểm định chéo 2-fold (chọn ngưỡng trên nửa này, đo trên nửa kia; nếu test_f1 gần train_f1 thì ngưỡng không bị overfit):",
        "",
        table(cv, [("Fold", "fold"), ("VI", "vi"), ("EN", "en"), ("F1 train", "train_f1"), ("Usable@5 test", "test_usable@5"),
                   ("Reject@5 test", "test_reject@5"), ("F1 test", "test_f1")]),
        "",
        "Top 10 cặp ngưỡng theo F1:",
        "",
        table(sorted(grid, key=lambda r: (-r["f1"], -r["usable@5"]))[:10],
              [("VI", "vi"), ("EN", "en"), ("Usable@5", "usable@5"), ("Reject@5", "reject@5"), ("F1", "f1")]),
        "",
    ]
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / f"{args.name}.md").write_text("\n".join(md), encoding="utf-8")
    (RESULTS_DIR / f"{args.name}.json").write_text(
        json.dumps({"meta": meta, "ablation": results, "sweep": grid, "best": best, "current": cur, "cv": cv}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print("\n".join(md))
    print(f"\nĐã lưu {RESULTS_DIR / (args.name + '.md')}")


if __name__ == "__main__":
    main()
