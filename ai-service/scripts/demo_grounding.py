"""Demo kiểm tra chống ảo giác (/rag/verify) trên chunk WHO thật trong kho: một câu trả lời đúng nguồn,
một câu bịa số, một câu quên trích dẫn. Dùng để minh họa trong báo cáo.

    venv/bin/python scripts/demo_grounding.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import grounding, retriever  # noqa: E402

QUERY = "Adults should do at least 150–300 minutes of moderate-intensity aerobic physical activity"
# Giống backend (activityGuideline.fetchSources): lấy top-5, chọn chunk chứa câu khuyến nghị chính
chunks = retriever.retrieve(QUERY, top_k=5, doc_ids=["who_physical_activity_2020"])["chunks"]
chunk = next(c for c in chunks if "75–150 minutes of vigorous" in c["text"])
source = {"id": "S1", **{k: chunk.get(k) for k in ("text", "title", "org", "year", "section", "lang")}}
print(f"Nguồn [S1]: {chunk['title']} ({chunk['org']}, {chunk['year']}) - mục: {chunk['heading']}\n")

CASES = [
    ("Trả lời đúng nguồn",
     "Người trưởng thành nên vận động 150–300 phút cường độ vừa mỗi tuần [S1]. "
     "Ngoài ra nên tập tăng cơ từ 2 ngày mỗi tuần [S1]."),
    ("Bịa số liệu",
     "WHO khuyến nghị người trưởng thành vận động 200 phút mỗi tuần [S1]."),
    ("Có số nhưng quên trích dẫn + trích nguồn không tồn tại",
     "Người lớn nên vận động 75–150 phút cường độ mạnh mỗi tuần. Nên tập 5 ngày mỗi tuần [S4]."),
    ("Số liệu cá nhân của user (được phép, không cần nguồn)",
     "Tuần này bạn mới vận động 90 phút, chưa đạt mức 150 phút mỗi tuần [S1]."),
]

for name, answer in CASES:
    ctx = ["Tuần này bạn vận động 90 phút"] if "cá nhân" in name else []
    r = grounding.verify(answer, [source], allowed_context=ctx, semantic=True)
    print(f"=== {name}")
    print(f"Câu trả lời : {answer}")
    print(f"Kết quả     : {'ĐẠT' if r['passed'] else 'KHÔNG ĐẠT'} | tỷ lệ câu có căn cứ {r['support_ratio']:.2f}")
    for e in r["errors"]:
        print(f"  - lỗi [{e['type']}]: {e['detail']}")
    for w in r["warnings"]:
        print(f"  - cảnh báo [{w['type']}]: {w['detail']}")
    if not r["passed"]:
        print(f"Bản đã sửa  : {r['fixed_answer'] or '(bỏ toàn bộ -> chatbot trả lời: chưa có thông tin đủ tin cậy)'}")
    print()
