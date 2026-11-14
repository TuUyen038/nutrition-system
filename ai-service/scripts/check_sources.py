"""Đối chiếu tài liệu markdown với file gốc: chứng minh nội dung là NGUYÊN VĂN, không do AI viết thêm.

Với mỗi tài liệu trong data/sources.yaml:
  1. File gốc tồn tại và sha256 khớp sources.yaml (file gốc không bị thay sau khi đăng ký).
  2. Mọi câu / ô bảng trong markdown (trừ front matter và dòng heading) phải có trong file gốc:
       exact     : khớp nguyên văn (bỏ qua dấu câu, khoảng trắng, xuống dòng)
       near      : >= 90% đoạn ký tự trùng (thường do bảng/cột PDF bị đảo thứ tự) -> nên xem lại
       not_found : KHÔNG có trong file gốc -> FAIL
  3. Mọi con số trong markdown phải xuất hiện trong file gốc.
  4. Heading không có trong file gốc được liệt kê riêng (heading do người/AI thêm, cần duyệt bằng mắt).
  5. Front matter (title/org/year/url/lang) khớp sources.yaml.

    python scripts/check_sources.py                    # mọi tài liệu có file gốc
    python scripts/check_sources.py who_physical_activity_fact_sheet --file data/drafts/who_physical_activity_fact_sheet.md
    python scripts/check_sources.py --verbose          # in các đoạn near/not_found
Exit code 1 nếu có tài liệu FAIL.
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import source_registry as reg  # noqa: E402
from app.grounding import extract_numbers  # noqa: E402
from app.loaders import parse_front_matter  # noqa: E402

MIN_SEGMENT_CHARS = 12  # đoạn ngắn hơn (sau chuẩn hóa) chỉ kiểm tra số liệu
SHINGLE, STEP, NEAR_RATIO = 20, 5, 0.9
CHECK_META = ["title", "org", "year", "url", "lang"]


def segments(body: str):
    """(headings, segments): segment = câu hoặc ô bảng, đã bỏ ký hiệu markdown."""
    headings, segs = [], []
    for line in body.splitlines():
        if not line.strip() or re.fullmatch(r"\s*\|?[\s:|-]+\|?\s*", line) or line.strip() in ("---", "***"):
            continue
        if re.match(r"^\s*#{1,6}\s", line):
            headings.append(reg.strip_markdown(re.sub(r"^\s*#{1,6}\s+", "", line)).strip())
            continue
        parts = [c for c in line.split("|")] if line.strip().startswith("|") else [line]
        for part in parts:
            text = reg.strip_markdown(part).strip()
            if text:
                segs.extend(s for s in re.split(r"(?<=[.!?;])\s+", text) if s.strip())
    return headings, segs


def match(seg_norm: str, src_norm: str, src_shingles: set) -> str:
    if seg_norm in src_norm:
        return "exact"
    grams = [seg_norm[i:i + SHINGLE] for i in range(0, max(1, len(seg_norm) - SHINGLE + 1), STEP)]
    hit = sum(g in src_shingles for g in grams) / len(grams)
    return "near" if hit >= NEAR_RATIO else "not_found"


def check(entry: dict, md_path: Path, verbose: bool) -> bool:
    doc_id = entry["id"]
    original = reg.data_path(entry.get("original"))
    print(f"\n=== {doc_id}  [{entry.get('status', '?')}]  {md_path.relative_to(reg.DATA_DIR.parent) if md_path.is_relative_to(reg.DATA_DIR.parent) else md_path}")
    if not original or not original.exists():
        print(f"  SKIP: chưa có file gốc ({entry.get('original') or 'không khai báo'}) -> không chứng minh được nguồn")
        return True
    if not md_path.exists():
        print(f"  FAIL: không có file markdown {md_path}")
        return False

    problems = []
    digest = reg.sha256(original)
    if not entry.get("sha256"):
        problems.append(f"sources.yaml chưa có sha256 (file gốc hiện tại: {digest})")
    elif entry["sha256"] != digest:
        problems.append(f"sha256 file gốc {digest[:12]}… KHÁC sources.yaml {entry['sha256'][:12]}…")

    meta, body = parse_front_matter(md_path.read_text(encoding="utf-8"))
    for key in CHECK_META:
        a, b = str(meta.get(key) or "").strip(), str(entry.get(key) or "").strip()
        if a != b:
            problems.append(f"front matter `{key}` = '{a}' nhưng sources.yaml = '{b}'")

    src = reg.original_text(original)
    # Khớp với bản gốc HOẶC bản gốc đã bỏ số trích dẫn tham khảo "(101)" (chỉnh sửa duy nhất được phép)
    src_norm = reg.normalize(src) + "\x00" + reg.normalize(reg.strip_reference_marks(src))
    src_shingles = {src_norm[i:i + SHINGLE] for i in range(len(src_norm) - SHINGLE + 1)}
    src_numbers = extract_numbers(src)

    headings, segs = segments(body)
    result = {"exact": [], "near": [], "not_found": []}
    short = 0
    for seg in segs:
        n = reg.normalize(seg)
        if len(n) < MIN_SEGMENT_CHARS:
            short += 1
            continue
        result[match(n, src_norm, src_shingles)].append(seg)

    md_numbers = set()
    for seg in segs:
        md_numbers |= extract_numbers(seg)
    missing_numbers = sorted(md_numbers - src_numbers)
    added_headings = [h for h in headings if reg.normalize(h) and reg.normalize(h) not in src_norm]

    total = sum(len(v) for v in result.values())
    exact_pct = 100 * len(result["exact"]) / total if total else 0
    print(f"  đoạn: {total} (+{short} đoạn ngắn) | exact {len(result['exact'])} ({exact_pct:.1f}%) | "
          f"near {len(result['near'])} | not_found {len(result['not_found'])}")
    print(f"  số liệu: {len(md_numbers)} số, không có trong gốc: {len(missing_numbers)}"
          + (f" -> {', '.join(str(int(x) if x == int(x) else x) for x in missing_numbers[:15])}" if missing_numbers else ""))
    print(f"  heading: {len(headings)}, không có trong gốc (do người/AI thêm, cần duyệt): {len(added_headings)}")
    for h in added_headings[:20]:
        print(f"      + {h}")

    if verbose:
        for kind in ("near", "not_found"):
            for seg in result[kind][:30]:
                print(f"    [{kind}] {seg[:160]}")
    elif result["not_found"]:
        for seg in result["not_found"][:5]:
            print(f"    [not_found] {seg[:160]}")

    if result["not_found"]:
        problems.append(f"{len(result['not_found'])} đoạn không có trong file gốc")
    if missing_numbers:
        problems.append(f"{len(missing_numbers)} con số không có trong file gốc")

    for p in problems:
        print(f"  ! {p}")
    ok = not problems
    print(f"  => {'PASS' if ok else 'FAIL'}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="id trong sources.yaml (bỏ trống = tất cả)")
    ap.add_argument("--file", type=Path, help="markdown cần kiểm tra (mặc định: `file` trong sources.yaml)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    registry = reg.load_registry()
    if not registry:
        sys.exit(f"Chưa có {reg.REGISTRY_FILE}")
    entries = [e for e in registry if not args.ids or e["id"] in args.ids]
    unknown = set(args.ids) - {e["id"] for e in entries}
    if unknown:
        sys.exit(f"Không có trong sources.yaml: {', '.join(sorted(unknown))}")
    if args.file and len(entries) != 1:
        sys.exit("--file chỉ dùng với đúng 1 id")

    results = {}
    for entry in entries:
        md = args.file.resolve() if args.file else reg.data_path(entry.get("file"))
        if md is None:
            print(f"\n=== {entry['id']}: chưa khai báo `file`")
            continue
        results[entry["id"]] = check(entry, md, args.verbose)

    # Tài liệu trong data/raw chưa đăng ký
    registered = reg.entry_by_file(registry)
    unregistered = [p.name for p in sorted(reg.DATA_DIR.joinpath("raw").glob("*")) if p.name.lower() not in registered]
    if unregistered:
        print(f"\n! data/raw có {len(unregistered)} file chưa đăng ký trong sources.yaml: {', '.join(unregistered)}")

    failed = [k for k, v in results.items() if not v]
    print(f"\nTổng: {len(results)} tài liệu, FAIL {len(failed)}" + (f": {', '.join(failed)}" if failed else ""))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
