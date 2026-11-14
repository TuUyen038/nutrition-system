# NutriCare AI service (RAG + Intent Router)

Project Python độc lập với backend Node.js trong cùng repository. Hai bên chỉ nói chuyện qua HTTP:
Node gọi `backend/services/ragClient.service.js` → `AI_SERVICE_URL` hoặc `RAG_BASE_URL` (mặc định `http://localhost:8000`).

```
Câu hỏi user ─► Node ─► POST /router/classify ─► intent nhóm lớn
                  ├─ knowledge      ─► Gemini chỉ có rag_retrieve
                  ├─ personal       ─► Gemini có database tools
                  ├─ mixed          ─► Gemini có rag_retrieve + database tools
                  ├─ chitchat       ─► câu trả lời có sẵn, không gọi Gemini
                  ├─ out_of_scope   ─► câu từ chối cố định, không gọi Gemini
                  └─ ambiguous/lỗi  ─► Gemini có toàn bộ tools + rag_retrieve
```

## Các intent

| intent | sub_intent | Ví dụ | Xử lý ở Node |
|---|---|---|---|
| `knowledge` | `null` | "Một ngày nên ăn bao nhiêu rau?" | Gemini bắt buộc dùng `rag_retrieve` |
| `mixed` | – | "Với cân nặng của tôi nên ăn bao nhiêu protein?" | RAG, hồ sơ user đưa vào prompt |
| `personal` | `null` | "Hôm nay tôi tập gì?" | Gemini chọn database tool |
| `chitchat` | `greeting`, `thanks`, `goodbye`, `about_bot`, `other` | "Cảm ơn bạn" | Câu trả lời có sẵn, không gọi Gemini |
| `out_of_scope` | – | "Giá vàng hôm nay?" | từ chối cố định |
| `ambiguous` | – | "Giúp mình với" | function calling đủ tool |

## Truy xuất (`/rag/retrieve`)

1. **Lọc đối tượng.** Mỗi tài liệu có `audience_group` (mặc định `general`, VD `infant` cho tài liệu ăn dặm). Câu hỏi không có từ khóa về trẻ nhỏ
   (bé, trẻ, bú mẹ, ăn dặm, tháng tuổi...) chỉ tìm trong tài liệu `general`; có từ khóa thì tìm tất cả.
2. **Ứng viên theo từng ngôn ngữ.** Lấy top-N (`RERANK_CANDIDATES_PER_LANG`) riêng cho mỗi `lang` có trong kho, để tài liệu tiếng Anh
   không bị tài liệu tiếng Việt lấn át khi câu hỏi bằng tiếng Việt.
3. **Xếp hạng.** Mặc định (rerank tắt): xếp theo cosine cộng độ lệch theo ngôn ngữ (`LANG_SCORE_OFFSET_EN`, mặc định +0.06, xem mục
   "Tiếng Anh và tiếng Việt trong cùng một kho"). Rerank (cross-encoder `RERANK_MODEL`) mặc định **tắt** (`RERANK_ENABLED=0`), vì điểm rerank của
   cặp câu hỏi tiếng Việt - tài liệu tiếng Anh gần như bằng 0 nên không so sánh được giữa các ngôn ngữ.
4. **Cờ `relevant`.** Mỗi chunk trả kèm `relevant`: cosine thô ≥ ngưỡng theo ngôn ngữ của chunk (`VECTOR_RELEVANCE_THRESHOLD`, hoặc
   `VECTOR_RELEVANCE_THRESHOLD_VI`/`_EN`...). Node chỉ dùng chunk `relevant`; không có chunk nào thì trả lời "chưa tìm thấy trong tài liệu".

Kết quả mỗi chunk: `text`, `score` (cosine thô, hoặc điểm rerank nếu bật), `vector_score` (cosine thô), `rank_score` (điểm dùng để xếp hạng),
`relevant`, `threshold`, `doc_id`, `title`, `org`, `year`, `url`, `lang`, `heading`, `section`, `h1..h5`.

## Chống ảo giác (`/rag/verify`)

Mọi câu trả lời có gọi `rag_retrieve` đều được kiểm tra trước khi trả cho user (`backend/services/grounding.service.js` → `app/grounding.py`):

1. Node đánh số các chunk trong lượt chat là `[S1]`, `[S2]`... Gemini nhận các chunk kèm `GROUNDED_RULES`: chỉ dùng nội dung nguồn,
   chép đúng số liệu, mỗi câu có số liệu kết thúc bằng `[Sx]`, nguồn rỗng thì nói chưa có thông tin.
2. `POST /rag/verify` `{"answer", "sources": [{id, text, title, org, year, lang}], "allowed_context": [...], "semantic": null}`:
   - **error** (câu trả lời không đạt): `invalid_citation` (`[Sx]` không tồn tại), `unsupported_number` (số không có trong nguồn nào),
     `uncited_number` (câu có số liệu nhưng không có `[Sx]`).
   - **warning**: `number_in_other_source`, `low_semantic_support` (cosine câu–chunk < `GROUNDING_SIM_THRESHOLD`), `uncited_recommendation`.
   - `allowed_context`: câu hỏi, hồ sơ user, kết quả database tool; số trong đó không cần nguồn.
   - Trả `passed`, `support_ratio`, `errors`, `warnings`, `sentences` và `fixed_answer` (đã bỏ câu có số bịa, tự gắn `[Sx]` cho câu quên trích).
3. Không đạt → Gemini viết lại 1 lần kèm danh sách lỗi → vẫn không đạt → dùng `fixed_answer` + ghi chú "đã lược bỏ"
   (không còn gì → câu từ chối cố định). Danh sách "Nguồn tham khảo" do code tạo từ các `[Sx]` thật sự được dùng.
4. Response chat có thêm `message.citations` và `message.grounding` (`action`: `passed` | `regenerated` | `stripped` | `refused`,
   `initialErrors` = lỗi của bản nháp đầu, dùng để đo mức "bịa").

Biến `.env`: `GROUNDING_SEMANTIC` (1/0), `GROUNDING_SIM_THRESHOLD` (mặc định 0.78), `GROUNDING_IGNORE_NUMBERS` (mặc định `0,1`).
Bên Node: `AI_VERIFY_TIMEOUT_MS` (mặc định 6000). ai-service tắt → không kiểm tra được, câu trả lời vẫn trả về với `grounding.checked=false`.

Unit test (không cần model): `venv/bin/python -m unittest tests.test_grounding -v`

## Chunk và embedding

- **Chunk theo section.** Mỗi chunk là nội dung của MỘT mục; dòng đầu chunk là tiêu đề mục đó (đã bỏ số mục "3.1.3."). Mục dài bị cắt theo token,
  mỗi đoạn lặp lại dòng tiêu đề; bảng bị cắt thì lặp lại hàng tiêu đề bảng.
- **Embedding chỉ tính trên nội dung chunk.** Đường dẫn mục (H1 > H2 > H3...) KHÔNG đưa vào embedding, chỉ lưu ở metadata
  (`section` = cả đường dẫn, `heading` = mục cuối, `h1..h5` = từng cấp).
- **Profile chunk theo tài liệu** (`data/chunk_profiles.json`), chọn bằng `chunk_profile` trong front matter:

| profile | strategy | max / overlap | Dùng cho |
|---|---|---|---|
| `structured` | section | 400 / 60 | tài liệu có heading rõ ràng (mặc định nếu có heading) |
| `compact` | section | 250 / 40 | tài liệu nhiều bảng, số liệu dày |
| `plain` | fixed | 400 / 70 | văn bản không có heading (mặc định nếu không có heading) |

Ghi đè riêng một tài liệu ngay trong front matter: `chunk_max_tokens`, `chunk_overlap`, `chunk_strategy` (`section`/`fixed`),
`split_level` (chỉ tách mục đến cấp heading này). Thứ tự ưu tiên: mặc định → profile → front matter → tham số CLI.

Front matter mẫu:

```yaml
---
id: huong_dan_an_bo_sung
title: "Hướng dẫn ăn bổ sung cho trẻ em từ 6 đến 23 tháng tuổi"
org: "Bộ Y tế"
year: "2023"
url: ""
lang: vi
audience_group: infant        # general (mặc định) | infant | ...
chunk_profile: structured
---
```

## Tiếng Anh và tiếng Việt trong cùng một kho

Model `multilingual-e5-base` cho điểm cosine của cặp tiếng Việt - tiếng Việt cao hơn cặp tiếng Việt - tiếng Anh khoảng 0.06 dù nội dung liên quan
như nhau. Nếu gộp thẳng, chunk tiếng Anh gần như không bao giờ vào top-K, và một ngưỡng chung không dùng được cho cả hai ngôn ngữ. Cách xử lý:

1. **Ứng viên theo từng ngôn ngữ:** lấy top-N riêng cho mỗi `lang`, rồi mới gộp.
2. **Độ lệch xếp hạng** `LANG_SCORE_OFFSET_<LANG>` (mặc định en = 0.06) chỉ dùng để xếp hạng khi gộp; `score` vẫn là cosine thô.
3. **Ngưỡng theo ngôn ngữ** `VECTOR_RELEVANCE_THRESHOLD_<LANG>`: chunk tiếng Việt thường cần ngưỡng cao hơn tiếng Anh. Giá trị lấy từ dòng
   "Gợi ý ngưỡng theo ngôn ngữ" của `python scripts/eval_generic.py`.
4. **Giữ phần tiếng Anh gọn:** chỉ để trong `data/raw/` các tài liệu/phần có giá trị trả lời. Phần dài, nhiều số liệu (ví dụ bằng chứng khoa học của
   hướng dẫn WHO về hoạt động thể lực) nằm ở `data/optional/`, KHÔNG được nạp. Muốn dùng thì chép file sang `data/raw/` rồi `ingest.py --only`.
5. Nếu vẫn chưa đủ: thử model embedding đa ngữ mạnh hơn (ví dụ `BAAI/bge-m3`, cần bỏ prefix `query:`/`passage:` trong `embedding.py`) và so sánh bằng cùng bộ eval.

## Cài đặt

Yêu cầu: Python **3.10–3.12** (khuyên 3.11; `chromadb`/`torch` thường chưa có bản cài sẵn cho Python mới nhất), ~4 GB trống cho model.
Nếu đã di chuyển thư mục, không dùng lại virtualenv cũ vì script activate chứa đường dẫn tuyệt đối trước đó. Hãy xóa thư mục `venv` và tạo lại.

### macOS/Linux

```bash
cd <project>/ai-service
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Có thể chạy mà không activate:

```bash
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Windows (PowerShell)

```powershell
cd D:\Project\nutrition-system\nutrition-system\ai-service
py -3.11 -m venv venv            # hoặc: py -m venv venv  (xem các bản Python đã cài: py -0)
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Nếu PowerShell báo `running scripts is disabled on this system` khi activate, chạy một lần rồi activate lại:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Dùng **CMD** thay cho PowerShell thì activate bằng `venv\Scripts\activate.bat` và copy bằng `copy .env.example .env`.

Có thể chạy mà không activate: `.\venv\Scripts\python.exe ...` (tương đương `venv/bin/python ...` trên macOS/Linux).
Các mục bên dưới đều có lệnh cho cả hai hệ điều hành. Sau khi activate, lệnh `python scripts/...` chạy giống nhau trên mọi hệ.

Lỗi hay gặp trên Windows:
- Cài `chromadb` báo cần *Microsoft Visual C++ Build Tools*: cài "Desktop development with C++" từ Visual Studio Build Tools, hoặc đổi sang Python 3.11.
- Muốn cài torch bản CPU cho nhẹ (không có GPU NVIDIA): `python -m pip install torch --index-url https://download.pytorch.org/whl/cpu` trước khi cài `requirements.txt`.
- Thư mục model HuggingFace nằm ở `%USERPROFILE%\.cache\huggingface`; xóa thư mục model trong đó nếu tải dở bị lỗi.

Lần chạy đầu tải model embedding `intfloat/multilingual-e5-base` (~1 GB) và model rerank (`BAAI/bge-reranker-v2-m3`, ~2 GB; máy yếu thì đặt
`RERANK_MODEL=cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`). Nếu `pip`/HuggingFace báo lỗi chứng chỉ SSL (mạng công ty có proxy), cần cấu hình
chứng chỉ của công ty cho pip (`pip config set global.cert <file.pem>`) và cho Hugging Face (`REQUESTS_CA_BUNDLE`/`CURL_CA_BUNDLE`), hoặc cài ở mạng khác.

## Quản lý tài liệu nguồn (`data/sources.yaml`)

Nguyên tắc: nội dung trong `data/raw/*.md` là **nguyên văn** file gốc (PDF/HTML) tải từ trang chính thức. Chỉ được thêm front matter
và dòng heading `##`; chỉnh sửa đoạn văn duy nhất được phép là bỏ số trích dẫn tham khảo kiểu `(101)` (`--drop-ref-marks`).

```text
data/
  sources.yaml            sổ đăng ký: id, file, title, org, year, url, doi, original, sha256, license, status, verified_by...
  sources/<id>/source.*   file gốc tải về (KHÔNG commit: bản quyền + dung lượng; sha256 trong sources.yaml chứng minh file không đổi)
  drafts/<id>.md          bản nháp do source_to_md.py sinh (không commit)
  raw/<id>.md             bản đã kiểm tra, được ingest
```

`status`: `draft` (ingest bỏ qua) → `checked` (check_sources PASS) → `verified` (người đã đối chiếu file gốc);
`legacy` = tài liệu cũ chưa có file gốc (vẫn nạp, có cảnh báo); `rejected` = không dùng. File trong `raw/` chưa đăng ký vẫn nạp nhưng bị cảnh báo.

```bash
# 1. Tải file gốc (trình duyệt, hoặc API chính thức như Europe PMC) -> data/sources/<id>/source.pdf|html|xml
# 2. Chuyển nguyên văn. Lệnh đầy đủ của từng tài liệu lưu ở trường `convert` trong sources.yaml
venv/bin/python scripts/source_to_md.py us_physical_activity_guidelines_2018 --pages 29-31,57-63 --skip-headings "Learn More"
#    PDF:  --pages, --skip-headings, --pdf-engine blocks (mặc định, giữ thứ tự đọc khi trang nhiều cột) | pymupdf4llm
#    XML (PubMed Central/JATS): --skip-sections, --skip-tables, --max-heading-level
#    Chung: --drop-ref-marks (bỏ số trích dẫn "(12)"), --exclude-paragraphs REGEX (bỏ đoạn), --stop-at, --out
# 3. (tùy chọn) thêm/sửa heading ## trong data/drafts/<id>.md, KHÔNG sửa chữ đoạn văn
# 4. Đối chiếu: mọi câu + mọi con số phải có trong file gốc, sha256 khớp, front matter khớp sources.yaml
venv/bin/python scripts/check_sources.py us_physical_activity_guidelines_2018 --file data/drafts/us_physical_activity_guidelines_2018.md --verbose
# 5. PASS -> chép sang data/raw/, status: checked, nạp
venv/bin/python scripts/ingest.py --only us_physical_activity_guidelines_2018.md
# Kiểm tra toàn bộ kho bất cứ lúc nào (exit code 1 nếu có FAIL):
venv/bin/python scripts/check_sources.py
```

Chỉ bớt nội dung (chọn trang/mục/bảng/đoạn) là được phép; checker chỉ chứng minh "mọi chữ có trong gốc", không chứng minh
"không thiếu ý", nên sau khi chuyển vẫn cần đọc lướt: bảng nhiều cột có đúng cột không, mục có đúng heading không.

`check_sources.py` báo: số đoạn `exact` / `near` (≥90% trùng, thường do bảng PDF đảo cột, nên xem lại) / `not_found` (FAIL),
số liệu không có trong gốc (FAIL), heading không có trong gốc (do người/AI thêm, cần duyệt bằng mắt).

## Nạp tài liệu (knowledge base)

Bỏ tài liệu vào `data/raw/`:

| Loại | Cách làm |
|---|---|
| `.md`, `.txt` | Dùng trực tiếp. Đầu file nên có front matter (xem mẫu ở trên) để citation có tên tài liệu, cơ quan, năm, URL. |
| `.pdf` | Bỏ thẳng vào, loader tự chuyển sang markdown. PDF scan (ảnh) không đọc được chữ: xử lý như infographic. |
| trang web | Copy nội dung vào file `.md`, thêm heading `##` cho từng mục (chunk được cắt theo heading). Hoặc lưu `.html`. |
| infographic (ảnh) | `venv/bin/python scripts/image_to_md.py --image x.jpg --title "..." --org "..." --year 2016 --lang vi` (Windows: `.\venv\Scripts\python.exe scripts\image_to_md.py ...`; dùng Gemini vision, cần `GEMINI_API_KEY`) → rà lại file `.md` sinh ra rồi ingest. |

```bash
venv/bin/python scripts/ingest.py --reset
venv/bin/python scripts/ingest.py --only huong_dan_an_bo_sung.md
```

```powershell
# Windows PowerShell
.\venv\Scripts\python.exe scripts\ingest.py --reset
.\venv\Scripts\python.exe scripts\ingest.py --only huong_dan_an_bo_sung.md
```

Thử nghiệm không đụng collection chính (nạp vào collection riêng rồi truyền `--collection` cho các script eval):

```bash
venv/bin/python scripts/ingest.py --chunk-size 300 --overlap 50 --collection kb_c300
venv/bin/python scripts/ingest.py --embed-prefix path --collection kb_path
```

```powershell
# Windows PowerShell
.\venv\Scripts\python.exe scripts\ingest.py --chunk-size 300 --overlap 50 --collection kb_c300
.\venv\Scripts\python.exe scripts\ingest.py --embed-prefix path --collection kb_path
```

## Chạy service

```bash
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```powershell
# Windows PowerShell (chạy trong thư mục ai-service)
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
# Kiểm tra nhanh ở cửa sổ PowerShell khác:
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod -Method Post http://localhost:8000/rag/retrieve -ContentType "application/json; charset=utf-8" `
  -Body ([Text.Encoding]::UTF8.GetBytes('{"query": "Người lớn nên vận động bao nhiêu phút mỗi tuần?", "top_k": 5}'))
```

Lần đầu khởi động mất vài phút để tải model. Windows Firewall có thể hỏi quyền mở port: chỉ cần cho phép mạng Private,
hoặc đổi `--host 127.0.0.1` nếu chỉ backend trên cùng máy gọi tới.

- `GET  /health` → `{status, model, chunks, reranker: {enabled, ready, model}}` (`chunks = 0` nghĩa là chưa chạy `ingest.py`)
- `POST /router/classify` `{"text": "..."}` → `{intent, sub_intent, scores, method, latency_ms}`. `sub_intent` chỉ được giữ cho `chitchat`; các nhóm khác trả `null`.
- `POST /rag/verify` → xem mục "Chống ảo giác"
- `POST /rag/retrieve` `{"query": "...", "top_k": 5, "audiences": null, "doc_ids": null}` (`doc_ids`: chỉ tìm trong các tài liệu này) → `{chunks, reranked, threshold, thresholds, audiences}` (`thresholds` = ngưỡng theo từng ngôn ngữ)
- Tài liệu API tương tác: http://localhost:8000/docs

## Cấu hình phía Node (`backend/.env`)

```
AI_SERVICE_URL=http://localhost:8000
# Backend cũng hỗ trợ RAG_BASE_URL nếu AI_SERVICE_URL không được đặt.
RAG_BASE_URL=http://localhost:8000
AI_SERVICE_TIMEOUT_MS=8000
AI_CLASSIFY_TIMEOUT_MS=3000
AI_INTERNAL_KEY=               # nếu đặt, phải trùng INTERNAL_KEY trong ai-service/.env
```

Backend gửi `AI_INTERNAL_KEY` qua header `x-internal-key`.

ai-service tắt hoặc lỗi → chatbot tự dùng function calling fallback. Khi đó RAG không thể truy xuất cho tới khi service được bật lại.

## Tích hợp với backend Node.js

Các file liên quan:

```text
backend/services/ragClient.service.js
backend/services/chatTools.definition.js
backend/services/chatTools.executor.js
backend/services/chat.service.js
```

`rag_retrieve` là Gemini function tool. Tool gọi `POST /rag/retrieve`, lọc các chunk có `relevant != false`, rồi trả nội dung và citation về cho Gemini.

Log mong đợi với câu hỏi kiến thức:

```text
[IntentRouter] { intent: 'knowledge', method: '...' }
[Gemini] Intent tools: knowledge { count: 1, names: [ 'rag_retrieve' ] }
[Gemini] Tool: rag_retrieve { query: '...' }
```

Nếu log hiện `Intent tools: fallback`, backend không gọi được `/router/classify`; hãy kiểm tra service có chạy ở port 8000 hay không và kiểm tra `INTERNAL_KEY`/`AI_INTERNAL_KEY`.

## So sánh dữ liệu Google Health với chuẩn WHO (backend)

`GET /api/google-health/who-comparison?sync=1` và tool chat `get_activity_vs_who` (intent `mixed`/`personal`):

1. Dữ liệu 7 ngày: Google Health (`moderateMinutes`, `vigorousMinutes` lấy từ active-minutes theo mức LIGHT/MODERATE/VIGOROUS;
   phút NHẸ không tính theo WHO) + buổi tập hoàn thành trong app (phân loại theo `Exercise.activityType`).
2. `backend/services/activityGuideline.rules.js` (thuần, có test `node scripts/test_activity_guideline.js`):
   nhóm tuổi -> chuẩn WHO (`backend/config/whoGuidelines.config.js`, số lấy nguyên văn WHO 2020);
   aerobic = vừa + 2 × mạnh (phút/tuần, trẻ em: trung bình phút/ngày); tăng cơ ≥ 2 ngày; người ≥ 65 tuổi thêm thăng bằng ≥ 3 ngày;
   < 4/7 ngày có dữ liệu -> không kết luận; bước chân chỉ tham khảo (WHO không đặt chỉ tiêu).
3. Khuyến nghị theo luật: thiếu bao nhiêu -> số buổi × phút (người mới: tăng tối đa 60 phút/tuần), quá tải -> chỉ hồi phục,
   bài tập chọn trong DB bằng `rankExercises` (loại chấn thương / thiết bị / độ khó / va chạm mạnh; HIIT chỉ khi đã quen tập).
4. Trích dẫn: `/rag/retrieve` với truy vấn cố định + `doc_ids` (WHO / HHS / ACSM) cho từng chỉ tiêu; chunk đăng ký vào
   `SourceRegistry` nên câu trả lời chatbot đi qua `/rag/verify`: số liệu của user được dùng tự do, số CHUẨN phải có `[Sx]`.

## Đánh giá

### Truy xuất (định lượng, không gọi LLM)

```bash
venv/bin/python scripts/eval_retrieval.py --verbose                    # bộ vận động + bộ cũ, K = 1 3 5 10
venv/bin/python scripts/eval_retrieval.py --thresholds vi=0.64 en=0.58 # thử ngưỡng khác, không cần sửa .env
venv/bin/python scripts/eval_retrieval.py --save before                # lưu data/eval/results/before.json
venv/bin/python scripts/eval_retrieval.py --compare data/eval/results/before.json   # in chênh lệch
venv/bin/python scripts/eval_ablation.py                               # bảng ablation + quét ngưỡng -> results/ablation.md
venv/bin/python scripts/eval_generic.py --verbose                      # độ nhiễu với câu hỏi chung chung
venv/bin/python scripts/eval_router.py --verbose
venv/bin/python -m unittest tests.test_evaluation tests.test_grounding -v
```

Bộ câu hỏi (`data/eval/`):

| File | Nội dung |
|---|---|
| `retrieval_exercise.jsonl` | 46 câu vận động có đáp án (WHO 2020, WHO fact sheet, ACSM 2026, HHS 2018, Bộ Y tế) + 8 câu ngoài kho; gắn `topic`, `audience`, `style` |
| `retrieval_qa.jsonl` | 42 câu dinh dưỡng + vận động (bộ cũ; nhãn có trước khi thêm HHS/ACSM nên đánh giá thấp các câu HHS trả lời đúng) |
| `retrieval_generic.jsonl` | câu chung chung theo tài liệu (`expect_docs`) + 24 câu ngoài kho; dùng cho eval_generic và quét ngưỡng |

Nhãn: `relevant` (nguồn chính, mức 2) và `accept` (nguồn khác cũng trả lời đúng, mức 1); `section` là chuỗi con của đường dẫn mục.
Script báo nhãn không khớp chunk nào ("dangling") -> sửa nhãn trước khi tin số liệu.

Chỉ số (định nghĩa trong `app/evaluation.py`):

| Chỉ số | Ý nghĩa |
|---|---|
| Hit@K, Recall@K | top-K có chunk liên quan / tỷ lệ mục `relevant` được phủ |
| Precision@K | tỷ lệ chunk liên quan trong top-K |
| nDCG@K | chất lượng thứ tự có xét mức liên quan (2/1); IDCG tính từ mọi chunk liên quan có trong kho |
| MAP@K, MRR | average precision; 1/hạng chunk liên quan đầu tiên |
| **Usable@5** | chunk đúng trong top-5 **và** vượt ngưỡng `relevant` -> LLM thật sự nhận được (Node bỏ chunk dưới ngưỡng) |
| **Reject@5** | câu ngoài kho: không chunk nào vượt ngưỡng -> chatbot từ chối thay vì trả lời bằng tài liệu không liên quan |

Kết quả gần nhất: `data/eval/results/ablation.md` (bge-m3): ngưỡng vi=0.64 en=0.58 + `SECTION_AUDIENCE_PENALTY=0.04`
-> Hit@1 0.670 -> 0.739, MRR 0.785 -> 0.834, Usable@5 0.705 -> 0.864, Reject@5 0.375 -> 1.000 (8 câu ngoài kho của bộ vận động).
Ngưỡng được chọn bằng quét lưới + kiểm định chéo 2-fold (vùng VI 0.60-0.64, EN 0.56-0.58 ổn định giữa hai fold);
số câu ngoài kho còn ít (32) nên Reject@5 dao động, cần thêm câu khi có thể. Điểm yếu còn lại: câu không dấu (Hit@5 0.29).

Các cờ của eval_retrieval/eval_generic: `--rerank`, `--no-lang-offset`, `--no-audience-filter`, `--audience-penalty X`,
`--per-lang N`, `--collection <tên>`. Nếu console Windows lỗi tiếng Việt: `$env:PYTHONIOENCODING="utf-8"`.

`eval_generic.py` (độ nhiễu): nhóm `nguoi_lon`, `tre_nho`, `mo_ho`, `van_dong`, `rau_qua`, `dac_thu`, `chi_tieng_anh`, `ngoai_kb`...;
in top-1 đúng nguồn, từ chối nhầm, nhiễu@K, từ chối đúng câu ngoài KB, gợi ý ngưỡng theo ngôn ngữ.

Nhãn trong `data/eval/router_test.jsonl` vẫn có thể chứa các nhãn chi tiết cũ để đánh giá chất lượng embedding nội bộ. API public hiện định tuyến theo nhóm lớn:
`knowledge`, `mixed`, `personal`, `chitchat`, `out_of_scope`, `ambiguous`.

### Khi nào cập nhật file dữ liệu

| File | Cập nhật khi |
|---|---|
| `data/eval/retrieval_exercise.jsonl`, `retrieval_qa.jsonl` | Thêm tài liệu mới (thêm câu hỏi + đáp án; thêm `accept` cho câu cũ mà tài liệu mới cũng trả lời được) hoặc đổi tên tài liệu/heading. Đổi nhãn -> hash bộ câu hỏi đổi, không so sánh với kết quả cũ |
| `data/eval/retrieval_generic.jsonl` | Thêm tài liệu mới: thêm vài câu chung chung và sửa `expect_docs`; đổi nhãn câu `none` mà tài liệu mới đã trả lời được |
| `data/optional/*.md` | Tài liệu/phần dài chưa nạp mặc định; chép sang `data/raw/` khi muốn dùng |
| `data/intents/exemplars.json` | Router phân loại sai nhiều, hoặc thêm chủ đề mới (VD thêm tài liệu về vận động → thêm câu mẫu `knowledge.exercise`) |
| `data/eval/router_test.jsonl` | Gặp câu phân loại sai, hoặc thêm chủ đề mới. **Không** chép câu từ `exemplars.json` sang đây |
| `data/chunk_profiles.json` | Muốn thêm một kiểu chunk mới cho một loại tài liệu |

Sửa `exemplars.json` hoặc `.env` xong phải **restart uvicorn**. Sửa cách chunk/embedding xong phải `ingest.py` lại (`--reset` hoặc `--only`).
Tham số cần chỉnh theo kết quả eval (`ai-service/.env`): `VECTOR_RELEVANCE_THRESHOLD`, `VECTOR_RELEVANCE_THRESHOLD_<LANG>`, `LANG_SCORE_OFFSET_<LANG>`,
`RELEVANCE_THRESHOLD` (chỉ khi bật rerank), `RERANK_CANDIDATES_PER_LANG`, `SECTION_AUDIENCE_PENALTY`,
`ROUTER_MARGIN`, `ROUTER_SUB_MARGIN`, `ROUTER_OOS_MARGIN`, `ROUTER_KEYWORD_BOOST`.
