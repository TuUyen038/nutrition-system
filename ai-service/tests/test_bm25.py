"""Unit test cho BM25 bỏ dấu (app/bm25.py) và nhận diện câu hỏi không dấu.

    venv/bin/python -m unittest tests.test_bm25 -v
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import bm25  # noqa: E402

DOCS = [
    "Ăn bao nhiêu muối là đủ? Người lớn nên ăn dưới 5 gam muối mỗi ngày.",
    "Thiếu vitamin A gây khô mắt và quáng gà ở trẻ em.",
    "Người cao tuổi nên ăn bao nhiêu rau mỗi ngày để đủ chất xơ.",
    "Dietary fiber helps digestion and lowers cholesterol.",
]


class TestUnaccentedDetection(unittest.TestCase):
    def test_unaccented_vietnamese(self):
        for q in ["an bao nhieu muoi 1 ngay la du", "thieu vitamin d thi bi sao", "an gi de bo sung sat"]:
            self.assertTrue(bm25.is_unaccented_vietnamese(q), q)

    def test_accented_or_english_is_not(self):
        for q in ["Ăn bao nhiêu muối một ngày?", "How much salt should I eat?", "what is an iron deficiency"]:
            self.assertFalse(bm25.is_unaccented_vietnamese(q), q)


class TestIndex(unittest.TestCase):
    def setUp(self):
        self.index = bm25.Index([f"d{i}" for i in range(len(DOCS))], DOCS, [{"audience_group": "general"}] * len(DOCS))

    def test_tokens_strip_accents_and_add_bigrams(self):
        toks = bm25.tokens("Đường huyết cao")
        self.assertIn("duong", toks)
        self.assertIn("duong_huyet", toks)

    def test_unaccented_query_finds_accented_doc(self):
        top = self.index.search("an bao nhieu muoi 1 ngay", 3)
        self.assertEqual(top[0][0], 0)

    def test_older_adults_query(self):
        top = self.index.search("nguoi cao tuoi an bao nhieu rau", 3)
        self.assertEqual(top[0][0], 2)

    def test_no_match_returns_empty(self):
        self.assertEqual(self.index.search("zzzz qqqq", 3), [])

    def test_allowed_filter(self):
        top = self.index.search("an bao nhieu muoi", 3, allowed_idx={2, 3})
        self.assertTrue(all(i in {2, 3} for i, _ in top))


if __name__ == "__main__":
    unittest.main()
