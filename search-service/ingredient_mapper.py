import os
import json
import datetime
import re
from typing import Any, Dict, List

import numpy as np
import faiss
import joblib
from sentence_transformers import SentenceTransformer

# ====== USDA minimal client (your custom minimal output) ======
# Make sure fdc_client.py is in the same folder or importable
from fdc_client import fdc_suggest_minimal_for_your_model


# ===================== CONFIG =====================
MODEL_NAME = "intfloat/multilingual-e5-base"
EMB_DIR = os.getenv("EMB_DIR", "embeddings/e5_base")
INDEX_PATH = os.path.join(EMB_DIR, "index.faiss")
MAPPING_PATH = os.path.join(EMB_DIR, "mapping.pkl")
MODEL_CACHE = os.path.join(EMB_DIR, "model_cache")
ENRICH_LOG = os.getenv("ENRICH_LOG", "data/enrichment_queue.jsonl")

# thresholds from your grid search
SCORE_TH = float(os.getenv("SCORE_TH", "0.55"))
MARGIN_TH = float(os.getenv("MARGIN_TH", "0.02"))


# ===================== RERANK / HEURISTICS CONFIG =====================
PROCESSING_KEYWORDS = {
    "flour": ["bột", "flour", "powder"],
    "fermented": ["lên men", "fermented", "fermentation", "men", "rượu", "alcohol", "vinegar", "mắm"],
    "sauce": ["nước mắm", "fish sauce", "soy sauce", "xì dầu", "tương", "sốt", "sauce"],
    "processed": ["xúc xích", "sausage", "ham", "bacon", "canned", "hộp", "smoked", "hun khói", "processed"],
    "cooked": ["chín", "cooked", "luộc", "hấp", "chiên", "fried", "roasted", "rang"],
}

ANATOMY_KEYWORDS = [
    "gan","liver","tim","heart","cật","kidney","bì","skin","chân","leg","đùi","thigh",
    "ức","breast","cánh","wing","xương","bone"
]

GENERIC_STOPWORDS = set([
    "thịt","con","củ","quả","rau","lá","hạt","bột","nước","miếng","lát",
    "tươi","fresh","khô","dried","loại","grade","i","ii","iii"
])

SHORT_AMBIGUOUS_WORDS = set([
    "cá", "thịt", "gạo", "bột", "sữa", "trứng", "tôm", "mực", "nấm", "đậu"
])

PREFERRED_MAPPINGS = {
    "tôm": ["tôm biển", "sea shrimp"],
    "gạo": ["gạo tẻ", "white rice"],
    "cá": ["cá", "fish"],
    "thịt": ["thịt lợn", "pork"],
    "sữa": ["sữa tươi", "fresh milk"],
    "trứng": ["trứng gà", "chicken egg"],
    "nấm": ["nấm", "mushroom"],
    "đậu": ["đậu", "bean"],
}

HOMOPHONE_MAPPINGS = {
    "đường phèn": ["đường", "phèn", "rock sugar"],
    "cá phèn": ["cá", "phèn", "goatfish"],
    "hành tím": ["hành", "tím", "shallot"],
    "yến mạch": ["yến", "mạch", "oats"],
    "mạch nha": ["mạch", "nha", "malt"],
}

BLACKLIST_PATTERNS = [
    (r"^cá$", ["rau giấp cá"]),
    (r"thịt heo|thịt lợn|pork", ["bì lợn", "pork skin"]),
    (r"mì trứng|egg noodles", ["trứng", "egg"]),
    (r"bột năng|tapioca", ["cary", "cari", "ngô", "corn"]),
    (r"đậu hũ|đậu phụ|tofu", ["củ đậu", "pachyrrhizus", "đậu đũa", "cow.*pea"]),
    (r"ớt tươi|fresh chili", ["quả.*tươi", "palm.*fresh"]),
    (r"kem tươi|whipping cream", ["quả.*tươi", "palm.*fresh"]),
    (r"sả|lemongrass", ["sò", "oyster", "thịt chó", "dog meat", "sấn", "chanh", "lemon"]),
    (r"dầu hào|oyster sauce", ["dầu ngô", "corn oil", "dầu bông", "cottonseed", "oyster", "sò"]),
    (r"tương cà|ketchup", ["tương ớt", "red pepper sauce"]),
    (r"tim heo|pork heart", ["quả bơ", "avocado", "tím", "purple"]),
    (r"giấm|vinegar", ["hành.*muối", "onion.*pickled", "rau giấp", "giấp cá"]),
    (r"bacon", ["dâu gia", "blackberry", "bòn bon"]),
]

DERIVED_KEYWORDS = ["sữa", "milk", "nước ép", "juice", "trà", "tea", "cà phê", "coffee"]
SEAFOOD_TOKENS = ["tôm", "tép", "cá", "mực", "shrimp", "fish", "squid"]


# ===================== TEXT UTILS =====================
SYNONYMS = {
    "heo": "lợn",
    "thịt heo": "thịt lợn",
    "kê": "gà",
    "thịt kê": "thịt gà",
    "trái": "quả",
}

def preprocess_text(s: str) -> str:
    """Normalize query text for embedding lookup (same as build_index.py)."""
    s = "" if s is None else str(s)
    s = s.lower().strip()

    # Apply synonyms (same as build_index.py)
    for old, new in SYNONYMS.items():
        pattern = r"\b" + re.escape(old) + r"\b"
        s = re.sub(pattern, new, s)

    # remove quantities/units (200g, 2 quả, 1 muỗng canh, 1 lít...)
    s = re.sub(
        r"\d+\s*(g|kg|ml|l|lít|lit|quả|trái|muỗng|muỗng canh|tbsp|tsp|cup|cups|gram|kilogram|liter|liters)\b",
        " ",
        s,
    )
    s = re.sub(r"\d+", " ", s)

    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^\w\s]", " ", s)
    s = " ".join(s.split())
    return s

def format_e5(texts: List[str], is_query: bool):
    prefix = "query: " if is_query else "passage: "
    return [prefix + t for t in texts]

def norm(s: str) -> str:
    s = "" if s is None else str(s)
    s = s.lower().strip()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^\w\s]", " ", s)
    s = " ".join(s.split())
    return s

def tokens(s: str):
    return [t for t in norm(s).split() if t]

def detect_intents(q: str):
    qn = norm(q)
    intents = set()
    for k, kws in PROCESSING_KEYWORDS.items():
        if any(kw in qn for kw in kws):
            intents.add(k)
    if any(k in qn for k in ANATOMY_KEYWORDS):
        intents.add("organ_part")
    return intents

def keyword_overlap_boost(q: str, cand_text: str) -> float:
    qt = [t for t in tokens(q) if t not in GENERIC_STOPWORDS]
    nt = set([t for t in tokens(cand_text) if t not in GENERIC_STOPWORDS])
    if not qt:
        return 1.0
    overlap = sum(1 for t in qt if t in nt)
    ratio = overlap / len(qt)

    if ratio >= 1.0:
        return 1.08
    if ratio >= 0.66:
        return 1.05
    if ratio >= 0.33:
        return 1.02
    return 0.98

def apply_blacklist_penalty(q: str, cand_text: str) -> float:
    qn = norm(q)
    cn = norm(cand_text)
    for pattern, blacklist in BLACKLIST_PATTERNS:
        if re.search(pattern, qn):
            for bl_item in blacklist:
                if re.search(bl_item, cn, re.IGNORECASE):
                    return 0.5
    return 1.0

def apply_homophone_boost(q: str, cand_text: str) -> float:
    qn = norm(q)
    cn = norm(cand_text)
    for _, kws in HOMOPHONE_MAPPINGS.items():
        if all(kw in qn for kw in kws[:2]):
            if any(kw in cn for kw in kws):
                return 1.1
    return 1.0

def apply_short_word_penalty(q: str, cand_text: str) -> float:
    qn = norm(q)
    cn = norm(cand_text)
    qt = tokens(qn)
    if len(qt) <= 2 and any(word in SHORT_AMBIGUOUS_WORDS for word in qt):
        for word in qt:
            if word in SHORT_AMBIGUOUS_WORDS:
                if word in cn and len(cn.split()) > 2:
                    if word not in cn.split()[:2]:
                        return 0.7
    return 1.0

def apply_compound_word_boost(q: str, cand_text: str) -> float:
    qn = norm(q)
    cn = norm(cand_text)
    qt = tokens(qn)
    if len(qt) >= 2:
        matched_words = sum(1 for word in qt if word in cn)
        ratio = matched_words / len(qt)
        if ratio >= 0.8:
            return 1.05
        elif ratio < 0.5:
            return 0.9
    return 1.0

def apply_homophone_context_penalty(q: str, cand_text: str) -> float:
    """
    Xử lý homophone dựa trên context.
    Ví dụ: "tim heo" (heart) vs "tím" (purple)
    """
    qn = norm(q)
    cn = norm(cand_text)
    qt = tokens(qn)
    ct = tokens(cn)
    
    # "tim" (heart) vs "tím" (purple)
    # Nếu query có "tim" + "heo"/"lợn"/"heart" -> đây là "tim" (heart), không phải "tím" (purple)
    if "tim" in qn and any(word in qn for word in ["heo", "lợn", "heart", "pork"]):
        # Query là về heart (trái tim)
        # Penalty cho candidate có "tím" (purple) nhưng không có "tim" (heart)
        if "tím" in cn or "purple" in cn:
            # Kiểm tra xem candidate có "tim" (heart) không
            if "tim" not in cn and "heart" not in cn:
                # Candidate chỉ có "tím" (purple) -> penalty
                return 0.5
    
    # Nếu query có "tím" (purple) -> không nên match "tim" (heart)
    if "tím" in qn or "purple" in qn:
        if "tim" in cn or "heart" in cn:
            # Kiểm tra xem candidate có "tím" (purple) không
            if "tím" not in cn and "purple" not in cn:
                # Candidate chỉ có "tim" (heart) -> penalty
                return 0.5
    
    return 1.0

def apply_processing_method_penalty(q: str, cand_text: str) -> float:
    """
    Phạt khi query có ingredient nhưng candidate chỉ match processing method.
    Ví dụ: "trứng luộc" -> "tiết lợn luộc" (match "luộc" nhưng sai ingredient)
    """
    qn = norm(q)
    cn = norm(cand_text)
    qt = set(tokens(qn))
    ct = set(tokens(cn))
    
    # Các từ chỉ processing method (không phải ingredient)
    processing_only = set(PROCESSING_KEYWORDS["cooked"] + PROCESSING_KEYWORDS["processed"] + 
                         PROCESSING_KEYWORDS["fermented"] + ANATOMY_KEYWORDS)
    
    # Các từ ingredient trong query
    ingredient_keywords = SHORT_AMBIGUOUS_WORDS | set(SEAFOOD_TOKENS) | {"thịt", "gà", "vịt", "bò", "lợn", "heo"}
    
    # Kiểm tra xem query có ingredient không
    q_has_ingredient = any(word in ingredient_keywords for word in qt)
    
    if q_has_ingredient:
        # Tìm các từ processing method trong query
        q_processing = qt & processing_only
        # Tìm các từ processing method trong candidate
        c_processing = ct & processing_only
        
        # Nếu query có ingredient + processing, nhưng candidate chỉ match processing
        if q_processing and c_processing:
            # Kiểm tra xem candidate có ingredient từ query không
            q_ingredients = qt & ingredient_keywords
            c_has_query_ingredient = any(ing in cn for ing in q_ingredients)
            
            if not c_has_query_ingredient:
                # Query có ingredient nhưng candidate không có -> phạt mạnh
                return 0.6
    
    return 1.0

def apply_intent_penalty(q: str, cand_text: str) -> float:
    qn = norm(q)
    cn = norm(cand_text)
    intents = detect_intents(qn)

    factor = 1.0

    factor *= apply_blacklist_penalty(q, cand_text)
    if factor < 1.0:
        return factor

    if "flour" not in intents and any(k in cn for k in PROCESSING_KEYWORDS["flour"]):
        factor *= 0.85
    if "fermented" not in intents and any(k in cn for k in PROCESSING_KEYWORDS["fermented"]):
        factor *= 0.80
    if "processed" not in intents and any(k in cn for k in PROCESSING_KEYWORDS["processed"]):
        factor *= 0.85
    if "cooked" not in intents and any(k in cn for k in PROCESSING_KEYWORDS["cooked"]):
        factor *= 0.90

    if "organ_part" not in intents and any(k in cn for k in ANATOMY_KEYWORDS):
        factor *= 0.90

    if "sauce" in intents and any(k in cn for k in PROCESSING_KEYWORDS["sauce"]):
        factor *= 1.05
    
    # Penalty khi query là sauce nhưng candidate là raw ingredient (không phải sauce)
    if "sauce" in intents:
        # Nếu candidate không có từ "sauce" hoặc các từ liên quan đến sauce
        if not any(k in cn for k in PROCESSING_KEYWORDS["sauce"]):
            # Kiểm tra xem có phải raw ingredient không (có từ "oyster", "sò" nhưng không có "sauce")
            if any(k in cn for k in ["oyster", "sò", "fish", "cá"]) and "sauce" not in cn:
                factor *= 0.6  # Phạt mạnh khi query là sauce nhưng candidate là raw ingredient

    if "processed" not in intents and any(k in cn for k in PROCESSING_KEYWORDS["processed"]):
        factor *= 0.78

    if not any(k in qn for k in DERIVED_KEYWORDS) and any(k in cn for k in DERIVED_KEYWORDS):
        factor *= 0.80

    if ("gạo" in qn or "rice" in qn) and any(k in cn for k in SEAFOOD_TOKENS):
        factor *= 0.75

    factor *= apply_short_word_penalty(q, cand_text)
    factor *= apply_compound_word_boost(q, cand_text)
    factor *= apply_homophone_boost(q, cand_text)
    factor *= apply_processing_method_penalty(q, cand_text)
    factor *= apply_homophone_context_penalty(q, cand_text)

    return factor

def rerank_general(query_vi: str, query_en: str, candidates: List[Dict[str, Any]]):
    q = (query_vi or "") + " " + (query_en or "")
    qn = norm(q)

    for c in candidates:
        cand_text = f"{c.get('name','')} {c.get('name_en','')}"
        base = float(c.get("score", 0.0))

        f1 = apply_intent_penalty(qn, cand_text)
        f2 = keyword_overlap_boost(qn, cand_text)

        mv = norm(c.get("matched_variant", ""))
        matched_source = c.get("matched_source", "")
        bonus = 1.0
        if mv and mv in qn:
            bonus *= 1.04
        
        # Boost mạnh cho exact alias match
        if c.get("exact_alias_match", False):
            # Ưu tiên exact match từ tiếng Việt hơn tiếng Anh
            if query_vi and matched_source.startswith("alias") and not matched_source.startswith("alias_nodac"):
                # Exact match từ tiếng Việt -> boost 20%
                bonus *= 1.20
            else:
                # Exact match từ tiếng Anh -> boost 15%
                bonus *= 1.15

        c["final_score"] = base * f1 * f2 * bonus

    def is_processed(cand_text: str) -> int:
        cn = norm(cand_text)
        return int(any(k in cn for k in PROCESSING_KEYWORDS["processed"] + PROCESSING_KEYWORDS["fermented"]))

    def sort_key(c):
        cand_text = f"{c.get('name','')} {c.get('name_en','')}"
        return (
            c["final_score"],
            - (1 - is_processed(cand_text)),
            -len(c.get("name", "")),
        )

    candidates.sort(key=sort_key, reverse=True)
    return candidates


# ===================== API EXTERNAL HELPERS =====================
def _translate_and_improve_query_for_api(name_vi: str, name_en: str) -> str:
    """Translate và cải thiện query cho API external"""
    # Mapping từ tiếng Việt sang tiếng Anh
    vi_to_en = {
        "sữa": "milk",
        "cá": "fish",
        "thịt": "meat",
        "gạo": "rice",
        "bột": "flour",
        "trứng": "egg",
        "tôm": "shrimp",
        "mực": "squid",
        "nấm": "mushroom",
        "đậu": "bean",
        "sả": "lemongrass",
        "giấm": "vinegar",
        "bột năng": "tapioca starch",
        "đậu hũ": "tofu",
        "đậu phụ": "tofu",
        "mắm tôm": "shrimp paste",
    }
    
    # Ưu tiên tiếng Anh nếu có
    if name_en:
        query = name_en.strip()
    elif name_vi:
        # Translate từ tiếng Việt
        query = vi_to_en.get(name_vi.strip().lower(), name_vi.strip())
    else:
        return ""
    
    # Loại bỏ processing methods để tìm raw ingredients
    processing_words = ["boiled", "fried", "cooked", "steamed", "roasted", "luộc", "chiên", "hấp", "nướng"]
    words = query.split()
    words = [w for w in words if w.lower() not in processing_words]
    
    # Nếu query ngắn (1 từ), có thể thêm "raw" để tìm raw ingredients tốt hơn
    # Nhưng không cưỡng cầu vì có thể làm sai các trường hợp khác
    if len(words) == 1 and words[0].lower() in ["fish", "meat", "chicken", "beef", "pork"]:
        # Chỉ thêm "raw" cho các từ này
        pass  # Không thêm để tránh làm sai
    
    return " ".join(words) if words else query

def _filter_and_rank_usda_results(query: str, results: List[Dict[str, Any]], topn: int = 3) -> List[Dict[str, Any]]:
    """Filter và rank lại kết quả từ USDA API"""
    if not results:
        return []
    
    # Categories loại bỏ (processed foods, dishes)
    exclude_categories = [
        "Soups, Sauces, and Gravies",
        "Baked Products",
        "Cooked & Prepared",
        "Seafood mixed dishes",
        "Soda",
        "Baby Foods",
        "Jams, syrups, toppings",
    ]
    
    # Keywords loại bỏ trong tên (chỉ khi không có trong query)
    exclude_keywords = [
        "processed", "prepared", "cooked", "frozen", "canned", "hộp",
        "soup", "sauce", "dish", "product", "yogurt", "bread",
        "rolls", "mixed dishes", "branded", "bits", "sticks",
        "curry", "broth", "soda"
    ]
    
    # Filter
    filtered = []
    query_lower = query.lower()
    query_words = set(query_lower.split())
    
    for r in results:
        name = r.get("name_en", "").lower()
        category = r.get("category_raw", "").lower()
        
        # Loại bỏ nếu category không phù hợp
        if any(cat.lower() in category for cat in exclude_categories):
            continue
        
        # Loại bỏ nếu có keywords processed (nhưng cho phép nếu keyword có trong query)
        has_exclude_keyword = False
        for kw in exclude_keywords:
            if kw in name:
                # Nếu keyword KHÔNG có trong query thì loại bỏ
                if kw not in query_lower:
                    has_exclude_keyword = True
                    break
        
        if has_exclude_keyword:
            continue
        
        # Đặc biệt: nếu query có "paste" nhưng result là "almond paste", "guava paste" -> loại bỏ
        # Chỉ giữ nếu result có từ chính của query (ví dụ: "shrimp paste" -> giữ "shrimp paste")
        if "paste" in query_lower:
            name_words = set(name.split())
            # Nếu không có từ chính của query trong name (trừ "paste")
            query_main_words = query_words - {"paste"}
            if query_main_words and not any(word in name for word in query_main_words):
                # Có "paste" nhưng không có từ chính -> loại bỏ
                continue
        
        filtered.append(r)
    
    # Nếu không có kết quả sau filter, trả về top results gốc (không filter quá chặt)
    if not filtered:
        filtered = results[:topn]
    else:
        # Rank lại dựa trên relevance
        def score_result(r):
            name = r.get("name_en", "").lower()
            score = 0
            
            # Exact match
            if query_lower == name:
                score += 100
            
            # Query là substring của name
            if query_lower in name:
                score += 50
            
            # Name là substring của query
            if name in query_lower:
                score += 30
            
            # Category phù hợp
            category = r.get("category_raw", "").lower()
            good_categories = ["legumes", "vegetables", "fruits", "grains", "seeds", "finfish", "shellfish"]
            if any(cat in category for cat in good_categories):
                score += 20
            
            # Data type tốt
            data_type = r.get("external_ref", {}).get("data_type", "").lower()
            if data_type in ["foundation", "sr legacy"]:
                score += 10
            
            return score
        
        filtered.sort(key=score_result, reverse=True)
        filtered = filtered[:topn]
    
    return filtered


# ===================== LOGGING =====================
def append_jsonl(path: str, record: dict):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


# ===================== MAIN MAPPER =====================
class IngredientMapper:
    def __init__(self):
        os.makedirs(MODEL_CACHE, exist_ok=True)

        self.model = SentenceTransformer(MODEL_NAME, cache_folder=MODEL_CACHE)
        self.index = faiss.read_index(INDEX_PATH)
        self.data = joblib.load(MAPPING_PATH)

        self.vector_to_ing_idx = self.data["vector_to_ing_idx"]
        self.ingredients = self.data["ingredients"]
        self.vec_meta = self.data["vec_meta"]

    def _search_once(self, query: str, top_k: int = 10):
        q = preprocess_text(query)
        if not q:
            return []

        q_emb = self.model.encode(
            format_e5([q], is_query=True),
            normalize_embeddings=True,
            show_progress_bar=False
        ).astype("float32")

        scores, idxs = self.index.search(q_emb, top_k * 3)
        scores = scores[0]
        idxs = idxs[0]

        best_by_ing = {}
        q_clean = preprocess_text(query)

        for s, faiss_idx in zip(scores, idxs):
            ing_idx = self.vector_to_ing_idx[faiss_idx]
            v = self.vec_meta[faiss_idx].get("variant", "")
            src = self.vec_meta[faiss_idx].get("source", "")

            # Check exact alias match: source must be alias and variant must exactly match query
            v_clean = preprocess_text(v)
            exact_alias = (src.startswith("alias") and (v_clean == q_clean))

            cur = best_by_ing.get(ing_idx)
            # Priority: exact_alias_match > score
            if cur is None:
                best_by_ing[ing_idx] = {
                    "score": float(s),
                    "matched_variant": v,
                    "matched_source": src,
                    "exact_alias_match": exact_alias
                }
            elif exact_alias and not cur.get("exact_alias_match", False):
                # Prefer exact alias match even if score is lower
                best_by_ing[ing_idx] = {
                    "score": float(s),
                    "matched_variant": v,
                    "matched_source": src,
                    "exact_alias_match": exact_alias
                }
            elif not exact_alias and cur.get("exact_alias_match", False):
                # Keep existing exact match
                pass
            elif s > cur["score"]:
                # Higher score, same exact_alias_match status
                best_by_ing[ing_idx] = {
                    "score": float(s),
                    "matched_variant": v,
                    "matched_source": src,
                    "exact_alias_match": exact_alias
                }

        # Sort: exact_alias_match trước, rồi mới đến score
        ranked = sorted(
            best_by_ing.items(), 
            key=lambda x: (not x[1].get("exact_alias_match", False), -x[1]["score"])
        )[:top_k]

        results = []
        for ing_idx, info in ranked:
            meta = self.ingredients[ing_idx]
            results.append({
                "id": meta["mongo_id"],
                "name": meta.get("name", ""),
                "name_en": meta.get("name_en", ""),
                "category": meta.get("category", "other"),
                "unit": meta.get("unit", "g"),
                "score": info["score"],
                "matched_variant": info["matched_variant"],
                "matched_source": info.get("matched_source", ""),
                "exact_alias_match": info.get("exact_alias_match", False),
            })

        return results

    def map(self, name_vi: str = "", name_en: str = "", top_k: int = 3):
        # 1) Search
        cands = []
        if name_vi:
            cands.extend(self._search_once(name_vi, top_k=top_k))
        if name_en:
            cands.extend(self._search_once(name_en, top_k=top_k))

        if not cands:
            return {"status": "not_found", "auto_picked": False, "candidates": []}

        # 2) Merge duplicates by id (prioritize exact_alias_match, then max score)
        by_id = {}
        for c in cands:
            cur = by_id.get(c["id"])
            if cur is None:
                by_id[c["id"]] = c
            else:
                # Priority: exact_alias_match > score
                c_has_exact = c.get("exact_alias_match", False)
                cur_has_exact = cur.get("exact_alias_match", False)
                
                if c_has_exact and not cur_has_exact:
                    by_id[c["id"]] = c  # Prefer exact match
                elif not c_has_exact and cur_has_exact:
                    pass  # Keep current exact match
                elif c["score"] > cur["score"]:
                    by_id[c["id"]] = c  # Higher score
                # If both have exact or both don't, keep the one with exact_alias_match if available
                elif c_has_exact and cur_has_exact and c["score"] > cur["score"]:
                    by_id[c["id"]] = c

        ranked = sorted(by_id.values(), key=lambda x: x["score"], reverse=True)
        ranked = ranked[: max(top_k, 5)]

        # 3) Exact curated alias match => auto-pick if unique
        # Sort to prioritize exact matches first, especially from Vietnamese
        ranked = sorted(ranked, key=lambda x: (
            not x.get("exact_alias_match", False),  # exact matches first
            # Prefer exact match from Vietnamese if query has Vietnamese
            -(1 if (name_vi and x.get("matched_source", "").startswith("alias") 
                   and not x.get("matched_source", "").startswith("alias_nodac")) else 0),
            -x["score"]  # then by score descending
        ))
        
        exacts = [c for c in ranked if c.get("exact_alias_match")]
        
        # Semantic validation: kiểm tra keyword overlap trước khi auto-pick
        def validate_exact_match(candidate, query_vi, query_en):
            """Kiểm tra semantic correctness của exact alias match"""
            q = (query_vi or "") + " " + (query_en or "")
            qn = norm(q)
            cand_text = f"{candidate.get('name','')} {candidate.get('name_en','')}"
            cn = norm(cand_text)
            
            # Lấy các từ quan trọng từ query (loại bỏ stopwords)
            q_words = set(tokens(qn)) - GENERIC_STOPWORDS
            c_words = set(tokens(cn)) - GENERIC_STOPWORDS
            
            # Nếu query và candidate không có từ chung nào (trừ stopwords) -> có thể sai
            if q_words and c_words:
                overlap = q_words & c_words
                if not overlap:
                    # Không có từ chung -> có thể là lỗi dữ liệu
                    return False
            
            # Kiểm tra blacklist
            if apply_blacklist_penalty(q, cand_text) < 1.0:
                return False
            
            return True
        
        # Filter exact matches qua semantic validation
        validated_exacts = [c for c in exacts if validate_exact_match(c, name_vi, name_en)]
        
        # Nếu sau validation vẫn còn exact matches, dùng chúng
        if validated_exacts:
            exacts = validated_exacts
        
        if len(exacts) == 1:
            top1 = exacts[0]
            return {
                "status": "matched",
                "auto_picked": True,
                "ingredient": top1,
                "score": float(top1["score"]),
                "margin": 999.0,
                "reason": "exact_alias_match",
            }
        elif len(exacts) > 1:
            # Multiple exact matches - prefer Vietnamese if available, then by score
            exacts = sorted(exacts, key=lambda x: (
                # Prefer Vietnamese exact match
                -(1 if (name_vi and x.get("matched_source", "").startswith("alias") 
                       and not x.get("matched_source", "").startswith("alias_nodac")) else 0),
                -x["score"]  # then by score
            ), reverse=True)
            top1 = exacts[0]
            return {
                "status": "matched",
                "auto_picked": True,
                "ingredient": top1,
                "score": float(top1["score"]),
                "margin": 999.0,
                "reason": "exact_alias_match_multiple",
            }

        # 4) Rerank
        ranked = rerank_general(name_vi, name_en, ranked)
        ranked = ranked[:top_k]

        top1 = ranked[0]
        top2 = ranked[1] if len(ranked) > 1 else {"final_score": 0.0}
        margin = float(top1["final_score"] - float(top2.get("final_score", 0.0)))

        auto_pick = (top1["final_score"] >= SCORE_TH) and (margin >= MARGIN_TH)

        if auto_pick:
            return {
                "status": "matched",
                "auto_picked": True,
                "ingredient": top1,
                "score": float(top1["final_score"]),
                "margin": margin,
            }

        # 5) Low confidence => call USDA minimal and log JSONL for manual review
        # Translate and improve query for API
        api_query = _translate_and_improve_query_for_api(name_vi, name_en)

        ext = []
        err = None
        if api_query:
            try:
                raw_results = fdc_suggest_minimal_for_your_model(api_query, topn=5)
                # Filter processed foods and rank by relevance
                ext = _filter_and_rank_usda_results(api_query, raw_results, topn=3)
            except Exception as e:
                err = str(e)

        record = {
            "ts": datetime.datetime.utcnow().isoformat() + "Z",
            "query": {"vi": name_vi, "en": name_en},
            "faiss": {
                "top": ranked,
                "top1_final": float(top1["final_score"]),
                "margin": margin,
                "thresholds": {"score_th": SCORE_TH, "margin_th": MARGIN_TH},
            },
            "external": {
                "provider": "usda_fdc",
                "api_query": api_query,
                "candidates": ext,
                "error": err,
            },
            "action": "manual_review_add_to_dataset",
        }
        append_jsonl(ENRICH_LOG, record)

        return {
            "status": "candidates",
            "auto_picked": False,
            "candidates": ranked,
            "score": float(top1["final_score"]),
            "margin": margin,
            "external_suggestions": ext,
            "logged_to": ENRICH_LOG,
        }
