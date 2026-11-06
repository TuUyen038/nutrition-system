import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
SENTENCE_RE = re.compile(r"(?<=[.!?。])\s+")
TABLE_ROW_RE = re.compile(r"^\s*\|")
TABLE_SEP_RE = re.compile(r"^\s*\|[\s:\-|]+\|\s*$")  # hàng phân cách "|---|:---:|"
ITEM_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")  # dòng gạch đầu dòng / đánh số
# Số mục ở đầu tiêu đề: "3.1.3." / "2." / "II." (không đụng "Bảng 1." hay "Phụ lục 2:")
LEADING_NUMBER_RE = re.compile(r"^\s*(?:[IVXLC]+\.|\d+(?:\.\d+)+\.?|\d+\.)\s+")
MIN_CHUNK_TOKENS = 5
# Chỉ lặp lại tiêu đề bảng ở chunk sau nếu tiêu đề không chiếm quá tỷ lệ này của max_tokens
HEADER_MAX_FRACTION = 0.5

DEFAULT_SETTINGS = {
    "chunk_strategy": "section",  # "section" = chia theo mục | "fixed" = chia theo kích thước, bỏ qua heading
    "chunk_max_tokens": 400,
    "chunk_overlap": 60,
    "split_level": 6,  # chỉ tách mục đến cấp heading này; heading sâu hơn gộp vào mục cha
}
SETTING_KEYS = tuple(DEFAULT_SETTINGS)


@dataclass
class Chunk:
    doc_id: str
    index: int
    section: str  # đường dẫn đầy đủ "H1 > H2 > H3" (lưu metadata, KHÔNG đưa vào văn bản embedding)
    text: str  # nội dung chunk; dòng đầu là tiêu đề mục cuối
    heading: str = ""  # tên mục cuối, đã bỏ số mục
    levels: List[str] = field(default_factory=list)  # tiêu đề từng cấp, từ cấp cao nhất


@dataclass
class Section:
    path: str
    levels: List[str]
    heading: str
    body: str


@dataclass
class _Unit:
    """Đơn vị nhỏ nhất khi chia mục dài: một hàng bảng, một mục gạch đầu dòng, hoặc một câu."""

    text: str
    kind: str  # "row" | "item" | "sent"
    header: Optional[Tuple[str, str]] = None  # (hàng tiêu đề, hàng phân cách) cho hàng thân của bảng


# ─── Profile chunk theo tài liệu ─────────────────────────────────────────────


def load_profiles(path: Path) -> Dict[str, Dict]:
    """Đọc data/chunk_profiles.json; thiếu file / sai JSON -> {} (dùng mặc định)."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {k: v for k, v in data.items() if isinstance(v, dict)}


def resolve_settings(
    profiles: Dict[str, Dict],
    profile_name: str,
    overrides: Optional[Dict],
    has_headings: bool,
    cli_max: Optional[int] = None,
    cli_overlap: Optional[int] = None,
    default_max: int = 400,
    default_overlap: int = 60,
) -> Tuple[str, Dict]:
    """Thứ tự ưu tiên (thấp -> cao): mặc định -> profile -> ghi đè trong front matter -> tham số CLI.

    Không khai báo profile: tài liệu có heading dùng "structured", không có dùng "plain".
    """
    name = profile_name or ("structured" if has_headings else "plain")
    if profile_name and profile_name not in profiles:
        raise ValueError(f"chunk_profile '{profile_name}' không có trong chunk_profiles.json ({', '.join(profiles) or 'rỗng'})")

    s = dict(DEFAULT_SETTINGS)
    s["chunk_max_tokens"], s["chunk_overlap"] = default_max, default_overlap
    if name == "plain":
        s["chunk_strategy"] = "fixed"  # phòng khi file profile thiếu
    s.update({k: v for k, v in profiles.get(name, {}).items() if k in SETTING_KEYS})
    s.update({k: v for k, v in (overrides or {}).items() if k in SETTING_KEYS and v is not None})
    if cli_max is not None:
        s["chunk_max_tokens"] = cli_max
    if cli_overlap is not None:
        s["chunk_overlap"] = cli_overlap

    s["chunk_max_tokens"] = int(s["chunk_max_tokens"])
    s["chunk_overlap"] = int(s["chunk_overlap"])
    s["split_level"] = int(s["split_level"])
    s["chunk_strategy"] = str(s["chunk_strategy"])
    if s["chunk_strategy"] not in ("section", "fixed"):
        raise ValueError(f"chunk_strategy phải là 'section' hoặc 'fixed', nhận '{s['chunk_strategy']}'")
    return name, s


# ─── Tách mục ────────────────────────────────────────────────────────────────


def clean_heading(title: str) -> str:
    """Bỏ số mục ở đầu ("3.1.3. Ăn rau" -> "Ăn rau"); không còn gì thì giữ nguyên."""
    t = LEADING_NUMBER_RE.sub("", title.strip()).strip()
    return t or title.strip()


def split_sections(markdown: str, fallback_title: str, split_level: int = 6) -> List[Section]:
    """Tách markdown theo heading -> danh sách Section. Không có heading -> 1 mục mang tên tài liệu."""
    sections: List[Section] = []
    stack: List[Tuple[int, str]] = []
    levels: List[str] = [fallback_title]
    buf: List[str] = []

    def flush():
        body = "\n".join(buf).strip()
        if body:
            sections.append(Section(" > ".join(levels), list(levels), clean_heading(levels[-1]), body))
        buf.clear()

    for line in markdown.splitlines():
        m = HEADING_RE.match(line)
        if m and len(m.group(1)) <= split_level:
            flush()
            level, title = len(m.group(1)), m.group(2)
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, title))
            levels = [t for _, t in stack]
        elif m:
            buf.append(m.group(2))  # heading sâu hơn split_level: giữ như một dòng chữ của mục cha
        else:
            buf.append(line)
    flush()
    return sections


# ─── Chia mục dài theo token (giữ cấu trúc bảng / gạch đầu dòng) ─────────────


def _hard_split(sentence: str, max_tokens: int, count: Callable[[str], int]) -> List[str]:
    """Đoạn dài hơn max_tokens: cắt theo từ."""
    words, out, cur = sentence.split(), [], []
    for w in words:
        cur.append(w)
        if count(" ".join(cur)) >= max_tokens:
            out.append(" ".join(cur))
            cur = []
    if cur:
        out.append(" ".join(cur))
    return out


def _units(text: str, max_tokens: int, count: Callable[[str], int]) -> List[_Unit]:
    """Tách thành các đơn vị. Hàng bảng giữ nguyên cả hàng; hàng thân của bảng nhớ tiêu đề bảng."""
    units: List[_Unit] = []
    table_idx = 0  # thứ tự hàng trong bảng đang đọc (0 = chưa ở trong bảng)
    first_row = ""
    header: Optional[Tuple[str, str]] = None

    for line in text.split("\n"):
        s = line.strip()
        if not s:
            continue

        if TABLE_ROW_RE.match(s):
            if table_idx == 0:
                first_row, header = s, None
            elif table_idx == 1 and TABLE_SEP_RE.match(s):
                header = (first_row, s)
            body_header = header if table_idx >= 2 else None
            table_idx += 1
            if count(s) > max_tokens:
                units.extend(_Unit(p, "row") for p in _hard_split(s, max_tokens, count))
            else:
                units.append(_Unit(s, "row", body_header))
            continue

        table_idx, header = 0, None
        first_kind = "item" if ITEM_RE.match(s) else "sent"
        for j, sent in enumerate(x.strip() for x in SENTENCE_RE.split(s)):
            if not sent:
                continue
            kind = first_kind if j == 0 else "sent"
            if count(sent) > max_tokens:
                parts = _hard_split(sent, max_tokens, count)
                units.extend(_Unit(p, kind if k == 0 else "sent") for k, p in enumerate(parts))
            else:
                units.append(_Unit(sent, kind))
    return units


def _join(units: List[_Unit]) -> str:
    """Hàng bảng và mục gạch đầu dòng nằm trên dòng riêng; các câu văn xuôi nối bằng dấu cách."""
    out: List[str] = []
    prev: Optional[str] = None
    for u in units:
        if prev is not None:
            out.append("\n" if (u.kind != "sent" or prev != "sent") else " ")
        out.append(u.text)
        prev = u.kind
    return "".join(out)


def _overlap_tail(units: List[_Unit], overlap: int, count: Callable[[str], int]) -> List[_Unit]:
    tail: List[_Unit] = []
    t = 0
    for u in reversed(units):
        n = count(u.text)
        if t + n > overlap:
            break
        tail.insert(0, u)
        t += n
    # Không để chunk bắt đầu bằng hàng phân cách "|---|" mồ côi
    while tail and tail[0].kind == "row" and TABLE_SEP_RE.match(tail[0].text):
        tail.pop(0)
    return tail


def _with_headers(units: List[_Unit], max_tokens: int, count: Callable[[str], int]) -> List[_Unit]:
    """Nếu chunk bắt đầu giữa chừng một bảng, chèn lại hàng tiêu đề + hàng phân cách phía trên."""
    out: List[_Unit] = []
    for u in units:
        if u.header and (not out or out[-1].kind != "row"):
            h0, h1 = u.header
            if count(h0) + count(h1) <= max_tokens * HEADER_MAX_FRACTION:
                out.append(_Unit(h0, "row"))
                out.append(_Unit(h1, "row"))
        out.append(u)
    return out


def split_by_tokens(
    text: str, max_tokens: int, overlap: int, count: Callable[[str], int]
) -> List[str]:
    """Gom các đơn vị thành chunk <= max_tokens, mỗi chunk mới lặp lại ~overlap token cuối của chunk trước.

    Giữ nguyên cấu trúc: mỗi hàng bảng / mục gạch đầu dòng trên một dòng; bảng bị cắt giữa chừng
    sẽ được lặp lại tiêu đề ở chunk tiếp theo để các cột vẫn có tên.
    """
    chunks: List[str] = []
    cur: List[_Unit] = []
    cur_tokens = 0
    for u in _units(text, max_tokens, count):
        n = count(u.text)
        if cur and cur_tokens + n > max_tokens:
            chunks.append(_join(cur))
            tail = _overlap_tail(cur, overlap, count)
            cur = _with_headers(tail + [u], max_tokens, count)
            cur_tokens = sum(count(x.text) for x in cur)
            continue
        cur.append(u)
        cur_tokens += n
    if cur:
        last = _join(cur)
        # đuôi chỉ gồm phần overlap đã có trong chunk trước thì bỏ
        if not chunks or last not in chunks[-1]:
            chunks.append(last)
    return chunks


# ─── Chunk cả tài liệu ───────────────────────────────────────────────────────


def chunk_document(
    doc_id: str,
    title: str,
    markdown: str,
    max_tokens: int,
    overlap: int,
    count: Callable[[str], int],
    strategy: str = "section",
    split_level: int = 6,
) -> List[Chunk]:
    """strategy="section": mỗi chunk là nội dung MỘT mục; dòng đầu chunk là tiêu đề mục đó, các cấp cha
    chỉ nằm ở metadata (section/levels). Mục dài bị cắt theo token, mỗi đoạn lặp lại dòng tiêu đề.
    strategy="fixed": bỏ qua cấu trúc mục, chia cả tài liệu theo kích thước.
    """
    out: List[Chunk] = []

    if strategy == "fixed":
        lines = [HEADING_RE.sub(lambda m: m.group(2), ln) for ln in markdown.splitlines()]
        text = "\n".join(lines).strip()
        pieces = [text] if count(text) <= max_tokens else split_by_tokens(text, max_tokens, overlap, count)
        for piece in pieces:
            if count(piece) >= MIN_CHUNK_TOKENS:
                out.append(Chunk(doc_id, len(out), title, piece.strip(), title, [title]))
        return out

    for sec in split_sections(markdown, title, split_level):
        # Chừa chỗ cho dòng tiêu đề để chunk không vượt max_tokens
        budget = max(max_tokens - count(sec.heading), max_tokens // 2)
        pieces = (
            [sec.body]
            if count(sec.body) <= budget
            else split_by_tokens(sec.body, budget, overlap, count)
        )
        for piece in pieces:
            if count(piece) < MIN_CHUNK_TOKENS:
                continue
            text = f"{sec.heading}\n{piece.strip()}" if sec.heading else piece.strip()
            out.append(Chunk(doc_id, len(out), sec.path, text, sec.heading, sec.levels))
    return out
