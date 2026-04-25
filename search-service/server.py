# uvicorn server:app --host 0.0.0.0 --port 8000 --reload

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
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

DERIVED_PREFIXES = [
    "nước", "siro", "mứt", "bánh", "kẹo", "sữa", "bột"
]

def normalize_text(s: str):
    return s.strip().lower()

def is_exact_match(query, name):
    return normalize_text(query) == normalize_text(name)

def is_derived_food(name: str):
    name = normalize_text(name)
    return any(name.startswith(p) for p in DERIVED_PREFIXES)

# ================== LOAD DATA FROM MONGODB ==================
def load_ingredients_from_mongo():
    """Load ingredients from MongoDB."""
    if not MONGO_URI:
        raise ValueError("MONGO_URI environment variable is required")
    
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print("✅ Connected to MongoDB")
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        raise
    
    coll = client[MONGO_DB][MONGO_COLL]
    docs = list(coll.find({}))
    
    # Create lookup map: mongo_id -> full ingredient data
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
    
    print(f"📊 Loaded {len(ingredients_map)} ingredients from MongoDB")
    return ingredients_map, client


# ================== SEARCH ==================
def search_ingredients(
    query: str,
    mapper: IngredientMapper,
    ingredients_map: Dict,
    top_k: int = TOP_K
) -> List[Dict]:
    """Search ingredients using IngredientMapper."""
    if not query or not query.strip():
        return []
    
    try:
        # Use IngredientMapper to search (đã có logic exact alias match)
        mapper_results = mapper._search_once(query.strip(), top_k=top_k)
        
        # Map với MongoDB data để lấy nutrition
        results = []
        for mapper_result in mapper_results:
            mongo_id = mapper_result.get("id")
            if not mongo_id:
                continue
            
            # Get full ingredient data from MongoDB
            ing_data = ingredients_map.get(mongo_id)
            if not ing_data:
                continue
            
            # Format nutrition data
            nutrition = ing_data.get("nutrition", {})
            nutrition_clean = {}
            for key, value in nutrition.items():
                if isinstance(value, (np.integer, np.int64)):
                    nutrition_clean[key] = int(value)
                elif isinstance(value, (np.floating, np.float64)):
                    nutrition_clean[key] = float(value)
                else:
                    nutrition_clean[key] = value
            
            exact_alias_match = mapper_result.get('exact_alias_match', False)
            score = mapper_result.get('score', 0.0)
            
            name = ing_data.get('name', '')

            exact_match = is_exact_match(query, name)
            derived = is_derived_food(name)

            penalty = 0.1 if derived else 0
            final_score = score - penalty

            results.append({
                'id': mongo_id,
                'mongo_id': mongo_id,
                'name': name,
                'name_vi': name,
                'name_en': ing_data.get('name_en', ''),
                'category': ing_data.get('category', 'other'),
                'unit': ing_data.get('unit', 'g'),
                'nutrition': nutrition_clean,

                'score': score,
                'final_score': final_score,

                'matched_variant': mapper_result.get('matched_variant', ''),
                'matched_source': mapper_result.get('matched_source', ''),

                'exact_alias_match': exact_alias_match,
                'exact_match': exact_match,
                'is_derived': derived
            })
        
        # Sort: exact_alias_match trước, rồi mới đến score
        results.sort(
            key=lambda x: (
                not x.get('exact_alias_match', False),  # ưu tiên alias
                not x.get('exact_match', False),        # rồi đến exact name
                x.get('is_derived', False),             # phạt đồ chế biến
                -x.get('final_score', 0.0)              # cuối cùng mới dùng embedding
            )
        )
        
        return results
        
    except Exception as e:
        print(f"❌ Search error: {e}")
        return []

# ================== FASTAPI ==================
app = FastAPI(title="Ingredient Batch Search API with Nutrition")

origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryItem(BaseModel):
    name: str

class BatchQueryRequest(BaseModel):
    ingredients: List[QueryItem]
    top_k: int = TOP_K

# ================== GLOBAL STATE ==================
mapper = None
ingredients_map = None
mongo_client = None

# ================== STARTUP ==================
@app.on_event("startup")
def startup_event():
    global mapper, ingredients_map, mongo_client
    
    print("🚀 Starting server...")
    
    # Load IngredientMapper (sử dụng index đã build từ build_index.py)
    print("📥 Loading IngredientMapper...")
    mapper = IngredientMapper()
    print("✅ IngredientMapper loaded")
    
    # Load ingredients from MongoDB
    ingredients_map, mongo_client = load_ingredients_from_mongo()
    
    print("✅ Server ready!")

# ================== SHUTDOWN ==================
@app.on_event("shutdown")
def shutdown_event():
    """Cleanup on shutdown."""
    global mongo_client
    if mongo_client:
        mongo_client.close()
        print("🔒 MongoDB connection closed")

# ================== ENDPOINTS ==================
@app.post("/search_batch")
def search_batch(req: BatchQueryRequest):
    global mapper, ingredients_map
    
    if not mapper:
        return {"error": "IngredientMapper not loaded. Please check server status."}
    
    if not ingredients_map:
        return {"error": "Ingredients data not loaded. Please check server status."}
    
    output = []
    for item in req.ingredients:
        res = search_ingredients(
            query=item.name,
            mapper=mapper,
            ingredients_map=ingredients_map,
            top_k=req.top_k
        )
        output.append({
            'input': item.name,
            'results': res
        })
    return {'results': output}

@app.get("/")
def root():
    return {"message": "Ingredient Batch Search API with Nutrition is running"}

