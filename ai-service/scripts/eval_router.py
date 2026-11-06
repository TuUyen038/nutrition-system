"""Đánh giá Intent Router: Accuracy, Precision/Recall/F1 từng nhóm, ma trận nhầm lẫn, độ chính xác nhóm con.

In hai bảng:
  1. Bảng STRICT: phân biệt cả knowledge và mixed.
  2. Bảng THEO HÀNH VI: gộp knowledge + mixed thành nhóm "rag", vì ở chatbot hai nhãn này
     cùng đi vào nhánh RAG (chỉ khác nhãn `intent` lưu trong DB).

File test (jsonl), mỗi dòng: {"text": "...", "label": "<nhãn>"} với nhãn là
    knowledge.nutrition | knowledge.exercise | mixed | personal.workout | personal.menu |
    personal.recipe | personal.favorites | personal.profile | chitchat | out_of_scope | ambiguous
(chỉ ghi nhóm cha như "knowledge" hay "personal" cũng được: khi đó không chấm nhóm con).
Tập này phải TÁCH BIỆT với data/intents/exemplars.json.

Ví dụ:
    python scripts/eval_router.py --verbose
    $env:ROUTER_OOS_MARGIN="0.01"; python scripts/eval_router.py     # PowerShell: thử ngưỡng khác
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402
from app.intent_router import IntentRouter  # noqa: E402

LABELS = ["knowledge", "mixed", "personal", "chitchat", "out_of_scope", "ambiguous"]
BEHAVIOR_LABELS = ["rag", "personal", "chitchat", "out_of_scope", "ambiguous"]
BEHAVIOR_GROUP = {"knowledge": "rag", "mixed": "rag"}


def split_label(label: str):
    top, _, sub = label.partition(".")
    return top, (sub or None)


def to_behavior(label: str) -> str:
    return BEHAVIOR_GROUP.get(label, label)


def empty_matrix(labels):
    return {a: {b: 0 for b in labels} for a in labels}


def print_report(title: str, labels, cm) -> None:
    total = sum(cm[g][p] for g in labels for p in labels)
    correct = sum(cm[l][l] for l in labels)
    print(f"\n=== {title} ===")
    print(f"Accuracy: {correct / total:.3f}  ({correct}/{total})\n")

    print(f"{'intent':<13}{'P':>7}{'R':>7}{'F1':>7}{'support':>9}")
    for lab in labels:
        tp = cm[lab][lab]
        fp = sum(cm[g][lab] for g in labels if g != lab)
        fn = sum(cm[lab][p] for p in labels if p != lab)
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * p * r / (p + r) if p + r else 0.0
        print(f"{lab:<13}{p:>7.2f}{r:>7.2f}{f1:>7.2f}{tp + fn:>9}")

    print("\nConfusion matrix (hàng = nhãn đúng, cột = dự đoán)")
    print(" " * 13 + "".join(f"{l[:11]:>12}" for l in labels))
    for g in labels:
        print(f"{g:<13}" + "".join(f"{cm[g][p]:>12}" for p in labels))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", type=Path, default=config.EVAL_DIR / "router_test.jsonl")
    ap.add_argument("--verbose", action="store_true", help="in các câu dự đoán sai")
    args = ap.parse_args()

    rows = [json.loads(l) for l in args.file.read_text(encoding="utf-8").splitlines() if l.strip()]
    router = IntentRouter()

    strict = empty_matrix(LABELS)  # strict[gold][pred]
    behavior = empty_matrix(BEHAVIOR_LABELS)
    sub_total = sub_correct = sub_none = 0
    for row in rows:
        res = router.classify(row["text"])
        pred = res["intent"]
        gold, gold_sub = split_label(row["label"])
        strict[gold][pred] += 1
        behavior[to_behavior(gold)][to_behavior(pred)] += 1
        ok = pred == gold

        # Nhóm con chỉ chấm khi nhóm cha đúng và nhãn gold có nhóm con (personal.* / knowledge.*)
        if ok and gold_sub:
            sub_total += 1
            if res.get("sub_intent") == gold_sub:
                sub_correct += 1
            elif res.get("sub_intent") is None:
                sub_none += 1  # không chọn nhóm con: Node cấp đủ tool nên không sai hẳn

        if args.verbose and (not ok or (gold_sub and res.get("sub_intent") not in (gold_sub, None))):
            same_behavior = to_behavior(pred) == to_behavior(gold)
            note = "  (khác nhãn nhưng cùng nhánh RAG)" if (not ok and same_behavior) else ""
            print(f"[gold={row['label']} pred={pred}/{res.get('sub_intent')}] {row['text']}  {res['scores']}{note}")

    print(
        f"\n{len(rows)} câu | margin={config.ROUTER_MARGIN} sub={config.ROUTER_SUB_MARGIN} "
        f"oos={config.ROUTER_OOS_MARGIN} boost={config.ROUTER_KEYWORD_BOOST}"
    )
    if sub_total:
        print(
            f"Nhóm con (trên các câu đúng nhóm cha): đúng {sub_correct}/{sub_total} = {sub_correct / sub_total:.3f}"
            f", bỏ trống {sub_none} (an toàn, cấp đủ tool), sai hẳn {sub_total - sub_correct - sub_none}"
        )

    print_report("STRICT (phân biệt knowledge và mixed)", LABELS, strict)
    print_report("THEO HÀNH VI (gộp knowledge + mixed = rag)", BEHAVIOR_LABELS, behavior)


if __name__ == "__main__":
    main()
