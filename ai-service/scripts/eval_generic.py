"""Kiểm tra độ NHIỄU của truy xuất khi kho tri thức có nhiều tài liệu, bằng câu hỏi chung chung / mơ hồ.

Dùng sau khi thêm tài liệu mới để trả lời: tài liệu mới có "chen" vào câu trả lời không liên quan không?
Không cần đáp án chuẩn đến từng mục như eval_retrieval.py, nên viết nhanh được nhiều câu.
Dùng đúng quy trình truy xuất của API (lọc đối tượng -> ứng viên theo ngôn ngữ -> độ lệch ngôn ngữ -> ngưỡng theo ngôn ngữ).

File câu hỏi (jsonl), mỗi dòng một trong hai dạng:
    {"question": "...", "expect_docs": ["who_healthy_diet"], "group": "nguoi_lon"}
        -> các doc_id được phép xuất hiện (nhiều doc_id = tài liệu nào cũng chấp nhận được)
    {"question": "...", "expect": "none", "group": "ngoai_kb"}
        -> KB không có đáp án: top-1 phải bị coi là KHÔNG liên quan (điểm dưới ngưỡng của ngôn ngữ chunk đó)
Nhóm "chi_tieng_anh": câu chỉ tài liệu tiếng Anh trả lời được, dùng để biết nội dung tiếng Anh có bị tiếng Việt lấn át không.

Chỉ số in ra:
  - Top-1 đúng nguồn: top-1 thuộc tài liệu được phép.
  - Nhiễu@K: tỷ lệ chunk trong top-K thuộc tài liệu KHÔNG được phép (thấp là tốt).
  - Từ chối nhầm: câu có đáp án, top-1 đúng nguồn nhưng bị coi là không liên quan (ngưỡng quá cao; thấp là tốt).
  - Từ chối đúng: với câu "none", tỷ lệ top-1 có điểm dưới ngưỡng (cao là tốt).
  - Theo ngôn ngữ: top-1 của câu có đáp án thuộc ngôn ngữ nào, điểm trung bình, tỷ lệ chunk tiếng Anh trong top-K.
  - Gợi ý ngưỡng riêng cho từng ngôn ngữ (VECTOR_RELEVANCE_THRESHOLD_VI, _EN...) tách tốt nhất hai nhóm câu.

Ví dụ:
    python scripts/eval_generic.py --verbose
    python scripts/eval_generic.py --no-lang-offset            # xem tác dụng của độ lệch ngôn ngữ
    python scripts/eval_generic.py --no-audience-filter        # xem nhiễu khi KHÔNG lọc đối tượng
    python scripts/eval_generic.py --rerank                    # bật rerank (mặc định tắt)
    python scripts/eval_generic.py --min-score 0.8             # tự đặt một ngưỡng chung thay vì ngưỡng của ai-service
"""
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def is_relevant(top, min_score):
    """Câu 'liên quan'? Mặc định theo cờ `relevant` (ngưỡng theo ngôn ngữ); --min-score thì so điểm thô."""
    if not top:
        return False
    if min_score is not None:
        return top["score"] >= min_score
    return bool(top.get("relevant", False))


def lang_of(chunk):
    return (chunk or {}).get("lang") or "?"


def evaluate(rows, retrieve, k, min_score=None):
    """retrieve(question, k) -> list chunk {doc_id, section, score, relevant, lang}. Trả về kết quả từng câu."""
    results = []
    for row in rows:
        chunks = retrieve(row["question"], k)
        top = chunks[0] if chunks else None
        res = {
            "question": row["question"],
            "group": row.get("group", ""),
            "style": row.get("style", "goc"),
            "top": top,
            "top_score": top["score"] if top else 0.0,
            "top_raw": (top.get("vector_score", top["score"]) if top else 0.0),
            "top_lang": lang_of(top),
            "chunks": chunks,
            "en_share": (sum(1 for c in chunks if lang_of(c) == "en") / len(chunks)) if chunks else 0.0,
            "relevant": is_relevant(top, min_score),
        }
        if row.get("expect") == "none":
            res["kind"] = "none"
            res["pass"] = not res["relevant"]
        else:
            allowed = set(row["expect_docs"])
            res["kind"] = "answerable"
            res["top1_ok"] = bool(top) and top["doc_id"] in allowed
            res["noise"] = (
                sum(1 for c in chunks if c["doc_id"] not in allowed) / len(chunks) if chunks else 1.0
            )
            res["false_reject"] = res["top1_ok"] and not res["relevant"]
            res["pass"] = res["top1_ok"] and res["relevant"]
        results.append(res)
    return results


def best_threshold(ans, none):
    """Quét ngưỡng 0.50-0.99: câu có đáp án cần điểm >= ngưỡng, câu 'none' cần điểm < ngưỡng.
    Nhiều ngưỡng cùng tốt nhất thì lấy ngưỡng ở giữa. Trả (ngưỡng, độ đúng)."""
    if not ans or not none:
        return None
    scored = []
    for i in range(50, 100):
        t = i / 100
        acc = (sum(s >= t for s in ans) + sum(s < t for s in none)) / (len(ans) + len(none))
        scored.append((t, acc))
    top_acc = max(a for _, a in scored)
    best = [t for t, a in scored if a == top_acc]
    return best[len(best) // 2], top_acc


def suggest_by_lang(results):
    """Gợi ý ngưỡng cho từng ngôn ngữ, nhóm theo ngôn ngữ của top-1. Dùng điểm cosine thô."""
    ans = defaultdict(list)
    none = defaultdict(list)
    for r in results:
        if r["kind"] == "answerable" and r["top1_ok"]:
            ans[r["top_lang"]].append(r["top_raw"])
        elif r["kind"] == "none":
            none[r["top_lang"]].append(r["top_raw"])
    lines = []
    for lang in sorted(set(ans) | set(none)):
        a, n = ans.get(lang, []), none.get(lang, [])
        parts = [f"  {lang}: có đáp án n={len(a)}"]
        if a:
            parts.append(f"thấp nhất {min(a):.3f}")
        parts.append(f"| ngoài KB n={len(n)}")
        if n:
            parts.append(f"cao nhất {max(n):.3f}")
        best = best_threshold(a, n)
        if best:
            if min(a) > max(n):
                parts.append(f"-> tách hoàn toàn, ngưỡng khoảng {(min(a) + max(n)) / 2:.2f}")
            else:
                parts.append(f"-> chồng lấn, ngưỡng tốt nhất {best[0]:.2f} (đúng {best[1]:.0%})")
            parts.append(f"=> VECTOR_RELEVANCE_THRESHOLD_{lang.upper()}={best[0]:.2f}")
        else:
            parts.append("-> thiếu mẫu một nhóm, chưa gợi ý được")
        lines.append(" ".join(parts))
    return lines


def _where(top):
    return f"{top['doc_id']} / {(top.get('heading') or top['section'].split(' > ')[-1])[:50]}" if top else "(không có kết quả)"


def report(results, k, min_score, verbose, reranked=False):
    answerable = [r for r in results if r["kind"] == "answerable"]
    none = [r for r in results if r["kind"] == "none"]
    first_top = next((r["top"] for r in results if r["top"]), None)
    used = min_score if min_score is not None else "theo ngôn ngữ"
    thr = (first_top or {}).get("threshold")

    if verbose:
        print()
        for r in results:
            if r["kind"] == "none":
                status = "OK  " if r["pass"] else "NHIỄU"
            elif r["false_reject"]:
                status = "TỪ CHỐI NHẦM"
            else:
                status = "OK  " if r["top1_ok"] else "SAI NGUỒN"
            print(f"[{status}] {r['top_score']:.3f} ({r['top_lang']})  {r['question']}\n           -> {_where(r['top'])}")

    print(f"\n=== Tổng hợp ({len(results)} câu, K={k}, ngưỡng={used}{'' if thr is None or min_score is not None else f', ví dụ top-1 đầu tiên: {thr}'}) ===")
    if answerable:
        ok = sum(r["top1_ok"] for r in answerable)
        fr = [r for r in answerable if r["false_reject"]]
        noise = sum(r["noise"] for r in answerable) / len(answerable)
        print(f"Top-1 đúng nguồn : {ok}/{len(answerable)} = {ok / len(answerable):.3f}")
        print(f"Từ chối nhầm     : {len(fr)}/{len(answerable)} (đúng nguồn nhưng điểm dưới ngưỡng)")
        for r in fr:
            print(f"  TỪ CHỐI NHẦM: '{r['question']}' -> {_where(r['top'])} ({r['top_raw']:.3f}, {r['top_lang']})")
        print(f"Nhiễu@{k} trung bình: {noise:.3f}")
        by_group = defaultdict(list)
        for r in answerable:
            by_group[r["group"] or "-"].append(r)
        for g, rs in by_group.items():
            print(f"  nhóm {g:<14} top-1 đúng {sum(x['top1_ok'] for x in rs)}/{len(rs)}"
                  f" | từ chối nhầm {sum(x['false_reject'] for x in rs)}"
                  f" | nhiễu@{k} {sum(x['noise'] for x in rs) / len(rs):.3f}"
                  f" | chunk EN trong top-{k} {sum(x['en_share'] for x in rs) / len(rs):.0%}")
    if none:
        ok = sum(r["pass"] for r in none)
        print(f"Từ chối đúng (top-1 dưới ngưỡng): {ok}/{len(none)} = {ok / len(none):.3f}")
        for r in none:
            if not r["pass"]:
                print(f"  NHIỄU: '{r['question']}' -> {_where(r['top'])} ({r['top_raw']:.3f}, {r['top_lang']})")

    by_style = defaultdict(list)
    for r in results:
        by_style[r["style"]].append(r)
    if len(by_style) > 1:
        print("Theo kiểu câu hỏi ('goc' = sát chữ trong tài liệu; các kiểu khác = diễn đạt lệch chữ):")
        for s in sorted(by_style, key=lambda x: (x != "goc", x)):
            rs = by_style[s]
            ans = [x for x in rs if x["kind"] == "answerable"]
            non = [x for x in rs if x["kind"] == "none"]
            parts = [f"  {s:<13} n={len(rs):<3}"]
            if ans:
                parts.append(f"top-1 đúng nguồn {sum(x['top1_ok'] for x in ans)}/{len(ans)}"
                             f" | từ chối nhầm {sum(x['false_reject'] for x in ans)}")
            if non:
                parts.append(f"từ chối đúng {sum(x['pass'] for x in non)}/{len(non)}")
            print(" ".join(parts))

    dist = Counter(r["top"]["doc_id"] for r in results if r["top"])
    print("Top-1 theo tài liệu:", dict(dist))

    ok_rows = [r for r in answerable if r["top1_ok"]]
    if ok_rows:
        by_lang = defaultdict(list)
        for r in ok_rows:
            by_lang[r["top_lang"]].append(r["top_raw"])
        print("Câu có đáp án đúng nguồn, theo ngôn ngữ của top-1: " + "; ".join(
            f"{lg}: {len(v)} câu, cosine thô trung bình {sum(v) / len(v):.3f}" for lg, v in sorted(by_lang.items())))
        en_only = [r for r in answerable if r["group"] == "chi_tieng_anh"]
        if en_only:
            hit = sum(1 for r in en_only if r["top_lang"] == "en" and r["top1_ok"])
            print(f"Câu chỉ tiếng Anh trả lời được: top-1 là chunk tiếng Anh đúng nguồn {hit}/{len(en_only)}")

    if reranked:
        print("\n(Đang rerank: bỏ qua gợi ý ngưỡng theo cosine; điều chỉnh RELEVANCE_THRESHOLD thủ công.)")
        return
    lines = suggest_by_lang(results)
    if lines:
        print("\nGợi ý ngưỡng theo ngôn ngữ của top-1 (cosine thô, đặt vào ai-service/.env):")
        for ln in lines:
            print(ln)
        print("  (ngôn ngữ không có dòng riêng dùng VECTOR_RELEVANCE_THRESHOLD)")


def main():
    from app import config, embedding, reranker, retriever

    ap = argparse.ArgumentParser()
    ap.add_argument("--file", type=Path, default=config.EVAL_DIR / "retrieval_generic.jsonl")
    ap.add_argument("--collection", default=config.CHROMA_COLLECTION)
    ap.add_argument("--k", type=int, default=config.TOP_K)
    ap.add_argument("--min-score", type=float, default=None,
                    help="tự đặt một ngưỡng chung; bỏ trống = dùng ngưỡng theo ngôn ngữ của ai-service (cờ relevant)")
    ap.add_argument("--rerank", action="store_true", help="bật rerank (mặc định tắt)")
    ap.add_argument("--no-lang-offset", action="store_true", help="bỏ độ lệch điểm theo ngôn ngữ khi xếp hạng")
    ap.add_argument("--no-audience-filter", action="store_true", help="không lọc tài liệu theo đối tượng")
    ap.add_argument("--verbose", action="store_true", help="in kết quả từng câu")
    args = ap.parse_args()

    rows = [json.loads(l) for l in args.file.read_text(encoding="utf-8").splitlines() if l.strip()]
    state = {"reranked": False}

    def retrieve(q, k):
        res = retriever.retrieve(
            q,
            top_k=k,
            collection=args.collection,
            rerank=args.rerank,
            audience_filter=not args.no_audience_filter,
            lang_offset=not args.no_lang_offset,
        )
        state["reranked"] = res["reranked"]
        return res["chunks"]

    embedding.get_model()
    if args.rerank:
        reranker.preload()
    results = evaluate(rows, retrieve, args.k, args.min_score)
    report(results, args.k, args.min_score, args.verbose, reranked=state["reranked"])


if __name__ == "__main__":
    main()
