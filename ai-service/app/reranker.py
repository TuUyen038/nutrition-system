import math
from functools import lru_cache
from typing import List, Optional

from . import config

_failed = False


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import CrossEncoder

    return CrossEncoder(config.RERANK_MODEL, max_length=config.RERANK_MAX_LENGTH)


def _sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    e = math.exp(x)
    return e / (1.0 + e)


def preload() -> bool:
    """Nạp model rerank lúc khởi động. Trả True nếu dùng được; lỗi thì tự tắt rerank (dùng điểm vector)."""
    global _failed
    if not config.RERANK_ENABLED:
        return False
    try:
        _model()
        return True
    except Exception as exc:  # thiếu mạng, hết bộ nhớ, tên model sai...
        _failed = True
        print(f"[rerank] Không nạp được {config.RERANK_MODEL}: {exc} -> bỏ qua rerank, dùng điểm vector")
        return False


def rerank(query: str, passages: List[str]) -> Optional[List[float]]:
    """Điểm liên quan 0-1 cho từng đoạn (cùng thứ tự). None nếu rerank tắt/lỗi (caller dùng điểm vector)."""
    global _failed
    if not config.RERANK_ENABLED or _failed or not passages:
        return None
    try:
        raw = _model().predict([(query, p) for p in passages], show_progress_bar=False)
    except Exception as exc:
        _failed = True
        print(f"[rerank] Lỗi khi chấm điểm: {exc} -> bỏ qua rerank")
        return None
    scores = [float(s) for s in raw]
    # CrossEncoder 1 nhãn thường đã trả sigmoid; nếu là logit thô thì đổi sang 0-1
    if any(s < 0.0 or s > 1.0 for s in scores):
        scores = [_sigmoid(s) for s in scores]
    return scores
