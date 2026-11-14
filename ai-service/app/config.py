import os
from pathlib import Path
from typing import Dict, Optional

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _path(value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else (BASE_DIR / p).resolve()


def _flag(name: str, default: str = "1") -> bool:
    return os.getenv(name, default).strip().lower() not in ("0", "false", "no", "off", "")


def _by_lang(prefix: str, defaults: Optional[Dict[str, float]] = None) -> Dict[str, float]:
    """Đọc các biến môi trường dạng <prefix><LANG>=số (VD LANG_SCORE_OFFSET_EN=0.06) thành {"en": 0.06}."""
    out = dict(defaults or {})
    for key, value in os.environ.items():
        if key.startswith(prefix) and value.strip():
            try:
                out[key[len(prefix):].lower()] = float(value)
            except ValueError:
                pass
    return out


EMBED_MODEL = os.getenv("EMBED_MODEL", "intfloat/multilingual-e5-base")
CHROMA_DIR = _path(os.getenv("CHROMA_DIR", "./chroma_db"))
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION", "nutrition_kb_2")

# Giá trị dự phòng khi tài liệu / profile không khai báo (profile trong data/chunk_profiles.json ưu tiên hơn)
CHUNK_MAX_TOKENS = int(os.getenv("CHUNK_MAX_TOKENS", "400"))
CHUNK_OVERLAP_TOKENS = int(os.getenv("CHUNK_OVERLAP_TOKENS", "60"))

TOP_K = int(os.getenv("TOP_K", "5"))

# Reranker (cross-encoder) chấm lại các ứng viên lấy từ vector search.
# Mặc định TẮT: điểm rerank của cặp câu hỏi tiếng Việt - tài liệu tiếng Anh gần như bằng 0 nên không so sánh được giữa các ngôn ngữ.
RERANK_ENABLED = _flag("RERANK_ENABLED", "0")
RERANK_MODEL = os.getenv("RERANK_MODEL", "BAAI/bge-reranker-v2-m3")
# Số ứng viên lấy cho MỖI ngôn ngữ (lang) có trong kho trước khi rerank
RERANK_CANDIDATES_PER_LANG = int(os.getenv("RERANK_CANDIDATES_PER_LANG", "10"))
# Ngưỡng coi một chunk là "liên quan": theo điểm rerank (0-1) hoặc điểm cosine khi tắt rerank
RELEVANCE_THRESHOLD = float(os.getenv("RELEVANCE_THRESHOLD", "0.3"))
VECTOR_RELEVANCE_THRESHOLD = float(os.getenv("VECTOR_RELEVANCE_THRESHOLD", "0.77"))
# Ngưỡng riêng theo ngôn ngữ của chunk (VECTOR_RELEVANCE_THRESHOLD_VI, VECTOR_RELEVANCE_THRESHOLD_EN...),
# ngôn ngữ không khai báo dùng VECTOR_RELEVANCE_THRESHOLD. Đặt theo gợi ý của scripts/eval_generic.py
VECTOR_RELEVANCE_THRESHOLDS = _by_lang("VECTOR_RELEVANCE_THRESHOLD_")
# Độ lệch cộng vào điểm cosine của chunk theo ngôn ngữ, CHỈ để xếp hạng khi gộp kết quả các ngôn ngữ:
# câu hỏi tiếng Việt khớp chunk tiếng Việt cao hơn chunk tiếng Anh khoảng 0.06 dù nội dung liên quan như nhau.
# Đặt LANG_SCORE_OFFSET_EN=0 để tắt.
LANG_SCORE_OFFSETS = _by_lang("LANG_SCORE_OFFSET_", {"en": 0.05})

# Trừ điểm xếp hạng chunk thuộc mục dành riêng cho một nhóm (người cao tuổi, trẻ em, bà bầu, người khuyết tật)
# khi câu hỏi không nhắc nhóm đó. 0 = tắt. Chọn theo scripts/eval_ablation.py
SECTION_AUDIENCE_PENALTY = float(os.getenv("SECTION_AUDIENCE_PENALTY", "0.04"))

ROUTER_KEYWORD_BOOST = float(os.getenv("ROUTER_KEYWORD_BOOST", "0.05"))
ROUTER_MARGIN = float(os.getenv("ROUTER_MARGIN", "0.015"))
ROUTER_SUB_MARGIN = float(os.getenv("ROUTER_SUB_MARGIN", "0.01"))
ROUTER_OOS_MARGIN = float(os.getenv("ROUTER_OOS_MARGIN", "0.005"))


EMBED_MAX_SEQ_LEN = int(os.getenv("EMBED_MAX_SEQ_LEN", "1024"))
EMBED_QUERY_PREFIX = os.getenv("EMBED_QUERY_PREFIX", "")
EMBED_PASSAGE_PREFIX = os.getenv("EMBED_PASSAGE_PREFIX", "")
RERANK_MAX_LENGTH = int(os.getenv("RERANK_MAX_LENGTH", "1024"))


INTERNAL_KEY = os.getenv("INTERNAL_KEY", "")

# Kiểm tra chống ảo giác (/rag/verify, app/grounding.py)
# Bật lớp so khớp ngữ nghĩa câu trả lời <-> chunk được trích (dùng model embedding đã nạp sẵn)
GROUNDING_SEMANTIC = _flag("GROUNDING_SEMANTIC", "1")
# Cosine tối thiểu giữa một câu và chunk nó trích (chunk tiếng Anh tự hạ theo LANG_SCORE_OFFSET_EN).
# Chỉ sinh cảnh báo, không làm câu trả lời bị đánh trượt. Chỉnh theo scripts/eval_grounding.py
GROUNDING_SIM_THRESHOLD = float(os.getenv("GROUNDING_SIM_THRESHOLD", "0.78"))
# Các số quá phổ biến không cần nguồn (VD "1 tuần", "0 phút")
GROUNDING_IGNORE_NUMBERS = [
    x.strip() for x in os.getenv("GROUNDING_IGNORE_NUMBERS", "0,1").split(",") if x.strip()
]

RAW_DIR = BASE_DIR / "data" / "raw"
INTERNAL_DIR = BASE_DIR / "data" / "internal"
INTENTS_FILE = BASE_DIR / "data" / "intents" / "exemplars.json"
CHUNK_PROFILES_FILE = BASE_DIR / "data" / "chunk_profiles.json"
EVAL_DIR = BASE_DIR / "data" / "eval"


def vector_threshold(lang: Optional[str]) -> float:
    """Ngưỡng cosine để coi chunk (theo ngôn ngữ của nó) là liên quan, khi không rerank."""
    return VECTOR_RELEVANCE_THRESHOLDS.get((lang or "").lower(), VECTOR_RELEVANCE_THRESHOLD)


def lang_offset(lang: Optional[str]) -> float:
    """Độ lệch xếp hạng của chunk theo ngôn ngữ (0 nếu không khai báo)."""
    return LANG_SCORE_OFFSETS.get((lang or "").lower(), 0.0)
