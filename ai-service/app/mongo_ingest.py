import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Union

from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB", "smart_nutrition")
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "internal"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _safe_number(value: Any) -> Optional[Union[float, int]]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_ingredient_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    mongo_id = str(doc.get("_id"))
    name = _normalize_text(doc.get("name") or doc.get("name_vi") or "")
    name_en = _normalize_text(doc.get("name_en") or "")
    aliases = doc.get("aliases") or []
    if isinstance(aliases, str):
        aliases = [aliases]
    aliases_text = " ".join(_normalize_text(a) for a in aliases if _normalize_text(a))

    nutrition = doc.get("nutrition") or {}
    nutrition_text_parts = []
    for key, value in nutrition.items():
        num = _safe_number(value)
        if num is not None:
            nutrition_text_parts.append(f"{key}: {num}")

    category = _normalize_text(doc.get("category") or "other")
    unit = _normalize_text(doc.get("unit") or "g")

    text_parts = [
        f"Nguyên liệu: {name or name_en or mongo_id}",
        f"Tên tiếng Anh: {name_en}" if name_en else None,
        f"Nhóm: {category}",
        f"Đơn vị: {unit}",
        f"Tên gọi khác: {aliases_text}" if aliases_text else None,
        f"Thông tin dinh dưỡng: {'; '.join(nutrition_text_parts)}" if nutrition_text_parts else None,
    ]
    text = ". ".join(p for p in text_parts if p)

    return {
        "id": f"ingredient:{mongo_id}",
        "source_type": "ingredient",
        "title": name or name_en or "Nguyên liệu",
        "text": text,
        "metadata": {
            "mongo_id": mongo_id,
            "collection": "ingredients",
            "lang": "vi",
            "audience_group": "general",
            "category": category,
            "unit": unit,
            "name_en": name_en,
            "aliases": aliases,
        },
    }


def build_recipe_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    mongo_id = str(doc.get("_id"))
    name = _normalize_text(doc.get("name") or "")
    description = _normalize_text(doc.get("description") or "")
    ingredients = doc.get("ingredients") or []
    if isinstance(ingredients, str):
        ingredients = [ingredients]
    ingredient_text = "; ".join(_normalize_text(i) for i in ingredients if _normalize_text(i))

    nutrition = doc.get("nutrition") or {}
    nutrition_text_parts = []
    for key, value in nutrition.items():
        num = _safe_number(value)
        if num is not None:
            nutrition_text_parts.append(f"{key}: {num}")

    meal_type = _normalize_text(doc.get("meal_type") or doc.get("serving_time") or "other")
    recipe_category = _normalize_text(doc.get("category") or "other")

    text_parts = [
        f"Món ăn: {name}",
        f"Mô tả: {description}" if description else None,
        f"Danh sách nguyên liệu: {ingredient_text}" if ingredient_text else None,
        f"Phân loại: {recipe_category}",
        f"Bữa ăn: {meal_type}",
        f"Dinh dưỡng: {'; '.join(nutrition_text_parts)}" if nutrition_text_parts else None,
    ]
    text = ". ".join(p for p in text_parts if p)

    return {
        "id": f"recipe:{mongo_id}",
        "source_type": "recipe",
        "title": name or "Món ăn",
        "text": text,
        "metadata": {
            "mongo_id": mongo_id,
            "collection": "recipes",
            "lang": "vi",
            "audience_group": "general",
            "meal_type": meal_type,
            "category": recipe_category,
            "ingredients": ingredient_text,
        },
    }


def _write_jsonl(path: Path, records: Iterable[Dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def sync_mongo_internal_data() -> Dict[str, int]:
    if not MONGO_URI:
        raise ValueError("MONGO_URI is required")

    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client[MONGO_DB]

    ingredients = list(db["ingredients"].find({}))
    recipes = list(db["recipes"].find({}))

    ingredient_docs = [build_ingredient_doc(item) for item in ingredients]
    recipe_docs = [build_recipe_doc(item) for item in recipes]

    ingredients_path = DATA_DIR / "ingredients.jsonl"
    recipes_path = DATA_DIR / "recipes.jsonl"

    _write_jsonl(ingredients_path, ingredient_docs)
    _write_jsonl(recipes_path, recipe_docs)

    return {
        "ingredients": len(ingredient_docs),
        "recipes": len(recipe_docs),
    }


if __name__ == "__main__":
    print(sync_mongo_internal_data())
