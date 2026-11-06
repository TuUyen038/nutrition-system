import json
import re
import unicodedata
from typing import Dict, List, Optional

import numpy as np

from . import config
from .embedding import embed_queries

# Nhãn phân cấp. Nhãn lá dạng "personal.workout"; nhãn không có con thì lá = chính nó.
TOP_LEVELS = ("knowledge", "mixed", "personal", "chitchat", "out_of_scope")
# knowledge và mixed cùng đi vào RAG nên nhầm lẫn giữa hai nhóm này không phải "mơ hồ".
RAG_FAMILY = {"knowledge", "mixed"}
TOP_N_MEAN = 3


def strip_accents(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn").lower()


def _compile(patterns: List[str]) -> List[re.Pattern]:
    return [re.compile(p) for p in patterns]


# Luật từ khóa viết KHÔNG dấu, so khớp trên văn bản đã bỏ dấu (user gõ có/không dấu đều khớp).
# Khóa là nhãn cha ("knowledge", "mixed", "chitchat", "personal") hoặc nhãn lá ("personal.menu"...).
KEYWORD_RULES: Dict[str, List[re.Pattern]] = {
    "knowledge": _compile([
        r"\bwho\b", r"\bbo y te\b", r"\bkhuyen (nghi|cao)\b", r"\bnen an bao nhieu\b",
        r"\bbao nhieu\b.*\b(moi ngay|mot ngay|moi tuan|phan tram)\b",
        r"\b(co|that) (tot|hai|loi)\b", r"\bloi ich\b", r"\btac hai\b", r"\bnguy co\b",
        r"\bvi sao\b", r"\btai sao\b", r"\bla gi\b", r"\bnguyen tac\b",
        r"\bche do an\b", r"\bchat (xo|beo|dam|dinh duong)\b", r"\bvitamin\b",
        r"\bkhoang chat\b", r"\bvi chat\b", r"\bhoat dong the luc\b", r"\bthap dinh duong\b",
    ]),
    # Câu hỏi kiến thức nhưng gắn với cơ thể / mục tiêu / hoàn cảnh riêng của user.
    "mixed": _compile([
        r"\b(toi|minh|em|tui) (nen|can|co nen|phai|dang|bi)\b",
        r"\bvoi (can nang|chieu cao|tuoi|muc tieu|the trang|tinh trang)\b",
        r"\bphu hop (voi )?(toi|minh|em)\b",
        r"\b(dang|muon) (giam can|tang can|tang co|giam mo)\b",
        r"\bnguoi (nhu|moi tap nhu) (toi|minh|em)\b",
    ]),
    "chitchat": _compile([
        r"^(xin )?chao\b", r"^(hello|hi|hey)\b", r"\bcam on\b", r"\bthanks?\b",
        r"\btam biet\b", r"\bbye\b", r"\bban la ai\b", r"\bban (khoe|ten)\b",
    ]),
    # Hành động trên dữ liệu hệ thống nhưng chưa rõ nhóm con.
    "personal": _compile([
        r"\bthem\b.*\bvao\b", r"\bxoa\b", r"\bdanh dau\b", r"\bbo qua\b.*\bbuoi\b",
        r"\b(cua|cho) (toi|minh|em|tui) xem\b", r"\bxem (giup|cho) (toi|minh|em)\b",
    ]),
    "personal.workout": _compile([
        r"\b(lich|ke hoach|buoi) tap\b", r"\btap gi\b", r"\bbai tap hom nay\b",
        r"\bworkout\b", r"\bhoan thanh\b.*\b(buoi|ngay) tap\b", r"\bthong ke tap\b",
        r"\btien do tap\b", r"\bpush pull legs\b|\bppl\b",
    ]),
    "personal.menu": _compile([
        r"\bthuc don\b", r"\bmenu\b", r"\bke hoach an\b",
        r"\bbua (sang|trua|toi|phu)\b.*\b(hom nay|ngay mai|tuan)\b",
        r"\bthem\b.*\bvao\b.*\b(bua|thuc don)\b",
    ]),
    "personal.recipe": _compile([
        r"\b(them|luu|add|save)\b.*\b(vao|vào)\b.*\b(thuc don|menu|favorites|yeu thich)\b",
        r"\b(yeu thich|favorite|luu mon|luu cong thuc|da luu)\b",
        r"\b(cho|giup)\b.*\b(toi|minh|em|tui)\b.*\b(chon|tim|goi y)\b.*\b(mon|cong thuc)\b",
        r"\b(bo sung|them)\b.*\b(mon|cong thuc)\b.*\b(vao|vào)\b.*\b(thuc don|menu)\b",
        r"\b(tim (mon|cong thuc) cho toi|minh|em|tui)\b",
    ]),
    "personal.favorites": _compile([
        r"\byeu thich\b", r"\bluu (mon|cong thuc|lai)\b", r"\bda luu\b",
    ]),
    "personal.profile": _compile([
        r"\btdee\b", r"\bbmr\b", r"\bmuc tieu (calo|calories|dinh duong|protein|can nang)\b",
        r"\bnhat ky\b", r"\blich su (an|tap|bua)\b", r"\bda (an|nap) bao nhieu\b",
        r"\bhom (nay|qua) (toi|minh|em)? ?(da )?an\b",
    ]),
}

# Phân loại nhóm con của chitchat bằng luật (dùng khi chốt chitchat bằng từ khóa, không qua embedding).
# Thứ tự quan trọng: câu có nhiều ý ("Chào bạn, cảm ơn nhé") lấy nhóm đầu tiên khớp.
CHITCHAT_SUB_RULES: Dict[str, List[re.Pattern]] = {
    "thanks": _compile([r"\bcam on\b", r"\bthanks?\b"]),
    "goodbye": _compile([r"\btam biet\b", r"\bbye\b"]),
    "about_bot": _compile([r"\bban la ai\b", r"\bban (khoe|ten)\b"]),
    "greeting": _compile([r"^(xin )?chao\b", r"^(hello|hi|hey)\b"]),
}

# Có từ khóa thuộc miền hệ thống (ăn uống, dinh dưỡng, tập luyện) -> KHÔNG được coi là ngoài chủ đề.
DOMAIN_RE = re.compile(
    r"\b(an|uong|mon|món|bua|nau|calo|calories|kcal|dinh duong|protein|dam|beo|carb|tinh bot|"
    r"duong|muoi|vitamin|khoang|chat xo|nguyen lieu|thuc pham|thuc don|tap|bai tap|the duc|"
    r"gym|cardio|co bap|giam can|tang can|giam mo|tang co|suc khoe|workout|exercise|squat|"
    r"plank|nutrition|diet|food|calorie|muscle|tdee|bmr|"
    r"hoat dong|the luc|van dong|huyet ap|kali|natri|sat|canxi|omega|nang luong|khau phan|"
    r"ngu coc|rau|trai cay|cu qua|thit|bánh|banh|mon an|thuc an|ca|trung|sua|"
    r"benh|tim mach|tieu duong|can nang|bmi|uong nuoc|"
    r"di bo|chay bo|yoga|fiber|sugar|salt|physical activity|calcium|iron)\b"
)

FOOD_ENTITY_RE = re.compile(
    r"\b(mon|món|thuc an|thức ăn|bánh|banh|com|cơm|rau|thit|ca|trung|sua|trai cay|hoa qua|nguyen lieu)\b"
)

RECIPE_QUERY_RE = re.compile(
    r"\b(cach lam|cach nau|cach che bien|cong thuc|nguyen lieu|nguyên liệu|"
    r"cach lam.*(banh|com|ga|heo|ca|rau|tom|thit|muc|vit|suon|bun|mi|canh|nuoc)|"
    r"cong thuc.*(banh|com|ga|heo|ca|rau|tom|thit|muc|vit|suon|bun|mi|canh|nuoc)|"
    r"nguyen lieu.*(banh|com|ga|heo|ca|rau|tom|thit|muc|vit|suon|bun|mi|canh|nuoc)|"
    r"(nau|lam|che bien)\b.*\b(ga|heo|ca|rau|tom|thit|muc|vit|suon|bun|mi|canh|nuoc)\b)"
)

PERSONAL_RECIPE_ACTION_RE = re.compile(
    r"\b(them|luu|save|add|bo sung)\b.*\b(vao|vào|thuc don|menu|favorites|yeu thich)\b"
    r"|\b(yeu thich|favorite|luu mon|luu cong thuc|da luu)\b"
)

# Câu chào ngắn: chốt chitchat luôn bằng luật, không cần embedding.
SHORT_CHITCHAT_MAX_WORDS = 6


def flatten_exemplars(data: Dict) -> Dict[str, List[str]]:
    """{"personal": {"workout": [...]}, "chitchat": [...]} -> {"personal.workout": [...], "chitchat": [...]}"""
    leaves: Dict[str, List[str]] = {}
    for top, value in data.items():
        if top not in TOP_LEVELS:
            continue
        if isinstance(value, list):
            leaves[top] = value
        else:
            for sub, texts in value.items():
                leaves[f"{top}.{sub}"] = texts
    return leaves


def top_of(label: str) -> str:
    return label.split(".")[0]


def with_unaccented_variants(texts: List[str]) -> List[str]:
    """Thêm bản bỏ dấu của từng câu mẫu (loại trùng, giữ thứ tự).

    Câu user gõ không dấu sẽ khớp với bản không dấu của MỌI nhóm như nhau, thay vì nghiêng về
    nhóm nào tình cờ có nhiều câu mẫu không dấu hơn.
    """
    out: List[str] = []
    seen = set()
    for t in texts:
        for v in (t, strip_accents(t)):
            key = v.strip().lower()
            if key and key not in seen:
                seen.add(key)
                out.append(v)
    return out


class IntentRouter:
    def __init__(self, exemplars: Optional[Dict] = None):
        if exemplars is None:
            exemplars = json.loads(config.INTENTS_FILE.read_text(encoding="utf-8"))
        self.leaves = flatten_exemplars(exemplars)
        self.matrix: Dict[str, np.ndarray] = {
            leaf: embed_queries(with_unaccented_variants(texts))
            for leaf, texts in self.leaves.items()
        }

    def _keyword_hits(self, text: str) -> Dict[str, bool]:
        plain = strip_accents(text).strip()
        return {
            label: any(p.search(plain) for p in patterns)
            for label, patterns in KEYWORD_RULES.items()
        }

    def _leaf_scores(self, text: str) -> Dict[str, float]:
        q = embed_queries([text])[0]
        scores = {}
        for leaf, mat in self.matrix.items():
            sims = np.sort(mat @ q)[::-1][:TOP_N_MEAN]
            scores[leaf] = float(sims.mean())
        return scores

    @staticmethod
    def _round(d: Dict[str, float]) -> Dict[str, float]:
        return {k: round(v, 4) for k, v in d.items()}

    def classify(self, text: str) -> Dict:
        text = (text or "").strip()
        plain = strip_accents(text)
        hits = self._keyword_hits(text)
        domain_hit = bool(DOMAIN_RE.search(plain))
        short_greeting = (
            len(text.split()) <= SHORT_CHITCHAT_MAX_WORDS
            and any(
                any(p.search(plain.strip()) for p in pats)
                for name, pats in CHITCHAT_SUB_RULES.items()
                if name in {"thanks", "goodbye", "about_bot", "greeting"}
            )
        )

        is_recipe_query = bool(RECIPE_QUERY_RE.search(plain))
        is_personal_recipe_action = bool(PERSONAL_RECIPE_ACTION_RE.search(plain))
        is_short_food_mention = (
            len(text.split()) <= 6
            and bool(FOOD_ENTITY_RE.search(plain))
            and not is_recipe_query
        )

        if is_recipe_query and not is_personal_recipe_action:
            if is_short_food_mention:
                return {
                    "intent": "ambiguous",
                    "sub_intent": None,
                    "scores": {"knowledge": 0.5, "personal": 0.5},
                    "method": "ambiguous",
                }
            return {
                "intent": "knowledge",
                "sub_intent": "recipe",
                "scores": {"knowledge": 1.0},
                "method": "keyword",
            }

        if is_personal_recipe_action and not is_recipe_query:
            return {
                "intent": "personal",
                "sub_intent": "recipe",
                "scores": {"personal": 1.0},
                "method": "keyword",
            }

        if (
            short_greeting
            and not any(hits[k] for k in ("knowledge", "mixed", "personal"))
            and not any(h for k, h in hits.items() if k.startswith("personal."))
            and not domain_hit
            and not FOOD_ENTITY_RE.search(plain)
        ):
            sub = next(
                (name for name, pats in CHITCHAT_SUB_RULES.items()
                 if any(p.search(plain.strip()) for p in pats)),
                None,
            )
            return {
                "intent": "chitchat", "sub_intent": sub,
                "scores": {"chitchat": 1.0}, "method": "keyword",
            }

        # 1. Điểm embedding từng nhãn lá + cộng điểm từ khóa (không cộng dồn luật cha và luật lá)
        leaf_scores = self._leaf_scores(text)
        used_kw = False
        for leaf in leaf_scores:
            if hits.get(leaf) or hits.get(top_of(leaf)):
                leaf_scores[leaf] += config.ROUTER_KEYWORD_BOOST
                used_kw = True

        # 2. Điểm nhóm cha = điểm cao nhất trong các lá của nó
        top_scores: Dict[str, float] = {}
        for leaf, s in leaf_scores.items():
            top = top_of(leaf)
            top_scores[top] = max(top_scores.get(top, -1.0), s)

        if (domain_hit or FOOD_ENTITY_RE.search(plain)) and not short_greeting:
            top_scores = {k: v for k, v in top_scores.items() if k != "chitchat"}

        ranked = sorted(top_scores.items(), key=lambda kv: kv[1], reverse=True)

        if (domain_hit or FOOD_ENTITY_RE.search(plain)) and not short_greeting and not any(
            hits[k] for k in ("knowledge", "mixed", "personal")
        ) and not any(h for k, h in hits.items() if k.startswith("personal.")):
            return {
                "intent": "ambiguous", "sub_intent": None,
                "scores": self._round(top_scores), "method": "ambiguous",
            }

        # 3. out_of_scope bảo thủ: cần cách biệt rõ và không có từ khóa miền, nếu không bỏ qua nhóm này
        if ranked[0][0] == "out_of_scope":
            margin = ranked[0][1] - ranked[1][1]
            if domain_hit or margin < config.ROUTER_OOS_MARGIN:
                ranked = [r for r in ranked if r[0] != "out_of_scope"]
            else:
                return {
                    "intent": "out_of_scope", "sub_intent": None,
                    "scores": self._round(top_scores),
                    "method": "embedding+keyword" if used_kw else "embedding",
                }

        best, second = ranked[0], ranked[1]
        both_rag = best[0] in RAG_FAMILY and second[0] in RAG_FAMILY
        if best[1] - second[1] < config.ROUTER_MARGIN and not both_rag:
            return {
                "intent": "ambiguous", "sub_intent": None,
                "scores": self._round(top_scores), "method": "ambiguous",
            }

        intent = best[0]
        return {
            "intent": intent,
            "sub_intent": self._sub_intent(intent, leaf_scores),
            "scores": self._round(top_scores),
            "method": "embedding+keyword" if used_kw else "embedding",
        }

    @staticmethod
    def _sub_intent(intent: str, leaf_scores: Dict[str, float]) -> Optional[str]:
        subs = sorted(
            ((leaf.split(".", 1)[1], s) for leaf, s in leaf_scores.items()
             if leaf.startswith(intent + ".")),
            key=lambda kv: kv[1], reverse=True,
        )
        if not subs:
            return None
        if intent == "personal":
            # Nhóm con mơ hồ -> None: Node sẽ cấp đủ tool thay vì đoán sai nhóm
            if len(subs) > 1 and subs[0][1] - subs[1][1] < config.ROUTER_SUB_MARGIN:
                return None
        return subs[0][0]
