from functools import lru_cache
from typing import List

import numpy as np
from sentence_transformers import SentenceTransformer

from . import config


@lru_cache(maxsize=1)
def get_model() -> SentenceTransformer:
    model = SentenceTransformer(config.EMBED_MODEL)
    # BGE-M3 mặc định 8192 token, tốn RAM khi batch. Giới hạn theo chunk thực tế.
    if config.EMBED_MAX_SEQ_LEN:
        model.max_seq_length = config.EMBED_MAX_SEQ_LEN
    return model


def count_tokens(text: str) -> int:
    tokenizer = get_model().tokenizer
    return len(tokenizer.encode(text, add_special_tokens=False))


def embed_passages(texts: List[str], batch_size: int = 16) -> np.ndarray:
    return get_model().encode(
        [f"{config.EMBED_PASSAGE_PREFIX}{t}" for t in texts],
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=len(texts) > 32,
    )


def embed_queries(texts: List[str], batch_size: int = 32) -> np.ndarray:
    return get_model().encode(
        [f"{config.EMBED_QUERY_PREFIX}{t}" for t in texts],
        batch_size=batch_size,
        normalize_embeddings=True,
    )