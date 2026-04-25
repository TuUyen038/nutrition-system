import os
import re
import unicodedata

from dotenv import load_dotenv
load_dotenv()

from typing import Dict, List, Any, Tuple

import numpy as np
import faiss
import joblib
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer


# ===================== CONFIG =====================
MODEL_KEY = "E5"
MODEL_NAME = "intfloat/multilingual-e5-base"

OUT_DIR = os.getenv("EMB_DIR", "embeddings/e5_base")
INDEX_PATH = os.path.join(OUT_DIR, "index.faiss")
MAPPING_PATH = os.path.join(OUT_DIR, "mapping.pkl")
MODEL_CACHE = os.path.join(OUT_DIR, "model_cache")

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB", "smart_nutrition")
MONGO_COLL = os.getenv("MONGO_COLL", "ingredients")

# giới hạn variants mỗi ingredient để index không phình quá
MAX_VARIANTS_PER_ING = int(os.getenv("MAX_VARIANTS_PER_ING", "18"))

# ===================== TEXT UTILS =====================
SYNONYMS = {
    # động vật cơ bản
    "heo": "lợn",
    "thịt heo": "thịt lợn",
    "kê": "gà",
    "thịt kê": "thịt gà",
    # một vài normalize hay gặp
    "trái": "quả",
}

GENERIC_PREFIX_TOKENS = {
    "thịt", "con", "củ", "quả", "trái", "lá", "rau", "bột",
    "nước", "hạt", "miếng", "lát", "phi", "lê", "filet", "fillet"
}

DERIVED_PREFIX_TOKENS = {
  "kẹo","bánh","mứt","siro","nước","trà","cà","phê",
  "ruốc","mắm","xúc","dăm","bột","sữa"
}
def strip_diacritics(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.replace("đ", "d").replace("Đ", "D")
    return s

def preprocess_text(text: str) -> str:
    if text is None:
        return ""
    text = str(text).lower().strip()

    for old, new in SYNONYMS.items():
        pattern = r"\b" + re.escape(old) + r"\b"
        text = re.sub(pattern, new, text)

    text = re.sub(r"\([^)]*\)", " ", text)          # bỏ ngoặc
    text = re.sub(r"[^\w\s]", " ", text)            # bỏ ký tự đặc biệt
    text = " ".join(text.split())
    return text

def auto_expand_variants_from_name_vi(name_vi: str) -> List[str]:
    base = preprocess_text(name_vi)
    if not base:
        return []

    variants = set([base])
    tokens = base.split()
    if not tokens:
        return list(variants)

    # bỏ prefix chung: thịt/củ/quả...
    tmp_tokens = tokens[:]
    while tmp_tokens and tmp_tokens[0] in GENERIC_PREFIX_TOKENS:
        tmp_tokens = tmp_tokens[1:]
        if tmp_tokens:
            variants.add(" ".join(tmp_tokens))

    # ✅ n-gram cuối câu
    # - luôn cho phép n=3,2
    for n in (3, 2):
        if len(tokens) >= n:
            variants.add(" ".join(tokens[-n:]))

    # ✅ chỉ cho phép n=1 (1-token) khi:
    #   (a) tên bắt đầu bằng prefix generic (thịt/cá/rau/quả...) -> "thịt bò" -> "bò"
    #   (b) và KHÔNG thuộc nhóm derived/processed (kẹo/bánh/ruốc/mắm...)
    allow_single_token = (tokens[0] in GENERIC_PREFIX_TOKENS) and (tokens[0] not in DERIVED_PREFIX_TOKENS)
    if allow_single_token and len(tokens) >= 1:
        variants.add(tokens[-1])

    # phần tmp_tokens vẫn giữ như cũ, nhưng cũng chặn 1-token tương tự
    if tmp_tokens:
        # n=2 thì ok
        if len(tmp_tokens) >= 2:
            variants.add(" ".join(tmp_tokens[-2:]))

        # n=1: chỉ add nếu cho phép
        if allow_single_token:
            variants.add(tmp_tokens[-1])

    variants = {v for v in variants if v and len(v) >= 2}
    return list(variants)

def normalize_aliases(aliases: Any) -> List[str]:
    if not aliases:
        return []
    if isinstance(aliases, list):
        raw = [str(x).strip() for x in aliases if str(x).strip()]
        return raw
    # nếu lỡ lưu dạng string "a, b"
    s = str(aliases).strip()
    if not s:
        return []
    return [x.strip() for x in s.split(",") if x.strip()]

def format_for_e5(texts: List[str], is_query: bool) -> List[str]:
    prefix = "query: " if is_query else "passage: "
    return [prefix + t for t in texts]

def build_variants_for_doc(doc, max_variants: int):
    name_vi = doc.get("name", "") or ""
    name_en = doc.get("name_en", "") or ""
    aliases = normalize_aliases(doc.get("aliases", []))

    out = []
    seen = set()

    def add(v: str, src: str):
        v = preprocess_text(v)
        if not v or len(v) < 2:
            return
        if v in seen:
            return
        seen.add(v)
        out.append((v, src))

    # 1) curated aliases (ưu tiên cao nhất)
    for a in aliases:
        add(a, "alias")

    # 2) auto variants từ name_vi
    for v in auto_expand_variants_from_name_vi(name_vi):
        add(v, "auto")

    # 3) name_en
    if name_en:
        add(name_en, "name_en")

    # 4) thêm bản không dấu (giữ src)
    cur = out[:]
    for v, src in cur:
        nd = preprocess_text(strip_diacritics(v))
        if nd and nd not in seen:
            seen.add(nd)
            out.append((nd, src + "_nodac"))

    return out[:max_variants]

# ===================== MAIN BUILD =====================
def main():
    if not MONGO_URI:
        raise ValueError("Missing MONGO_URI environment variable. Please set it in your environment or .env file.")

    # Validate và tự động sửa MONGO_URI nếu thiếu prefix
    mongo_uri = MONGO_URI.strip()
    if not mongo_uri.startswith(("mongodb://", "mongodb+srv://")):
        # Nếu chỉ có host:port hoặc host, tự động thêm mongodb://
        if "://" not in mongo_uri:
            if ":" in mongo_uri and not mongo_uri.startswith("mongodb"):
                # Có thể là localhost:27017 format
                mongo_uri = f"mongodb://{mongo_uri}"
            else:
                # Chỉ có host, thêm port mặc định
                mongo_uri = f"mongodb://{mongo_uri}:27017"
        else:
            raise ValueError(
                f"Invalid MONGO_URI format: '{MONGO_URI}'. "
                "URI must start with 'mongodb://' or 'mongodb+srv://'. "
                "Example: mongodb://localhost:27017/smart_nutrition"
            )
    
    print(f"Connecting to MongoDB: {mongo_uri.split('@')[-1] if '@' in mongo_uri else mongo_uri}")  # Hide password in log

    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(MODEL_CACHE, exist_ok=True)

    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        # Test connection
        client.admin.command('ping')
        print("✅ Connected to MongoDB successfully")
    except Exception as e:
        raise ConnectionError(
            f"Failed to connect to MongoDB: {e}\n"
            f"Please check:\n"
            f"  1. MongoDB is running\n"
            f"  2. MONGO_URI is correct: {mongo_uri.split('@')[-1] if '@' in mongo_uri else mongo_uri}\n"
            f"  3. Database '{MONGO_DB}' exists\n"
            f"  4. Collection '{MONGO_COLL}' exists"
        )

    coll = client[MONGO_DB][MONGO_COLL]
    
    # Check collection exists and has data
    doc_count = coll.count_documents({})
    print(f"📊 Collection '{MONGO_COLL}' has {doc_count} documents")
    
    if doc_count == 0:
        raise ValueError(
            f"No documents found in collection '{MONGO_COLL}' of database '{MONGO_DB}'.\n"
            f"Please ensure:\n"
            f"  1. Ingredients have been imported to MongoDB\n"
            f"  2. Database name is correct: {MONGO_DB}\n"
            f"  3. Collection name is correct: {MONGO_COLL}\n"
            f"  4. Check with: mongosh {mongo_uri.split('@')[-1] if '@' in mongo_uri else mongo_uri}"
        )

    docs = list(coll.find(
        {},
        {"_id": 1, "name": 1, "name_en": 1, "aliases": 1, "category": 1, "unit": 1}
    ))
    print(f"✅ Loaded {len(docs)} ingredients from Mongo.")

    texts: List[str] = []
    vector_to_ing_idx: List[int] = []
    ing_meta: List[Dict[str, Any]] = []
    vec_meta: List[Dict[str, Any]] = []

    # build per-ingredient variants
    for i, d in enumerate(docs):
        mongo_id = str(d["_id"])
        name_vi = d.get("name", "") or ""
        name_en = d.get("name_en", "") or ""
        category = d.get("category", "other")
        unit = d.get("unit", "g")

        variants = build_variants_for_doc(d, MAX_VARIANTS_PER_ING)
        if not variants:
            continue

        ing_meta.append({
            "mongo_id": mongo_id,
            "name": name_vi,
            "name_en": name_en,
            "category": category,
            "unit": unit
        })

        for v, src in variants:
            texts.append(v)
            vector_to_ing_idx.append(len(ing_meta) - 1)
            vec_meta.append({
                "mongo_id": mongo_id,
                "variant": v,
                "source": src
            })

    print(f"📝 Total variant vectors: {len(texts)} (avg {len(texts)/max(1,len(ing_meta)):.2f}/ingredient)")

    if len(texts) == 0:
        raise ValueError(
            "No valid variant texts generated from ingredients.\n"
            "This might happen if:\n"
            "  1. All ingredients have empty names\n"
            "  2. build_variants_for_doc() returns empty for all ingredients\n"
            "Please check your ingredient data."
        )

    # load model
    print(f"🤖 Loading model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME, cache_folder=MODEL_CACHE)

    # encode
    print(f"🔄 Encoding {len(texts)} texts into embeddings...")
    passages = format_for_e5(texts, is_query=False)
    
    if len(passages) == 0:
        raise ValueError("No passages to encode after formatting")
    
    emb = model.encode(
        passages,
        batch_size=64,
        normalize_embeddings=True,
        show_progress_bar=True
    ).astype("float32")

    if emb.size == 0 or len(emb.shape) < 2:
        raise ValueError(f"Invalid embedding shape: {emb.shape}. Expected 2D array.")

    if emb.size == 0 or len(emb.shape) < 2:
        raise ValueError(f"Invalid embedding shape: {emb.shape}. Expected 2D array.")

    dim = emb.shape[1]
    print(f"📐 Embedding dimension: {dim}")
    
    print(f"🔨 Building FAISS index...")
    index = faiss.IndexFlatIP(dim)
    index.add(emb)
    
    print(f"💾 Saving index and mapping...")
    faiss.write_index(index, INDEX_PATH)

    joblib.dump({
        "model_key": MODEL_KEY,
        "model_name": MODEL_NAME,
        "vector_to_ing_idx": vector_to_ing_idx,   # faiss idx -> ingredient idx
        "ingredients": ing_meta,                  # ingredient idx -> mongo_id + names
        "vec_meta": vec_meta,                     # faiss idx -> variant
    }, MAPPING_PATH)

    print("\n✅ Build completed successfully!")
    print(f"📁 Saved files:")
    print(f"   - Index: {INDEX_PATH}")
    print(f"   - Mapping: {MAPPING_PATH}")
    print(f"📊 Statistics:")
    print(f"   - Ingredients: {len(ing_meta)}")
    print(f"   - Vectors: {len(texts)}")
    print(f"   - Dimension: {dim}")

if __name__ == "__main__":
    main()
