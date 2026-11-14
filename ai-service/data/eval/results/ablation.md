# Đánh giá truy xuất (2026-11-14)

- Model embedding: `BAAI/bge-m3` | collection: `nutrition_kb` | commit: `1205a1d`
- Bộ câu hỏi: retrieval_exercise.jsonl, retrieval_qa.jsonl (88 câu có đáp án, 8 câu ngoài kho); hash: `{"retrieval_exercise.jsonl": "3461b4c460ae7581", "retrieval_qa.jsonl": "ec29cabc69b3d5a4"}`
- Ngưỡng hiện tại: vi=0.82 en=0.5

## Ablation

| Cấu hình | Hit@1 | Hit@5 | nDCG@5 | MAP@10 | MRR | Usable@5 | Reject@5 | p95 ms |
|---|---|---|---|---|---|---|---|---|
| Gốc: ngưỡng .env, không trừ điểm | 0.670 | 0.943 | 0.624 | 0.574 | 0.785 | 0.705 | 0.375 | 78.9 |
| Bỏ độ lệch ngôn ngữ | 0.659 | 0.932 | 0.588 | 0.570 | 0.768 | 0.670 | 0.375 | 76.1 |
| Bỏ lọc đối tượng | 0.670 | 0.943 | 0.622 | 0.573 | 0.783 | 0.705 | 0.375 | 75.7 |
| 5 ứng viên / ngôn ngữ | 0.670 | 0.943 | 0.624 | 0.574 | 0.785 | 0.705 | 0.375 | 75.0 |
| 20 ứng viên / ngôn ngữ | 0.670 | 0.943 | 0.624 | 0.574 | 0.785 | 0.705 | 0.375 | 78.6 |
| Trừ điểm mục sai đối tượng 0.02 | 0.716 | 0.943 | 0.637 | 0.586 | 0.821 | 0.705 | 0.375 | 80.2 |
| Trừ điểm mục sai đối tượng 0.04 | 0.739 | 0.943 | 0.641 | 0.592 | 0.834 | 0.705 | 0.375 | 76.6 |
| Trừ điểm mục sai đối tượng 0.06 | 0.727 | 0.943 | 0.640 | 0.593 | 0.828 | 0.705 | 0.375 | 76.1 |
| Chỉ đổi ngưỡng vi=0.64 en=0.58 | 0.670 | 0.943 | 0.624 | 0.574 | 0.785 | 0.864 | 1.000 | 78.9 |
| **Đề xuất: ngưỡng trên + trừ điểm 0.04** | 0.739 | 0.943 | 0.641 | 0.592 | 0.834 | 0.864 | 1.000 | 75.4 |

Usable@5: chunk đúng nằm trong top-5 VÀ vượt ngưỡng (LLM thật sự nhận được). Reject@5: câu ngoài kho không có chunk nào vượt ngưỡng.

## Quét ngưỡng (88 câu có đáp án, 32 câu ngoài kho kể cả bộ generic)

- Hiện tại vi=0.82 en=0.5: Usable@5 0.705, Reject@5 0.625, F1 0.662
- **Đề xuất vi=0.64 en=0.58**: Usable@5 0.864, Reject@5 0.938, F1 0.899

Kiểm định chéo 2-fold (chọn ngưỡng trên nửa này, đo trên nửa kia; nếu test_f1 gần train_f1 thì ngưỡng không bị overfit):

| Fold | VI | EN | F1 train | Usable@5 test | Reject@5 test | F1 test |
|---|---|---|---|---|---|---|
| 1 | 0.640 | 0.560 | 0.869 | 0.909 | 0.875 | 0.892 |
| 2 | 0.600 | 0.580 | 0.952 | 0.818 | 0.688 | 0.747 |

Top 10 cặp ngưỡng theo F1:

| VI | EN | Usable@5 | Reject@5 | F1 |
|---|---|---|---|---|
| 0.640 | 0.580 | 0.864 | 0.938 | 0.899 |
| 0.680 | 0.580 | 0.830 | 0.969 | 0.894 |
| 0.640 | 0.600 | 0.852 | 0.938 | 0.893 |
| 0.680 | 0.600 | 0.818 | 0.969 | 0.887 |
| 0.660 | 0.580 | 0.841 | 0.938 | 0.887 |
| 0.640 | 0.560 | 0.886 | 0.875 | 0.881 |
| 0.700 | 0.580 | 0.807 | 0.969 | 0.880 |
| 0.660 | 0.600 | 0.830 | 0.938 | 0.880 |
| 0.680 | 0.560 | 0.852 | 0.906 | 0.878 |
| 0.700 | 0.600 | 0.795 | 0.969 | 0.874 |
