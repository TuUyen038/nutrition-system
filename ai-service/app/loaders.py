import re
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Tuple

import yaml

from . import config

SUPPORTED = {".md", ".markdown", ".txt", ".pdf", ".html", ".htm"}


@dataclass
class Document:
    doc_id: str
    title: str
    org: str
    year: str
    url: str
    lang: str
    text: str
    # Đối tượng của tài liệu: "general" (mặc định) hoặc "infant", ... Dùng để lọc khi truy xuất.
    audience_group: str = "general"
    # Loại dữ liệu để lọc trong RAG: document | ingredient | recipe.
    source_type: str = "document"
    # Mongo _id nếu data đến từ internal Mongo ingestion.
    mongo_id: str = ""
    # Tên profile trong data/chunk_profiles.json (rỗng = tự chọn theo việc tài liệu có heading hay không)
    chunk_profile: str = ""
    # Ghi đè từng tham số chunk ngay trong front matter (chunk_strategy, chunk_max_tokens, ...)
    chunk_overrides: Dict = field(default_factory=dict)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def parse_front_matter(raw: str) -> Tuple[Dict, str]:
    """Tách YAML front matter (--- ... ---) ở đầu file; không có thì trả {}."""
    raw = raw.replace("\r\n", "\n")
    if not raw.startswith("---"):
        return {}, raw
    end = raw.find("\n---", 3)
    if end == -1:
        return {}, raw
    try:
        meta = yaml.safe_load(raw[3:end]) or {}
    except yaml.YAMLError:
        meta = {}
    body = raw[end + 4 :].lstrip("\n")
    return (meta if isinstance(meta, dict) else {}), body


def _pdf_to_markdown(path: Path) -> str:
    import pymupdf4llm  # import trễ: chỉ cần khi có file PDF

    return pymupdf4llm.to_markdown(str(path))


def _html_to_markdown(raw: str) -> str:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    for level in range(1, 7):
        for h in soup.find_all(f"h{level}"):
            h.replace_with(f"\n\n{'#' * level} {h.get_text(strip=True)}\n\n")
    return re.sub(r"\n{3,}", "\n\n", soup.get_text("\n"))


def load_document(path: Path) -> Document:
    ext = path.suffix.lower()
    if ext == ".pdf":
        meta, text = {}, _pdf_to_markdown(path)
    else:
        raw = path.read_text(encoding="utf-8")
        meta, text = parse_front_matter(raw)
        if ext in (".html", ".htm"):
            text = _html_to_markdown(text)

    # Chấp nhận cả tên khóa khác (VD file do công cụ parse PDF sinh ra: document_id, source, language)
    return Document(
        doc_id=str(meta.get("id") or meta.get("document_id") or slugify(path.stem)),
        title=str(meta.get("title") or path.stem.replace("_", " ")),
        org=str(meta.get("org") or meta.get("source") or ""),
        year=str(meta.get("year") or ""),
        url=str(meta.get("url") or ""),
        lang=str(meta.get("lang") or meta.get("language") or ""),
        text=text.strip(),
        audience_group=str(meta.get("audience_group") or "general").strip().lower(),
        chunk_profile=str(meta.get("chunk_profile") or "").strip(),
        chunk_overrides={
            k: meta[k]
            for k in ("chunk_strategy", "chunk_max_tokens", "chunk_overlap", "split_level")
            if k in meta
        },
    )


def load_internal_jsonl(path: Path) -> List[Document]:
    """Load các document đã chuẩn hoá từ Mongo vào `data/internal/*.jsonl`.

    Mỗi dòng có schema:
    {
      "id": "ingredient:...",
      "source_type": "ingredient" | "recipe",
      "title": "...",
      "text": "...",
      "metadata": { ... }
    }
    """
    docs: List[Document] = []
    if not path.exists():
        return docs

    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw:
            continue
        try:
            item = json.loads(raw)
        except json.JSONDecodeError:
            continue

        metadata = item.get("metadata") or {}
        doc = Document(
            doc_id=str(item.get("id") or metadata.get("mongo_id") or slugify(str(item.get("title") or path.stem))),
            title=str(item.get("title") or ""),
            org=str(metadata.get("org") or ""),
            year=str(metadata.get("year") or ""),
            url=str(metadata.get("url") or ""),
            lang=str(metadata.get("lang") or "vi"),
            text=str(item.get("text") or "").strip(),
            audience_group=str(metadata.get("audience_group") or "general").strip().lower(),
            source_type=str(item.get("source_type") or "document").strip().lower(),
            mongo_id=str(metadata.get("mongo_id") or ""),
            chunk_profile="",
            chunk_overrides={},
        )
        if doc.text:
            docs.append(doc)
    return docs


def load_all_documents() -> List[Document]:
    """Kết hợp raw docs và internal docs; internal data phải được bao gồm để RAG không bỏ sót Mongo-based content."""
    docs: List[Document] = []

    raw_dir = config.RAW_DIR
    if raw_dir.exists():
        for path in sorted(raw_dir.rglob("*")):
            if path.is_file() and path.suffix.lower() in {".md", ".markdown", ".txt", ".pdf", ".html", ".htm"}:
                docs.append(load_document(path))

    internal_dir = config.INTERNAL_DIR
    if internal_dir.exists():
        for path in sorted(internal_dir.glob("*.jsonl")):
            docs.extend(load_internal_jsonl(path))

    return docs
