import time
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import config, embedding, reranker, retriever, vector_store
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
    result = retriever.retrieve(req.query, req.top_k, audiences=req.audiences)
    return {
        "query": req.query,
        "chunks": result["chunks"],
        "reranked": result["reranked"],
        "threshold": result["threshold"],
        "thresholds": result["thresholds"],
        "audiences": result["audiences"],
        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
