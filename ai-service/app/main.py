import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import config, embedding, grounding, reranker, retriever, vector_store
from .intent_router import IntentRouter

state = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    embedding.get_model()  # tải model embedding 1 lần lúc khởi động
    state["router"] = IntentRouter()
    state["reranker_ready"] = reranker.preload()
    yield


app = FastAPI(title="NutriCare AI Service", lifespan=lifespan)


def verify_key(x_internal_key: Optional[str] = Header(default=None)):
    if config.INTERNAL_KEY and x_internal_key != config.INTERNAL_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal key")


class ClassifyRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=config.TOP_K, ge=1, le=20)
    # Tùy chọn: ép danh sách audience_group được tìm (VD ["general", "infant"]); bỏ trống = tự phát hiện
    audiences: Optional[List[str]] = None
    # Tùy chọn: chỉ tìm trong các tài liệu này (doc_id trong data/sources.yaml), VD ["who_physical_activity_2020"]
    doc_ids: Optional[List[str]] = Field(default=None, max_length=20)


class VerifySource(BaseModel):
    id: str = Field(min_length=1, max_length=16)  # "S1", "S2"...
    text: str = ""
    title: Optional[str] = None
    org: Optional[str] = None
    year: Optional[str] = None
    section: Optional[str] = None
    lang: Optional[str] = None


class VerifyRequest(BaseModel):
    answer: str = Field(max_length=20000)
    sources: List[VerifySource] = Field(default_factory=list, max_length=50)
    # Văn bản được phép chứa số liệu mà không cần nguồn RAG: câu hỏi, hồ sơ user, kết quả database tool
    allowed_context: List[str] = Field(default_factory=list, max_length=50)
    # None = theo GROUNDING_SEMANTIC trong .env
    semantic: Optional[bool] = None


@app.get("/health")
def health():
    try:
        count = vector_store.get_collection(create=False).count()
    except Exception:
        count = 0
    return {
        "status": "ok",
        "model": config.EMBED_MODEL,
        "chunks": count,
        "reranker": {
            "enabled": config.RERANK_ENABLED,
            "ready": bool(state.get("reranker_ready")),
            "model": config.RERANK_MODEL,
        },
    }


@app.post("/router/classify", dependencies=[Depends(verify_key)])
def classify(req: ClassifyRequest):
    t0 = time.perf_counter()
    result = state["router"].classify(req.text)
    # Router local chỉ chịu trách nhiệm định tuyến nhóm lớn.
    # Gemini sẽ xác định sub-intent và chọn tool ở phía Node.
    if result.get("intent") != "chitchat":
        result["sub_intent"] = None
    result["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return result


@app.post("/rag/retrieve", dependencies=[Depends(verify_key)])
def retrieve(req: RetrieveRequest):
    
    t0 = time.perf_counter()
    result = retriever.retrieve(req.query, req.top_k, audiences=req.audiences, doc_ids=req.doc_ids)
    return {
        "query": req.query,
        "chunks": result["chunks"],
        "reranked": result["reranked"],
        "threshold": result["threshold"],
        "thresholds": result["thresholds"],
        "audiences": result["audiences"],
        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


@app.post("/rag/verify", dependencies=[Depends(verify_key)])
def verify(req: VerifyRequest) -> Dict[str, Any]:
    """Kiểm tra câu trả lời có bám nguồn không: trích dẫn hợp lệ, số liệu có trong nguồn, (tùy chọn) độ tương đồng."""
    t0 = time.perf_counter()
    report = grounding.verify(
        req.answer,
        [s.model_dump() for s in req.sources],
        allowed_context=req.allowed_context,
        semantic=req.semantic,
    )
    report["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return report
