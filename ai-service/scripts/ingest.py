"""Đọc data/raw -> chunk -> embed -> upsert vào ChromaDB.

Mỗi tài liệu có thể chọn cách chunk riêng bằng `chunk_profile` trong front matter
(profile định nghĩa ở data/chunk_profiles.json), kèm ghi đè từng tham số nếu cần.

Ví dụ:
    python scripts/ingest.py --reset                                # nạp lại toàn bộ
    python scripts/ingest.py --only huong_dan_an_bo_sung.md         # chỉ nạp lại một tài liệu
    python scripts/ingest.py --chunk-size 300 --overlap 50 --collection kb_c300   # thử tham số cho MỌI tài liệu
    python scripts/ingest.py --embed-prefix path --collection kb_path             # A/B với cách cũ (có đường dẫn mục)
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, embedding, vector_store  # noqa: E402
from app.chunking import chunk_document, load_profiles, resolve_settings  # noqa: E402
from app.loaders import SUPPORTED, load_document, load_internal_jsonl  # noqa: E402

HEADING_LINE_RE = re.compile(r"^#{1,6}\s", re.M)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", type=Path, default=config.RAW_DIR)
    ap.add_argument("--collection", default=config.CHROMA_COLLECTION)
    ap.add_argument("--only", nargs="+", metavar="FILE", help="chỉ nạp (lại) các file này, tên file trong --path")
    ap.add_argument("--chunk-size", type=int, default=None, help="ghi đè chunk_max_tokens cho mọi tài liệu")
    ap.add_argument("--overlap", type=int, default=None, help="ghi đè chunk_overlap cho mọi tài liệu")
    ap.add_argument(
        "--embed-prefix",
        choices=["none", "path"],
        default="none",
        help="none (mặc định): embed đúng nội dung chunk | path: thêm 'tiêu đề | đường dẫn mục' như cách cũ",
    )
    ap.add_argument("--reset", action="store_true", help="xóa collection trước khi nạp")
    args = ap.parse_args()

    if args.reset and args.only:
        sys.exit("Không dùng --reset cùng --only (reset xóa cả kho). Bỏ --reset để chỉ thay các tài liệu đã chọn.")

    scan_roots = [args.path]
    if args.path.resolve() == config.RAW_DIR.resolve():
        scan_roots.append(config.INTERNAL_DIR)

    files = []
    for root in scan_roots:
        if not root.exists():
            continue
        if root.is_file():
            files.append(root)
            continue
        files.extend(
            sorted(
                p for p in root.rglob("*") if p.suffix.lower() in SUPPORTED or p.suffix.lower() == ".jsonl"
            )
        )

    files = sorted({p.resolve(): p for p in files}.values(), key=lambda p: str(p))

    if args.only:
        wanted = {n.lower() for n in args.only}
        files = [p for p in files if p.name.lower() in wanted]
        missing = wanted - {p.name.lower() for p in files}
        if missing:
            sys.exit(f"Không tìm thấy trong {args.path}: {', '.join(sorted(missing))}")
    if not files:
        print(f"Không có tài liệu nào trong {args.path}")
        return

    profiles = load_profiles(config.CHUNK_PROFILES_FILE)
    if args.reset:
        vector_store.reset_collection(args.collection)
    collection = vector_store.get_collection(args.collection)

    total = 0
    for path in files:
        docs = load_internal_jsonl(path) if path.suffix.lower() == ".jsonl" else [load_document(path)]
        for doc in docs:
            try:
                profile_name, s = resolve_settings(
                    profiles,
                    doc.chunk_profile,
                    doc.chunk_overrides,
                    has_headings=bool(HEADING_LINE_RE.search(doc.text)),
                    cli_max=args.chunk_size,
                    cli_overlap=args.overlap,
                    default_max=config.CHUNK_MAX_TOKENS,
                    default_overlap=config.CHUNK_OVERLAP_TOKENS,
                )
            except ValueError as exc:
                sys.exit(f"{path.name}: {exc}")

            chunks = chunk_document(
                doc.doc_id,
                doc.title,
                doc.text,
                s["chunk_max_tokens"],
                s["chunk_overlap"],
                embedding.count_tokens,
                strategy=s["chunk_strategy"],
                split_level=s["split_level"],
            )
            if not chunks:
                print(f"[skip] {path.name}: không tạo được chunk nào")
                continue

            # Nạp lại tài liệu = thay thế toàn bộ chunk cũ của nó (idempotent)
            collection.delete(where={"doc_id": doc.doc_id})

            if args.embed_prefix == "path":
                texts = [f"{doc.title} | {c.section}\n{c.text}" for c in chunks]
            else:
                texts = [c.text for c in chunks]  # đường dẫn mục chỉ nằm ở metadata, không đưa vào embedding
            vectors = embedding.embed_passages(texts)

            metadatas = []
            for c in chunks:
                meta = {
                    "doc_id": doc.doc_id,
                    "title": doc.title,
                    "org": doc.org,
                    "year": doc.year,
                    "url": doc.url,
                    "lang": doc.lang,
                    "audience_group": doc.audience_group,
                    "source_type": doc.source_type,
                    "mongo_id": doc.mongo_id,
                    "chunk_profile": profile_name,
                    "section": c.section,
                    "heading": c.heading,
                    "chunk_index": c.index,
                }
                for i, level in enumerate(c.levels[:5], start=1):  # Chroma chỉ nhận giá trị đơn: mỗi cấp một khóa
                    meta[f"h{i}"] = level
                metadatas.append(meta)

            collection.upsert(
                ids=[f"{doc.doc_id}::{c.index:04d}" for c in chunks],
                embeddings=vectors.tolist(),
                documents=[c.text for c in chunks],
                metadatas=metadatas,
            )
            total += len(chunks)
            print(
                f"[ok] {path.name}: {len(chunks)} chunk | doc_id={doc.doc_id} lang={doc.lang or '-'} "
                f"audience={doc.audience_group} | source={doc.source_type} | profile={profile_name} "
                f"({s['chunk_strategy']}, {s['chunk_max_tokens']}/{s['chunk_overlap']})"
            )

    print(f"Xong. Thêm {total} chunk; collection '{args.collection}' hiện có {collection.count()} chunk "
          f"(embed-prefix={args.embed_prefix}).")


if __name__ == "__main__":
    main()
