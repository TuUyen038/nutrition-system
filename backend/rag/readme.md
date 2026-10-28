document {
  document_id
  title
  source
  url
  <!-- language -->
  <!-- authority -->
  publishedAt

  "documentType": "article",

  "sections": [
    {
      "heading": "Giới thiệu",
      "text": "..."
    },
    {
      "heading": "Thứ nhất",
      "text": "..."
    }
  ]
  <!-- {
  "sections": [
    {
      "heading": null,
      "text": "Toàn bộ nội dung..."
    }
  ]
} -->
}

chunk {
  chunk_id
  document_id
  chunk_index
  sub_category
  keywords
}

| Domain            | Mục đích                | Ưu tiên |
| ----------------- | ----------------------- | ------- |
| Nutrition         | Giải thích dinh dưỡng   | ⭐⭐⭐⭐⭐   |
| Exercise          | Giải thích tập luyện    | ⭐⭐⭐⭐⭐   |
| Healthy Lifestyle | Ngủ, nước, stress       | ⭐⭐⭐⭐    |
| Disease Nutrition | Tiểu đường, huyết áp... | ⭐⭐⭐     |
| FAQ               | Các câu hỏi thường gặp  | ⭐⭐⭐⭐    |

| Chủ đề            | WHO | Harvard | Viện DD | ACSM |
| ----------------- | :-: | :-----: | :-----: | :--: |
| Healthy Diet      |  ✅  |    ✅    |    ✅    |   ❌  |
| Protein           |  ✅  |    ✅    |    ✅    |   ❌  |
| Fat               |  ✅  |    ✅    |    ✅    |   ❌  |
| Carbohydrate      |  ✅  |    ✅    |    ✅    |   ❌  |
| Physical Activity |  ✅  |    ❌    |    ❌    |   ✅  |
| Strength Training |  ❌  |    ❌    |    ❌    |   ✅  |
