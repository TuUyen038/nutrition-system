# fdc_client.py
import os, time
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

import httpx

FDC_API_KEY = os.getenv("FDC_API_KEY")
FDC_BASE = "https://api.nal.usda.gov/fdc/v1"

# Minimal nutrient set that matches your Mongo model
# (nutrientNumber -> your field)
NUTRIENT_MAP = {
    "208": ("calories", "KCAL"),   # Energy
    "203": ("protein", "G"),       # Protein
    "204": ("fat", "G"),           # Total lipid (fat)
    "205": ("carbs", "G"),         # Carbohydrate
    "291": ("fiber", "G"),         # Fiber
    "269": ("sugar", "G"),         # Total Sugars
    "307": ("sodium", "MG"),       # Sodium
}
CORE_NUTRIENTS = [int(k) for k in NUTRIENT_MAP.keys()]

# Prefer these data types for "ingredients" (less noisy than Branded)
DEFAULT_DATA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"]

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _client() -> httpx.Client:
    # Tăng timeout lên 60 giây cho các request lớn (format=full với nhiều nutrients)
    return httpx.Client(timeout=60.0)

def fdc_search(
    query: str,
    page_size: int = 5,
    data_types: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Return raw FDC foods from /foods/search
    """
    if not FDC_API_KEY:
        raise ValueError("Missing FDC_API_KEY env var")
    if not query or not query.strip():
        return []

    params = {"api_key": FDC_API_KEY}
    payload = {
        "query": query,
        "pageSize": page_size,
    }
    if data_types:
        payload["dataType"] = data_types  # FDC accepts array/list here

    with _client() as client:
        r = client.post(f"{FDC_BASE}/foods/search", params=params, json=payload)
        r.raise_for_status()
        return r.json().get("foods", []) or []

def fdc_get_food_detail(
    fdc_id: int,
    nutrient_numbers: List[int] = CORE_NUTRIENTS,
    abridged: bool = False,
    max_retries: int = 2,
) -> Dict[str, Any]:
    """
    GET /food/{fdcId}?format=full&nutrients=...
    Note: Changed abridged=False by default to get full nutrition data
    
    Args:
        fdc_id: Food Data Central ID
        nutrient_numbers: List of nutrient numbers to retrieve
        abridged: Whether to use abridged format
        max_retries: Maximum number of retry attempts on timeout/network errors
    """
    params = {
        "api_key": FDC_API_KEY,
    }
    # FDC API: nutrients parameter chỉ hoạt động với format=full
    # Với format=abridged, nutrients sẽ bị ignore
    if nutrient_numbers:
        params["nutrients"] = ",".join(map(str, nutrient_numbers))
        params["format"] = "full"
    elif abridged:
        params["format"] = "abridged"

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            with _client() as client:
                r = client.get(f"{FDC_BASE}/food/{fdc_id}", params=params)
                r.raise_for_status()
                return r.json()
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.NetworkError) as e:
            last_error = e
            if attempt < max_retries:
                # Exponential backoff: wait 2^attempt seconds
                wait_time = 2 ** attempt
                time.sleep(wait_time)
                continue
            else:
                raise
        except Exception as e:
            # Non-retryable errors (e.g., 404, 400)
            raise
    
    # Should not reach here, but just in case
    if last_error:
        raise last_error

def _extract_serving_from_search_item(search_item: Dict[str, Any]) -> Dict[str, Any]:
    """Extract serving info from search item (may not have all fields)"""
    return {
        "servingSize": search_item.get("servingSize"),
        "servingSizeUnit": search_item.get("servingSizeUnit", ""),
        "householdServingFullText": search_item.get("householdServingFullText", ""),
    }

def _extract_serving_from_food_detail(food_detail: Dict[str, Any]) -> Dict[str, Any]:
    """Extract serving info from food detail (more complete)"""
    # FDC API có thể trả về serving info trong nhiều format
    # Thử lấy từ các field khác nhau
    serving_size = food_detail.get("servingSize")
    serving_unit = food_detail.get("servingSizeUnit", "")
    household_text = food_detail.get("householdServingFullText", "")
    
    # Nếu không có trong root, thử tìm trong các field khác
    if serving_size is None:
        # Có thể có trong "foodPortions" hoặc "householdServingFullText"
        food_portions = food_detail.get("foodPortions", [])
        if food_portions:
            # Lấy serving info từ portion đầu tiên
            first_portion = food_portions[0]
            serving_size = first_portion.get("amount")
            serving_unit = first_portion.get("measureUnit", {}).get("name", "") if isinstance(first_portion.get("measureUnit"), dict) else ""
            household_text = first_portion.get("portionDescription", "")
    
    return {
        "servingSize": serving_size,
        "servingSizeUnit": serving_unit or "",
        "householdServingFullText": household_text or "",
    }

def _extract_category_from_search_item(search_item: Dict[str, Any]) -> str:
    # This is USDA "foodCategory" string (not your enum)
    return search_item.get("foodCategory", "") or ""

def _extract_nutrition_minimal(food_detail: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """
    Returns exactly your nutrition model keys:
      calories, protein, fat, carbs, fiber, sugar, sodium
    Values are raw "amount" from FDC detail for the requested nutrients.
    """
    out: Dict[str, Optional[float]] = {
        "calories": None,
        "protein": None,
        "fat": None,
        "carbs": None,
        "fiber": None,
        "sugar": None,
        "sodium": None,
    }

    # FDC API có thể trả về foodNutrients ở nhiều format khác nhau
    food_nutrients = food_detail.get("foodNutrients") or []
    
    # Nếu không có foodNutrients, thử tìm trong các field khác
    if not food_nutrients:
        # Có thể có trong "foodNutrients" hoặc trực tiếp trong response
        pass
    
    for it in food_nutrients:
        if not isinstance(it, dict):
            continue
            
        # FDC API có thể trả về nutrient info theo nhiều format:
        # 1. Nested: {"nutrient": {"number": "208", ...}, "amount": 100}
        # 2. Flat: {"nutrientNumber": "208", "amount": 100}
        # 3. Mixed: {"nutrient": {"id": 1008, "number": "208"}, "amount": 100}
        
        nutrient = it.get("nutrient")
        if isinstance(nutrient, dict):
            # Format nested
            num = str(nutrient.get("number") or nutrient.get("nutrientNumber") or "")
        else:
            # Format flat - nutrient info nằm trực tiếp trong it
            num = str(it.get("nutrientNumber") or it.get("number") or "")
        
        amt = it.get("amount")
        if not num or amt is None:
            continue

        mapped = NUTRIENT_MAP.get(num)
        if not mapped:
            continue

        field, _expected_unit = mapped
        # We don't force unit conversion here to keep it simple for testing
        try:
            out[field] = float(amt)
        except (ValueError, TypeError):
            continue

    return out

def _pick_best_candidates(foods: List[Dict[str, Any]], topn: int) -> List[Dict[str, Any]]:
    """
    Simple heuristic:
    - prefer Foundation / SR Legacy first
    - then by search score desc
    """
    def rank_key(f: Dict[str, Any]):
        dtype = f.get("dataType", "")
        dtype_rank = 0
        if dtype == "Foundation":
            dtype_rank = 3
        elif dtype == "SR Legacy":
            dtype_rank = 2
        elif dtype == "Survey (FNDDS)":
            dtype_rank = 1
        else:
            dtype_rank = 0
        return (dtype_rank, float(f.get("score") or 0.0))

    foods_sorted = sorted(foods, key=rank_key, reverse=True)
    return foods_sorted[:topn]

def fdc_suggest_minimal_for_your_model(
    query: str,
    topn: int = 3,
    data_types: Optional[List[str]] = None,
    sleep_s: float = 0.15,
) -> List[Dict[str, Any]]:
    """
    Returns a compact list of objects that match your Mongo ingredient model.

    Output per candidate:
    {
      "name_en": "...",                # USDA description (for manual review)
      "category_raw": "...",           # USDA foodCategory (string)
      "nutrition": { ... },            # your nutrition keys
      "serving": { ... },              # servingSize + unit + household text
      "external_ref": { ... }          # provider mapping info
    }
    """
    foods = fdc_search(
        query=query,
        page_size=max(10, topn),
        data_types=data_types or DEFAULT_DATA_TYPES,
    )
    if not foods:
        return []

    picks = _pick_best_candidates(foods, topn=topn)

    out: List[Dict[str, Any]] = []
    for f in picks:
        fdc_id = f.get("fdcId")
        if not fdc_id:
            continue

        # Dùng format=full để lấy đầy đủ nutrition data
        detail = fdc_get_food_detail(int(fdc_id), nutrient_numbers=CORE_NUTRIENTS, abridged=False)

        # Lấy serving info từ detail (đầy đủ hơn) hoặc fallback về search item
        serving_info = _extract_serving_from_food_detail(detail)
        # Nếu không có trong detail, thử lấy từ search item
        if serving_info.get("servingSize") is None:
            search_serving = _extract_serving_from_search_item(f)
            if search_serving.get("servingSize") is not None:
                serving_info = search_serving

        out.append({
            "name_en": (detail.get("description") or f.get("description") or "").strip(),
            "category_raw": _extract_category_from_search_item(f),
            "nutrition": _extract_nutrition_minimal(detail),
            "serving": serving_info,
            "external_ref": {
                "provider": "usda_fdc",
                "external_id": str(fdc_id),
                "confidence": 0.0,                  # you set later (manual/heuristic)
                "data_type": (detail.get("dataType") or f.get("dataType") or ""),
                "url": "",                          # optional: you can fill if you have a viewer url
                "last_synced_at": _utc_now_iso(),
            },
        })

        if sleep_s:
            time.sleep(sleep_s)

    return out
