"""Chuyển infographic (ảnh) thành markdown bằng Gemini vision để đưa vào data/raw.

Ví dụ:
    python scripts/image_to_md.py --image thap_dinh_duong.jpg --title "Tháp dinh dưỡng hợp lý" \
        --org "Viện Dinh dưỡng Quốc gia" --year 2016 --lang vi
Kết quả ghi vào data/raw/<tên ảnh>.md. HÃY ĐỌC LẠI file trước khi ingest (OCR/vision có thể sai số liệu).
"""
import argparse
import mimetypes
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402,F401  (nạp .env)

PROMPT = """Bạn là công cụ số hóa tài liệu. Ảnh là một infographic về dinh dưỡng hoặc hoạt động thể lực.
Hãy chép lại TOÀN BỘ nội dung chữ và số liệu trong ảnh thành markdown, giữ nguyên ngôn ngữ gốc:
- Dùng '## ' cho từng mục/khối chính trong ảnh.
- Bảng thì dùng bảng markdown. Danh sách thì dùng gạch đầu dòng.
- Với hình minh họa mang thông tin (ví dụ nhóm thực phẩm ở từng tầng của tháp), mô tả ngắn bằng chữ.
- KHÔNG thêm kiến thức ngoài ảnh, KHÔNG suy đoán số liệu bị mờ (ghi [không đọc được]).
Chỉ trả về markdown, không giải thích."""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", type=Path, required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--org", default="")
    ap.add_argument("--year", default="")
    ap.add_argument("--url", default="")
    ap.add_argument("--lang", default="vi")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--model", default="gemini-2.5-flash")
    args = ap.parse_args()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        sys.exit("Thiếu GEMINI_API_KEY trong ai/.env")

    from google import genai
    from google.genai import types

    mime = mimetypes.guess_type(args.image.name)[0] or "image/jpeg"
    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=args.model,
        contents=[types.Part.from_bytes(data=args.image.read_bytes(), mime_type=mime), PROMPT],
        config=types.GenerateContentConfig(temperature=0.0),
    )
    body = (resp.text or "").strip()
    if not body:
        sys.exit("Gemini không trả nội dung")

    front = (
        "---\n"
        f"title: \"{args.title}\"\n"
        f"org: \"{args.org}\"\n"
        f"year: \"{args.year}\"\n"
        f"url: \"{args.url}\"\n"
        f"lang: {args.lang}\n"
        "source_type: infographic\n"
        "---\n\n"
    )
    out = args.out or (config.RAW_DIR / f"{args.image.stem}.md")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(front + body + "\n", encoding="utf-8")
    print(f"Đã ghi {out} - nhớ rà lại nội dung trước khi chạy ingest.py")


if __name__ == "__main__":
    main()
