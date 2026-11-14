"""Sổ đăng ký tài liệu (data/sources.yaml) + đọc văn bản gốc để đối chiếu.

Nguyên tắc: nội dung trong data/raw/*.md phải là NGUYÊN VĂN từ file gốc (PDF/HTML) tải từ nguồn chính thức.
Chỉ được thêm: front matter và dòng heading (#). scripts/check_sources.py kiểm tra điều đó.

Trạng thái (`status`) của một tài liệu:
  draft     : mới chuyển đổi, chưa chạy check_sources      -> ingest BỎ QUA
  checked   : check_sources đạt, chờ người duyệt          -> ingest nạp
  verified  : người đã mở file gốc đối chiếu và ký duyệt   -> ingest nạp
  legacy    : tài liệu cũ, chưa có file gốc để đối chiếu   -> ingest nạp (kèm cảnh báo)
  rejected  : không dùng                                  -> ingest BỎ QUA
"""
import hashlib
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from . import config

DATA_DIR = config.BASE_DIR / "data"
REGISTRY_FILE = DATA_DIR / "sources.yaml"
INGEST_STATUSES = {"checked", "verified", "legacy"}
SKIP_STATUSES = {"draft", "rejected"}


def load_registry(path: Path = REGISTRY_FILE) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return list(data.get("documents") or [])


def find_entry(doc_id: str, registry: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
    for entry in registry if registry is not None else load_registry():
        if entry.get("id") == doc_id:
            return entry
    return None


def entry_by_file(registry: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{tên file trong data/raw (chữ thường): entry}"""
    out = {}
    for entry in registry:
        if entry.get("file"):
            out[Path(entry["file"]).name.lower()] = entry
    return out


def data_path(rel: Optional[str]) -> Optional[Path]:
    return (DATA_DIR / rel) if rel else None


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


# ─── Đọc văn bản gốc ──────────────────────────────────────────────────────────

def html_main(path: Path):
    """Phần nội dung chính của trang (bỏ menu, footer). Trang WHO dùng <article>."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="ignore"), "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return soup.select_one("article") or soup.select_one("main") or soup.body or soup


def load_jats(path: Path):
    """Bài báo JATS XML (định dạng của PubMed Central / Europe PMC)."""
    import warnings

    from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

    warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)
    return BeautifulSoup(path.read_text(encoding="utf-8", errors="ignore"), "html.parser")


def original_text(path: Path) -> str:
    """Toàn bộ chữ trong file gốc (để đối chiếu, không dùng để nạp)."""
    ext = path.suffix.lower()
    if ext == ".xml":
        return load_jats(path).get_text("\n")
    if ext == ".pdf":
        import pymupdf  # đi kèm pymupdf4llm

        with pymupdf.open(str(path)) as pdf:
            return "\n".join(page.get_text() for page in pdf)
    if ext in (".html", ".htm"):
        return html_main(path).get_text("\n")
    return path.read_text(encoding="utf-8", errors="ignore")


# Chỉnh sửa DUY NHẤT được phép với đoạn văn: bỏ số trích dẫn tài liệu tham khảo của bài báo,
# VD "oncology (101)", "health (12, 45)", "exercise (3–5)". Để lại thì LLM dễ nhầm là số liệu.
REFERENCE_MARK_RE = re.compile(r"\s?\(\s*\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\s*\)")


def strip_reference_marks(text: str) -> str:
    return REFERENCE_MARK_RE.sub("", text or "")


def normalize(text: str) -> str:
    """Chỉ giữ chữ và số (bỏ dấu câu, khoảng trắng, gạch nối): so khớp không phụ thuộc xuống dòng,
    tách từ cuối dòng của PDF, ký tự markdown, dấu nháy cong... Dấu tiếng Việt được giữ nguyên."""
    text = unicodedata.normalize("NFKC", text or "").lower()
    return "".join(ch for ch in text if ch.isalnum())


def strip_markdown(line: str) -> str:
    line = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", line)          # ảnh
    line = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", line)       # link -> chữ
    line = re.sub(r"^\s*(?:[-*+•]|\d{1,3}[.)])\s+", "", line)  # dấu đầu dòng
    line = re.sub(r"^\s*>\s?", "", line)                       # trích dẫn
    line = re.sub(r"</?(?:u|b|i|em|strong|sup|sub|br)\s*/?>", "", line)  # thẻ định dạng do công cụ chuyển PDF sinh
    return line.replace("**", "").replace("__", "").replace("`", "")
