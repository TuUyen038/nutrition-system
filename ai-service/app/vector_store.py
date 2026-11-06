from typing import Any, Dict, List, Optional, Tuple

import chromadb

from . import config

_distinct_cache: Dict[Tuple[str, str], Tuple[int, List[str]]] = {}


def get_client() -> "chromadb.api.ClientAPI":
    config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(config.CHROMA_DIR))


def get_collection(name: Optional[str] = None, create: bool = True):
    client = get_client()
    name = name or config.CHROMA_COLLECTION
    if create:
        return client.get_or_create_collection(
            name=name, metadata={"hnsw:space": "cosine"}
        )
    return client.get_collection(name=name)


def reset_collection(name: Optional[str] = None) -> None:
    client = get_client()
    name = name or config.CHROMA_COLLECTION
    try:
        client.delete_collection(name)
    except Exception:
        pass
    _distinct_cache.clear()


def distinct_values(key: str, collection_name: Optional[str] = None) -> List[str]:
    """Các giá trị khác nhau của một trường metadata (VD "lang"). Cache theo số chunk của collection."""
    name = collection_name or config.CHROMA_COLLECTION
    try:
        collection = get_collection(name, create=False)
    except Exception:
        return []
    count = collection.count()
    cached = _distinct_cache.get((name, key))
    if cached and cached[0] == count:
        return cached[1]
    metas = collection.get(include=["metadatas"]).get("metadatas") or []
    values = sorted({str(m.get(key, "")) for m in metas if m is not None})
    _distinct_cache[(name, key)] = (count, values)
    return values


def search(
    query_embedding,
    top_k: int,
    collection_name: Optional[str] = None,
    where: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Trả về tối đa top_k chunk, score = cosine similarity (1 - distance).

    `where` là bộ lọc metadata của Chroma, VD {"lang": "vi"} hoặc
    {"$and": [{"lang": "vi"}, {"audience_group": {"$in": ["general"]}}]}.
    """
    try:
        collection = get_collection(collection_name, create=False)
    except Exception:  # collection chưa tồn tại (chưa chạy ingest)
        return []
    total = collection.count()
    if total == 0:
        return []

    kwargs: Dict[str, Any] = dict(
        query_embeddings=[query_embedding.tolist()],
        n_results=min(top_k, total),
        include=["documents", "metadatas", "distances"],
    )
    if where:
        kwargs["where"] = where
    res = collection.query(**kwargs)

    out = []
    for cid, doc, meta, dist in zip(
        res["ids"][0], res["documents"][0], res["metadatas"][0], res["distances"][0]
    ):
        cos = round(1.0 - float(dist), 4)
        out.append({"id": cid, "text": doc, "score": cos, "vector_score": cos, **meta})
    return out
