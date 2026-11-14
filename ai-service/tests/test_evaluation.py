"""Unit test cho công thức chỉ số (app/evaluation.py) và nhận diện đối tượng (app/retriever.py).

    venv/bin/python -m unittest tests.test_evaluation -v
"""
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import evaluation as ev  # noqa: E402
from app.retriever import query_audiences, section_audiences  # noqa: E402

ROW = {
    "question": "q",
    "relevant": [{"doc_id": "who", "section": "Adults"}],
    "accept": [{"doc_id": "moh", "section": ""}],
}


def chunk(doc, section="", relevant=True):
    return {"doc_id": doc, "section": section, "relevant": relevant, "vector_score": 0.7, "lang": "vi"}


class Metrics(unittest.TestCase):
    def test_grades(self):
        self.assertEqual(ev.grade(chunk("who", "Summary > Adults (18-64)"), ROW), 2)
        self.assertEqual(ev.grade(chunk("moh", "bất kỳ"), ROW), 1)
        self.assertEqual(ev.grade(chunk("who", "Children"), ROW), 0)

    def test_perfect_ranking(self):
        chunks = [chunk("who", "Adults"), chunk("moh"), chunk("x")]
        m = ev.score_question(ROW, chunks, [1, 3], ideal=[2, 1])
        self.assertEqual(m["hit@1"], 1.0)
        self.assertAlmostEqual(m["ndcg@3"], 1.0)
        self.assertAlmostEqual(m["precision@3"], 2 / 3)
        self.assertAlmostEqual(m["ap@3"], 1.0)
        self.assertEqual(m["rr"], 1.0)
        self.assertEqual(m["usable@5"], 1.0)

    def test_second_rank(self):
        chunks = [chunk("x"), chunk("who", "Adults")]
        m = ev.score_question(ROW, chunks, [1, 2], ideal=[2, 1])
        self.assertEqual(m["hit@1"], 0.0)
        self.assertEqual(m["rr"], 0.5)
        # DCG = 3/log2(3); IDCG@2 = 3/log2(2) + 1/log2(3)
        self.assertAlmostEqual(m["ndcg@2"], (3 / math.log2(3)) / (3 + 1 / math.log2(3)))
        self.assertAlmostEqual(m["ap@2"], 0.5 / 2)

    def test_usable_requires_threshold(self):
        chunks = [chunk("who", "Adults", relevant=False), chunk("x", relevant=True)]
        m = ev.score_question(ROW, chunks, [5], ideal=[2])
        self.assertEqual(m["hit@5"], 1.0)
        self.assertEqual(m["usable@5"], 0.0)  # tìm đúng nhưng ngưỡng loại -> LLM không nhận được

    def test_threshold_override(self):
        chunks = [dict(chunk("who"), vector_score=0.62, lang="vi"), dict(chunk("x"), vector_score=0.57, lang="en")]
        ev.apply_thresholds(chunks, {"vi": 0.6, "en": 0.58})
        self.assertEqual([c["relevant"] for c in chunks], [True, False])


class Audiences(unittest.TestCase):
    def test_query(self):
        self.assertEqual(query_audiences("Người lớn nên tập bao nhiêu phút?"), set())
        self.assertEqual(query_audiences("Ông tôi 70 tuổi nên tập gì?"), {"older"})
        self.assertEqual(query_audiences("Con tôi 10 tuổi chơi thể thao bao lâu?"), {"child"})
        self.assertEqual(query_audiences("bau bi co nen tap the duc"), {"pregnant"})
        # không khớp nhầm: "còn" -> "con", "ba ngày" -> "ba", "bể bơi" -> "be"
        self.assertEqual(query_audiences("Còn thiếu bao nhiêu phút, tập ba ngày ở bể bơi được không?"), set())

    def test_section(self):
        self.assertEqual(section_audiences({"section": "Chapter 5. Active Older Adults > Balance Activities"}), {"older"})
        self.assertEqual(section_audiences({"section": "Adults and older adults with chronic conditions"}), set())
        self.assertEqual(section_audiences({"section": "Người từ 60 tuổi trở lên: khuyến cáo"}), {"older"})
        self.assertEqual(section_audiences({"section": "Pregnant and postpartum women – physical activity"}), {"pregnant"})


if __name__ == "__main__":
    unittest.main()
