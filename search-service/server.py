# uvicorn server:app --host 0.0.0.0 --port 8000 --reload

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import os
import numpy as np
from pymongo import MongoClient
from ingredient_mapper import IngredientMapper
from dotenv import load_dotenv

load_dotenv()

# ================== CONFIG ==================
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB", "smart_nutrition")
MONGO_COLL = os.getenv("MONGO_COLL", "ingredients")
TOP_K = int(os.getenv("TOP_K", "5"))

DERIVED_PREFIXES = ["nước", "siro", "mứt", "bánh", "kẹo", "sữa", "bột"]

# ================== UTILS ==================
def normalize_text(s: str):
    return s.strip().lower()

def is_exact_match(query, name):
    return normalize_text(query) == normalize_text(name)

def is_derived_food(name: str):
    return any(normalize_text(name).startswith(p) for p in DERIVED_PREFIXES)

# ================== SCHEMAS ==================
class Nutrition(BaseModel):
    calories: float | int | None = None
    protein: float | int | None = None
    fat: float | int | None = None
    carbs: float | int | None = None
    fiber: float | int | None = None
    sugar: float | int | None = None
    sodium: float | int | None = None

class IngredientResult(BaseModel):
    id: str
    mongo_id: str
    name: str
    name_vi: str
    name_en: str
    category: str
    unit: str
    nutrition: Dict[str, Any]

    score: float
    final_score: float

    matched_variant: str
    matched_source: str

    exact_alias_match: bool
    exact_match: bool
    is_derived: bool

class BatchItemResponse(BaseModel):
    input: str
    results: List[IngredientResult]

class BatchResponse(BaseModel):
    results: List[BatchItemResponse]

    class Config:
        schema_extra = {
            "example": {
                "results": [
                    {
                        "input": "thịt bò",
                        "results": [
                            {
                                "id": "abc123",
                                "mongo_id": "abc123",
                                "name": "thịt bò",
                                "name_vi": "thịt bò",
                                "name_en": "Beef",
                                "category": "other",
                                "unit": "g",
                                "nutrition": {"calories": 182},
                                "score": 0.92,
                                "final_score": 0.92,
                                "matched_variant": "thịt bò",
                                "matched_source": "alias",
                                "exact_alias_match": True,
                                "exact_match": False,
                                "is_derived": False
                            }
                        ]
                    }
                ]
            }
        }

class QueryItem(BaseModel):
    name: str

class BatchQueryRequest(BaseModel):
    ingredients: List[QueryItem]
    top_k: int = TOP_K

# ================== LOAD DATA ==================
def load_ingredients_from_mongo():
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.admin.command('ping')
    print("✅ Connected to MongoDB")

    coll = client[MONGO_DB][MONGO_COLL]
    docs = list(coll.find({}))

    ingredients_map = {}
    for doc in docs:
        mongo_id = str(doc['_id'])
        ingredients_map[mongo_id] = {
            'mongo_id': mongo_id,
            'name': doc.get('name', ''),
            'name_en': doc.get('name_en', ''),
            'category': doc.get('category', 'other'),
            'unit': doc.get('unit', 'g'),
            'nutrition': doc.get('nutrition', {}),
            'aliases': doc.get('aliases', [])
        }

    print(f"📊 Loaded {len(ingredients_map)} ingredients")
    return ingredients_map, client

# ================== SEARCH ==================
def search_ingredients(query, mapper, ingredients_map, top_k):
    mapper_results = mapper._search_once(query.strip(), top_k=top_k)

    results = []
    for m in mapper_results:
        mongo_id = m.get("id")
        ing = ingredients_map.get(mongo_id)
        if not ing:
            continue

        nutrition_clean = {
            k: float(v) if isinstance(v, (np.floating, np.float64)) else int(v) if isinstance(v, (np.integer, np.int64)) else v
            for k, v in ing.get("nutrition", {}).items()
        }

        score = m.get("score", 0.0)
        name = ing["name"]

        derived = is_derived_food(name)
        final_score = score - (0.1 if derived else 0)

        results.append({
            "id": mongo_id,
            "mongo_id": mongo_id,
            "name": name,
            "name_vi": name,
            "name_en": ing.get("name_en", ""),
            "category": ing.get("category", "other"),
            "unit": ing.get("unit", "g"),
            "nutrition": nutrition_clean,
            "score": score,
            "final_score": final_score,
            "matched_variant": m.get("matched_variant", ""),
            "matched_source": m.get("matched_source", ""),
            "exact_alias_match": m.get("exact_alias_match", False),
            "exact_match": is_exact_match(query, name),
            "is_derived": derived
        })

    results.sort(key=lambda x: (
        not x["exact_alias_match"],
        not x["exact_match"],
        x["is_derived"],
        -x["final_score"]
    ))

    return results

# ================== APP ==================
app = FastAPI(
    title="AI Ingredient Search API",
    description="FAISS + Embedding + Nutrition mapping",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mapper = None
ingredients_map = None
mongo_client = None

# ================== STARTUP ==================
@app.on_event("startup")
def startup():
    global mapper, ingredients_map, mongo_client

    print("🚀 Starting server...")

    mapper = IngredientMapper()  # chỉ load index, không build
    ingredients_map, mongo_client = load_ingredients_from_mongo()

    print("✅ Server ready!")
    print("👉 http://localhost:8000/docs")

# ================== ENDPOINT ==================
@app.post("/search_batch", response_model=BatchResponse)
def search_batch(req: BatchQueryRequest):
    output = []

    for item in req.ingredients:
        res = search_ingredients(
            item.name,
            mapper,
            ingredients_map,
            req.top_k
        )
        output.append({
            "input": item.name,
            "results": res
        })

    return {"results": output}

@app.get("/")
def root():
    return {"message": "API is running"}