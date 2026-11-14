"""Unit test cho app/grounding.py (không cần model, không cần ChromaDB).

    python -m unittest tests.test_grounding -v
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import grounding  # noqa: E402

WHO = {
    "id": "S1",
    "title": "WHO guidelines on physical activity and sedentary behaviour",
    "org": "World Health Organization (WHO)",
    "year": "2020",
    "lang": "en",
    "text": "Adults should do at least 150–300 minutes of moderate-intensity aerobic physical activity; "
            "or at least 75–150 minutes of vigorous-intensity aerobic physical activity. "
            "Muscle-strengthening activities on 2 or more days a week.",
}
VN = {
    "id": "S2",
    "title": "Cẩm nang hoạt động thể lực",
    "org": "Bộ Y tế",
    "year": "2026",
    "lang": "vi",
    "text": "Người trưởng thành nên đi bộ khoảng 10.000 bước mỗi ngày, mỗi lần ít nhất 2,5 phút.",
}


def check(answer, sources=(WHO, VN), ctx=None):
    return grounding.verify(answer, list(sources), allowed_context=ctx, semantic=False)


class NumberParsing(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(grounding.extract_numbers("10.000 bước, 10,000 steps"), {10000.0})
        self.assertEqual(grounding.extract_numbers("2,5 phút hay 2.5 min"), {2.5})
        self.assertEqual(grounding.extract_numbers("150–300 phút, 10%"), {150.0, 300.0, 10.0})

    def test_citation_numbers_ignored(self):
        self.assertEqual(grounding.extract_numbers("Theo WHO [S1, S2]."), set())


class Verify(unittest.TestCase):
    def test_grounded_answer_passes(self):
        r = check("Người lớn nên vận động 150–300 phút mỗi tuần [S1]. Tập sức mạnh 2 ngày/tuần [S1].")
        self.assertTrue(r["passed"], r["errors"])
        self.assertEqual(r["used_citations"], ["S1"])
        self.assertEqual(r["support_ratio"], 1.0)

    def test_citation_on_next_segment_is_merged(self):
        r = check("Người lớn nên vận động 150 phút mỗi tuần. [S1]")
        self.assertTrue(r["passed"], r["errors"])
        self.assertEqual(len(r["sentences"]), 1)

    def test_hallucinated_number(self):
        r = check("WHO khuyến nghị 200 phút mỗi tuần [S1].")
        self.assertFalse(r["passed"])
        self.assertEqual(r["unsupported_numbers"], ["200"])
        self.assertEqual(r["fixed_answer"], "")

    def test_invalid_citation(self):
        r = check("Nên vận động 150 phút [S7].")
        self.assertIn("invalid_citation", {e["type"] for e in r["errors"]})

    def test_uncited_number_is_auto_cited(self):
        r = check("Nên đi bộ 10.000 bước mỗi ngày.")
        self.assertFalse(r["passed"])
        self.assertEqual(r["fixed_answer"], "Nên đi bộ 10.000 bước mỗi ngày [S2].")

    def test_number_from_other_source_is_warning(self):
        r = check("Nên đi 10.000 bước mỗi ngày [S1].")
        self.assertTrue(r["passed"])
        self.assertIn("number_in_other_source", {w["type"] for w in r["warnings"]})

    def test_allowed_context(self):
        # Số đến từ hồ sơ user / database tool, không cần nguồn RAG
        r = check("Tuần này bạn mới vận động 90 phút, còn thiếu so với 150 phút [S1].",
                  ctx=["activeMinutes tuần này: 90"])
        self.assertTrue(r["passed"], r["errors"])

    def test_fixed_answer_keeps_good_lines_and_markdown(self):
        answer = "## Khuyến nghị\n- Vận động 150 phút/tuần [S1].\n- Uống 3 lít nước mỗi ngày [S1].\n\nChúc bạn khỏe!"
        r = check(answer)
        self.assertFalse(r["passed"])
        self.assertEqual(r["fixed_answer"], "## Khuyến nghị\n- Vận động 150 phút/tuần [S1].\n\nChúc bạn khỏe!")

    def test_year_from_metadata_allowed(self):
        r = check("Theo hướng dẫn WHO năm 2020, người lớn cần 150 phút mỗi tuần [S1].")
        self.assertTrue(r["passed"], r["errors"])

    def test_no_sources_any_number_fails(self):
        r = check("Bạn nên ngủ 8 tiếng.", sources=())
        self.assertFalse(r["passed"])

    def test_refusal_without_numbers_passes(self):
        r = check("Hiện kho tài liệu đã kiểm duyệt chưa có thông tin về vấn đề này.", sources=())
        self.assertTrue(r["passed"])
        self.assertEqual(r["claims"], 0)


if __name__ == "__main__":
    unittest.main()
