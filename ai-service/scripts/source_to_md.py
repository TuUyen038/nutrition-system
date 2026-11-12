"""Chuyển file gốc (PDF/HTML) đã đăng ký trong data/sources.yaml thành bản nháp markdown NGUYÊN VĂN.

Script chỉ trích chữ từ file gốc, KHÔNG viết thêm nội dung. Front matter lấy từ sources.yaml.
Bản nháp ghi vào data/drafts/<id>.md. Sau đó:
  1. (tùy chọn) thêm/sửa dòng heading `##` cho dễ chunk theo mục; KHÔNG sửa chữ trong đoạn văn
  2. python scripts/check_sources.py <id>       -> phải PASS
  3. chép sang data/raw/, đổi status trong sources.yaml thành `checked`, rồi ingest --only

Ví dụ:
    python scripts/source_to_md.py who_physical_activity_fact_sheet
    python scripts/source_to_md.py acsm_resistance_training_2026 --drop-ref-marks --skip-sections METHODS REFERENCES "Supplementary Material" Footnotes "Associated Data"
    python scripts/source_to_md.py us_physical_activity_guidelines_2018 --pages 8-10,29-31,55-65 --drop-ref-marks
    python scripts/source_to_md.py acsm_quantity_quality_2011 --pages 1-26 --stop-at "REFERENCES"
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import source_registry as reg  # noqa: E402

FRONT_KEYS = ["id", "title", "org", "year", "url", "lang", "audience_group", "chunk_profile"]


def parse_pages(spec: str):
    """'1-5,8' -> [0,1,2,3,4,7] (pymupdf đánh số từ 0)."""
    pages = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        pages.extend(range(int(a) - 1, int(b or a)))
    return pages


def pdf_to_md(path: Path, pages=None) -> str:
    import pymupdf4llm

    return pymupdf4llm.to_markdown(str(path), pages=pages)


def pdf_blocks_to_md(path: Path, pages=None, skip_headings=()) -> str:
    """Trích PDF theo khối chữ, giữ đúng thứ tự đọc của PDF (pymupdf4llm hay trộn cột chính với khung bên lề).

    - Mỗi trang: cột trái (x < 55% bề ngang) trước, cột phải sau; trong cột xếp từ trên xuống.
    - Dòng liền nhau cùng cỡ chữ -> một đoạn; khoảng cách lớn / đổi cỡ chữ -> đoạn mới.
    - Chữ đậm, cỡ lớn hơn chữ thường -> heading (## / ### / ####).
    - Bỏ header/footer (dải 45pt trên/dưới trang: số trang, tên tài liệu).
    - Khung bên lề làm lẫn mục: đầu trang sau, nếu cột trái không mở bằng heading, lặp lại heading mục chính trước đó.
    Chỉ ghép/xếp chữ, không đổi chữ.
    """
    import pymupdf

    doc = pymupdf.open(str(path))
    out = []
    last_main_heading = None
    skip = [h.lower() for h in skip_headings]
    skipping = False
    # Tên chương lấy từ mục lục (bookmark) của PDF: "Chapter 4. Active Adults", "Appendix 1. ..."
    toc = doc.get_toc()
    chapters = []
    for i, (lvl, t, p) in enumerate(toc):
        if lvl == 2 and re.match(r"(Chapter|Appendix)\s+\d", t.strip()):
            if p <= 0:  # bookmark thiếu số trang: lấy trang của mục con đầu tiên có số trang
                p = next((q for _, _, q in toc[i + 1:] if q > 0), 0)
            if p > 0:
                chapters.append((p - 1, t.strip()))
    chapters.sort()
    current_chapter = None
    for pno in pages if pages is not None else range(doc.page_count):
        page = doc[pno]
        width, height = page.rect.width, page.rect.height
        lines = []
        for b in page.get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for ln in b["lines"]:
                spans = [sp for sp in ln["spans"] if sp["text"].strip()]
                if not spans:
                    continue
                x0, y0, x1, y1 = ln["bbox"]
                if y1 < 45 or y0 > height - 45:
                    continue  # header / footer
                text = " ".join("".join(sp["text"] for sp in ln["spans"]).split())
                size = round(max(sp["size"] for sp in spans), 1)
                bold = all((re.search(r"Bold|Medium|Semi|Demi|Black|Heavy", sp["font"]) or sp["flags"] & 16) for sp in spans)
                col = 0 if x0 < width * 0.55 else 1
                lines.append(dict(text=text, size=size, bold=bold, col=col, x0=x0, y0=y0, y1=y1))
        if not lines:
            continue
        chapter = next((t for p0, t in reversed(chapters) if p0 <= pno), None)
        if chapter and chapter != current_chapter:
            out += ["", f"## {chapter}", ""]
            current_chapter, last_main_heading, skipping = chapter, None, False
        body_size = max(set(l["size"] for l in lines), key=lambda s: sum(len(l["text"]) for l in lines if l["size"] == s))

        for col in (0, 1):
            col_lines = sorted((l for l in lines if l["col"] == col), key=lambda l: (round(l["y0"]), l["x0"]))
            # Dòng nối vào đoạn có cùng lề trái (hoặc thụt vào sau dấu "•") và nằm ngay phía trên;
            # nhờ vậy các cột con của bảng không bị trộn theo hàng ngang.
            paras = []
            for l in col_lines:
                is_head = l["bold"] and l["size"] >= body_size + 1.5
                bullet = l["text"].startswith(("•", "▪", "◦"))
                target = None
                if not bullet:
                    for para in reversed(paras[-8:]):
                        same_margin = (abs(l["x0"] - para["x0"]) <= 8 or (para["bullet"] and 0 < l["x0"] - para["x0"] <= 20)
                                       or (is_head and para["head"]))  # heading căn giữa xuống dòng
                        if (para["head"] == is_head and abs(l["size"] - para["size"]) <= 0.6 and same_margin
                                and -l["size"] * 0.5 <= l["y0"] - para["y1"] <= l["size"] * 0.8):
                            target = para
                            break
                if target is not None:
                    target["parts"].append(l["text"])
                    target["y1"] = l["y1"]
                else:
                    paras.append(dict(head=is_head, size=l["size"], parts=[l["text"]], x0=l["x0"], y0=l["y0"], y1=l["y1"], bullet=bullet))
            paras = _columns_first(paras)
            if col == 0 and paras and not paras[0]["head"] and last_main_heading and not skipping:
                out += ["", last_main_heading, ""]
            for para in paras:
                text = ""
                for part in para["parts"]:
                    text = text + part if text.endswith("-") or not text else f"{text} {part}"
                if para["head"]:
                    # Bỏ cả mục (heading + nội dung tới heading kế tiếp) nếu heading bắt đầu bằng chuỗi trong --skip-headings
                    skipping = any(text.lower().startswith(h) for h in skip)
                    if skipping:
                        continue
                elif skipping:
                    continue
                if para["head"]:
                    level = (2 if para["size"] >= body_size + 8 else 3 if para["size"] >= body_size + 4 else 4)
                    if chapters:
                        level = max(level, 3)
                    heading = f"{'#' * level} {text}"
                    out += ["", heading, ""]
                    if col == 0:
                        last_main_heading = heading
                else:
                    out += [text, ""]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"


def _columns_first(paras):
    """Bảng nhiều cột (VD Table 5-1: cột Aerobic | cột Muscle-strengthening) bị đọc theo hàng ngang sẽ trộn hai cột.
    Tìm các đoạn liên tiếp có "hàng xóm" cùng độ cao nhưng khác lề trái (> 40pt), rồi đọc vùng đó theo cột: trái hết rồi mới phải."""
    def side_by_side(i):
        p = paras[i]
        return any(
            j != i and abs(q["x0"] - p["x0"]) > 40 and q["y0"] <= p["y1"] and p["y0"] <= q["y1"]
            for j, q in enumerate(paras)
        )

    flags = [side_by_side(i) for i in range(len(paras))]
    out, i = [], 0
    while i < len(paras):
        if not flags[i]:
            out.append(paras[i])
            i += 1
            continue
        j = i
        while j < len(paras) and flags[j]:
            j += 1
        region = paras[i:j]
        out.extend(sorted(region, key=lambda p: (round(p["x0"] / 20), p["y0"])))
        i = j
    return out


def html_to_md(path: Path) -> str:
    """Giữ nguyên chữ; chỉ chuyển cấu trúc: h1-h6 -> #, li -> '- ', p/td giữ nguyên dòng."""
    root = reg.html_main(path)
    lines = []
    for el in root.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "tr"]):
        if el.find_parent(["li", "tr"]) is not None and el.name in ("p", "li"):
            continue  # đoạn nằm trong li/bảng đã được lấy cùng phần tử cha
        # get_text(" ") chèn khoảng trắng quanh thẻ <strong>/<a>: bỏ khoảng trắng thừa trước dấu câu (không đổi chữ)
        text = re.sub(r"\s+([,.;:!?])", r"\1", " ".join(el.get_text(" ").split()))
        if not text:
            continue
        if el.name.startswith("h"):
            lines += ["", f"{'#' * int(el.name[1])} {text}", ""]
        elif el.name == "li":
            lines.append(f"- {text}")
        elif el.name == "tr":
            cells = [" ".join(c.get_text(" ").split()) for c in el.find_all(["td", "th"])]
            lines.append("| " + " | ".join(cells) + " |")
        else:
            lines += ["", text, ""]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() + "\n"


def _clean(el) -> str:
    return re.sub(r"\s+([,.;:!?])", r"\1", " ".join(el.get_text(" ").split()))


def _jats_table(tw) -> list:
    lines = []
    label = tw.find("label")
    caption = tw.find("caption")
    head = " ".join(_clean(x) for x in (label, caption) if x is not None)
    if head:
        lines += ["", head, ""]
    rows = 0
    for tr in tw.find_all("tr"):
        cells = [_clean(c) for c in tr.find_all(["td", "th"])]
        if any(cells):
            lines.append("| " + " | ".join(cells) + " |")
            rows += 1
            if rows == 1:  # hàng phân cách: chunker lặp lại hàng tiêu đề khi bảng bị cắt
                lines.append("|" + "---|" * len(cells))
    foot = tw.find("table-wrap-foot")
    if foot is not None:
        lines += ["", _clean(foot)]
    return lines + [""]


def jats_to_md(path: Path, skip_sections, max_level: int = 6, skip_tables=()) -> str:
    """Bài báo JATS XML (PMC): Abstract + các section (trừ skip_sections) + bảng, giữ nguyên chữ."""
    x = reg.load_jats(path)
    skip = {s.strip().lower() for s in skip_sections}
    skip_tables = {t.strip().lower() for t in skip_tables}

    def table(tw):
        label = tw.find("label")
        if label is not None and _clean(label).rstrip(".").lower() in skip_tables:
            return []
        return _jats_table(tw)
    lines = []

    abstract = x.find("abstract")
    if abstract is not None:
        lines += ["## Abstract", ""]
        parts = abstract.find_all("sec") or [abstract]
        for sec in parts:
            title = sec.find("title")
            text = " ".join(_clean(p) for p in sec.find_all("p"))
            lines += [f"{_clean(title)}: {text}" if title is not None else text, ""]

    def walk(sec, level):
        title = sec.find("title", recursive=False)
        name = _clean(title) if title is not None else ""
        if name.lower() in skip:
            return
        if name and level <= max_level:
            lines.extend(["", f"{'#' * min(level, 6)} {name}", ""])
        elif name:
            lines.extend([name, ""])  # mục con quá nhỏ: giữ tiêu đề như một dòng chữ, nội dung gộp vào mục cha
        for child in sec.find_all(recursive=False):
            if child.name == "p":
                tables = child.find_all("table-wrap")
                for tw in tables:
                    tw.extract()
                text = _clean(child)
                if text:
                    lines.extend([text, ""])
                for tw in tables:
                    lines.extend(table(tw))
            elif child.name == "table-wrap":
                lines.extend(table(child))
            elif child.name == "list":
                lines.extend(f"- {_clean(li)}" for li in child.find_all("list-item"))
                lines.append("")
            elif child.name == "sec":
                walk(child, level + 1)

    body = x.find("body")
    for sec in body.find_all("sec", recursive=False) if body is not None else []:
        walk(sec, 2)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() + "\n"


def front_matter(entry: dict) -> str:
    out = ["---"]
    for key in FRONT_KEYS:
        value = entry.get(key)
        if value is None or value == "":
            continue
        out.append(f'{key}: "{value}"' if key in ("title", "org", "url", "year") else f"{key}: {value}")
    out.append(f"source_id: {entry['id']}  # xem data/sources.yaml")
    out.append("---")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("doc_id")
    ap.add_argument("--pages", help="chỉ lấy các trang PDF này, VD 1-20 hoặc 3-10,12")
    ap.add_argument("--pdf-engine", choices=["blocks", "pymupdf4llm"], default="blocks",
                    help="blocks (mặc định): giữ thứ tự đọc của PDF, an toàn với trang nhiều cột | pymupdf4llm: nhận bảng tốt hơn")
    ap.add_argument("--skip-headings", nargs="*", default=[],
                    help="(PDF blocks) bỏ cả mục có heading bắt đầu bằng các chuỗi này, VD 'Learn More'")
    ap.add_argument("--max-heading-level", type=int, default=6,
                    help="(XML) mục sâu hơn cấp này không thành heading riêng, nội dung gộp vào mục cha")
    ap.add_argument("--skip-tables", nargs="*", default=[], help="(XML) bỏ các bảng có nhãn này, VD 'TABLE 3'")
    ap.add_argument("--exclude-paragraphs", nargs="*", default=[], metavar="REGEX",
                    help="bỏ các đoạn (dòng) khớp regex, VD '^This article is being published'")
    ap.add_argument("--stop-at", help="cắt từ dòng đầu tiên bắt đầu bằng chuỗi này (VD 'REFERENCES')")
    ap.add_argument("--drop-ref-marks", action="store_true",
                    help="bỏ số trích dẫn tham khảo kiểu '(12)', '(3, 5)' của bài báo (chỉnh sửa duy nhất được phép)")
    ap.add_argument("--skip-sections", nargs="*", default=["Supplementary Material", "Footnotes", "REFERENCES", "Associated Data"],
                    help="(XML) bỏ các section có tiêu đề này")
    ap.add_argument("--out", type=Path, default=reg.DATA_DIR / "drafts")
    args = ap.parse_args()

    entry = reg.find_entry(args.doc_id)
    if not entry:
        sys.exit(f"Không có '{args.doc_id}' trong {reg.REGISTRY_FILE}. Thêm entry trước.")
    original = reg.data_path(entry.get("original"))
    if not original or not original.exists():
        sys.exit(f"Chưa có file gốc: {original}. Tải từ {entry.get('url')} và lưu đúng đường dẫn này.")

    digest = reg.sha256(original)
    if entry.get("sha256") and entry["sha256"] != digest:
        sys.exit(f"sha256 file gốc ({digest}) KHÁC sources.yaml ({entry['sha256']}). File đã bị thay?")

    ext = original.suffix.lower()
    if ext == ".pdf":
        pages = parse_pages(args.pages) if args.pages else None
        body = (pdf_blocks_to_md(original, pages, args.skip_headings) if args.pdf_engine == "blocks"
                else pdf_to_md(original, pages))
    elif ext in (".html", ".htm"):
        body = html_to_md(original)
    elif ext == ".xml":
        body = jats_to_md(original, args.skip_sections, args.max_heading_level, args.skip_tables)
    else:
        sys.exit(f"Chưa hỗ trợ {ext}")

    if args.stop_at:
        m = re.search(rf"^[#*\s]*{re.escape(args.stop_at)}", body, re.M | re.I)
        if m:
            body = body[: m.start()]

    if args.exclude_paragraphs:
        # Bỏ cả đoạn (dòng) khớp mẫu, VD lời cảm ơn / xung đột lợi ích / đóng góp tác giả. Chỉ bớt, không sửa chữ.
        pats = [re.compile(p, re.I) for p in args.exclude_paragraphs]
        body = "\n".join(l for l in body.splitlines() if not any(p.search(l) for p in pats))

    if args.drop_ref_marks:
        body = reg.strip_reference_marks(body)

    args.out.mkdir(parents=True, exist_ok=True)
    out = args.out / f"{entry['id']}.md"
    out.write_text(f"{front_matter(entry)}\n\n{body.strip()}\n", encoding="utf-8")
    print(f"[ok] {out}  ({len(body.split())} từ)")
    print(f"     sha256 file gốc: {digest}" + ("" if entry.get("sha256") else "  <- chép vào sources.yaml"))
    print(f"     Tiếp theo: python scripts/check_sources.py {entry['id']} --file {out}")


if __name__ == "__main__":
    main()
