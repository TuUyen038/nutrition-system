# Đánh giá truy xuất (2026-11-27)

- Model embedding: `BAAI/bge-m3` | collection: `nutrition_kb_v2` | commit: `5be959f`
- Bộ câu hỏi: retrieval_exercise.jsonl, retrieval_qa.jsonl, retrieval_ods.jsonl (126 câu có đáp án, 12 câu ngoài kho); hash: `{"retrieval_exercise.jsonl": "3461b4c460ae7581", "retrieval_qa.jsonl": "ec29cabc69b3d5a4", "retrieval_ods.jsonl": "7b70ddc4616bd0f9"}`
- Ngưỡng hiện tại: vi=0.64 en=0.58

## Ablation

| Cấu hình | Hit@1 | Hit@5 | nDCG@5 | MAP@10 | MRR | Usable@5 | Reject@5 | p95 ms |
|---|---|---|---|---|---|---|---|---|
| Gốc: ngưỡng .env, không trừ điểm | 0.682 | 0.921 | 0.604 | 0.568 | 0.776 | 0.857 | 0.833 | 120.5 |
| Bỏ độ lệch ngôn ngữ | 0.706 | 0.929 | 0.602 | 0.590 | 0.793 | 0.865 | 0.833 | 101.8 |
| Bỏ lọc đối tượng | 0.651 | 0.913 | 0.587 | 0.549 | 0.751 | 0.849 | 0.833 | 135.9 |
| 5 ứng viên / ngôn ngữ | 0.682 | 0.921 | 0.604 | 0.568 | 0.776 | 0.857 | 0.833 | 112.8 |
| 20 ứng viên / ngôn ngữ | 0.682 | 0.921 | 0.604 | 0.568 | 0.776 | 0.857 | 0.833 | 138.6 |
| BM25 không dấu (chỉ câu không dấu) | 0.682 | 0.952 | 0.614 | 0.571 | 0.789 | 0.857 | 0.833 | 121.2 |
| BM25 luôn bật | 0.341 | 0.492 | 0.230 | 0.231 | 0.399 | 0.413 | 0.750 | 196.8 |
| Trừ điểm mục sai đối tượng 0.02 | 0.722 | 0.921 | 0.614 | 0.577 | 0.805 | 0.857 | 0.833 | 110.9 |
| Trừ điểm mục sai đối tượng 0.04 | 0.738 | 0.921 | 0.618 | 0.582 | 0.814 | 0.857 | 0.833 | 157.0 |
| Trừ điểm mục sai đối tượng 0.06 | 0.730 | 0.921 | 0.617 | 0.583 | 0.810 | 0.857 | 0.833 | 208.0 |
| Chỉ đổi ngưỡng vi=0.68 en=0.6 | 0.682 | 0.921 | 0.604 | 0.568 | 0.776 | 0.818 | 0.833 | 93.8 |
| **Đề xuất: ngưỡng trên + trừ điểm 0.04** | 0.738 | 0.921 | 0.618 | 0.582 | 0.814 | 0.818 | 0.833 | 95.6 |

Usable@5: chunk đúng nằm trong top-5 VÀ vượt ngưỡng (LLM thật sự nhận được). Reject@5: câu ngoài kho không có chunk nào vượt ngưỡng.

## Quét ngưỡng (126 câu có đáp án, 36 câu ngoài kho kể cả bộ generic)

- Hiện tại vi=0.64 en=0.58: Usable@5 0.857, Reject@5 0.750, F1 0.800
- **Đề xuất vi=0.68 en=0.6**: Usable@5 0.818, Reject@5 0.833, F1 0.825

Kiểm định chéo 2-fold (chọn ngưỡng trên nửa này, đo trên nửa kia; nếu test_f1 gần train_f1 thì ngưỡng không bị overfit):

| Fold | VI | EN | F1 train | Usable@5 test | Reject@5 test | F1 test |
|---|---|---|---|---|---|---|
| 1 | 0.680 | 0.620 | 0.858 | 0.739 | 0.750 | 0.745 |
| 2 | 0.500 | 0.600 | 0.786 | 0.860 | 0.708 | 0.777 |

Top 10 cặp ngưỡng theo F1:

| VI | EN | Usable@5 | Reject@5 | F1 |
|---|---|---|---|---|
| 0.680 | 0.600 | 0.818 | 0.833 | 0.825 |
| 0.600 | 0.600 | 0.841 | 0.806 | 0.823 |
| 0.620 | 0.600 | 0.841 | 0.806 | 0.823 |
| 0.640 | 0.600 | 0.841 | 0.806 | 0.823 |
| 0.700 | 0.600 | 0.809 | 0.833 | 0.821 |
| 0.660 | 0.600 | 0.825 | 0.806 | 0.815 |
| 0.600 | 0.620 | 0.794 | 0.833 | 0.813 |
| 0.620 | 0.620 | 0.794 | 0.833 | 0.813 |
| 0.640 | 0.620 | 0.794 | 0.833 | 0.813 |
| 0.720 | 0.600 | 0.794 | 0.833 | 0.813 |
