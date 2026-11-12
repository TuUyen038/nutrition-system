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
- `POST /rag/retrieve` `{"query": "...", "top_k": 5, "audiences": null}` → `{chunks, reranked, threshold, thresholds, audiences}` (`thresholds` = ngưỡng theo từng ngôn ngữ)
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

## Đánh giá

```bash
venv/bin/python scripts/eval_retrieval.py --ks 1 5 20 --verbose
venv/bin/python scripts/eval_generic.py --verbose
venv/bin/python scripts/eval_router.py --verbose
```

```powershell
# Windows PowerShell
.\venv\Scripts\python.exe scripts\eval_retrieval.py --ks 1 5 20 --verbose
.\venv\Scripts\python.exe scripts\eval_generic.py --verbose
.\venv\Scripts\python.exe scripts\eval_router.py --verbose
# Lưu kết quả ra file để so sánh giữa các lần chỉnh:
.\venv\Scripts\python.exe scripts\eval_retrieval.py --ks 1 5 20 | Out-File -Encoding utf8 eval_retrieval_result.txt
```

Nếu console Windows in tiếng Việt bị lỗi font/`UnicodeEncodeError`, đặt `$env:PYTHONIOENCODING="utf-8"` (PowerShell) hoặc `set PYTHONIOENCODING=utf-8` (CMD) trước khi chạy.

Hai script truy xuất có cờ để xem từng thành phần đóng góp bao nhiêu: `--rerank` (bật rerank, mặc định tắt), `--no-lang-offset` (bỏ độ lệch ngôn ngữ),
`--no-audience-filter` (không lọc đối tượng), `--collection <tên>` (so sánh collection khác).

`eval_retrieval.py` đọc `data/eval/retrieval_qa.jsonl`. Mỗi câu có `relevant` (mục cần tìm thấy) và tùy chọn `accept` (mục thay thế cũng chấp nhận,
VD cùng đáp án ở tài liệu tiếng Việt). In thêm tỷ lệ chunk tiếng Anh trong top-5.

`eval_generic.py` đọc `data/eval/retrieval_generic.jsonl` (câu hỏi chung chung, không cần đáp án đến từng mục). Chạy sau mỗi lần thêm tài liệu mới.
Các nhóm câu hỏi: `nguoi_lon`, `tre_nho`, `mo_ho` (nhiều tài liệu chấp nhận), `van_dong`, `rau_qua`, `dac_thu` (chỉ một tài liệu tiếng Việt trả lời được),
`chi_tieng_anh` (chỉ tài liệu tiếng Anh trả lời được, để theo dõi tiếng Anh có bị lấn át), `ngoai_kb`, `ngoai_kb_tre_nho`, `ngoai_chu_de` (KB không có đáp án).
Mỗi câu có thể gắn thẻ `style` (không có thẻ = `goc`, tức sát chữ trong tài liệu): `dien_dat_lai`, `doi_thuong`, `khong_dau`, `gian_tiep`, `nhieu_y`.
Báo cáo in kết quả riêng từng kiểu; nếu `goc` cao mà các kiểu khác thấp nhiều thì truy xuất đang dựa vào trùng chữ hơn là hiểu nghĩa. Nên viết thêm câu
theo cách người dùng thật hỏi, đừng chỉ chép từ tiêu đề tài liệu.
Chỉ số: top-1 đúng nguồn, **từ chối nhầm** (đúng nguồn nhưng điểm dưới ngưỡng), nhiễu@K, từ chối đúng câu ngoài KB, thống kê theo ngôn ngữ, và dòng
**gợi ý ngưỡng riêng cho từng ngôn ngữ** để đặt vào `.env`. Khi thêm tài liệu, sửa `expect_docs` cho khớp `id` thật và đổi nhãn các câu `none`
mà tài liệu mới đã trả lời được.

Nhãn trong `data/eval/router_test.jsonl` vẫn có thể chứa các nhãn chi tiết cũ để đánh giá chất lượng embedding nội bộ. API public hiện định tuyến theo nhóm lớn:
`knowledge`, `mixed`, `personal`, `chitchat`, `out_of_scope`, `ambiguous`.

### Khi nào cập nhật file dữ liệu

| File | Cập nhật khi |
|---|---|
| `data/eval/retrieval_qa.jsonl` | Thêm tài liệu mới (thêm câu hỏi + đáp án cho tài liệu đó) hoặc đổi tên tài liệu/heading |
| `data/eval/retrieval_generic.jsonl` | Thêm tài liệu mới: thêm vài câu chung chung và sửa `expect_docs`; đổi nhãn câu `none` mà tài liệu mới đã trả lời được |
| `data/optional/*.md` | Tài liệu/phần dài chưa nạp mặc định; chép sang `data/raw/` khi muốn dùng |
| `data/intents/exemplars.json` | Router phân loại sai nhiều, hoặc thêm chủ đề mới (VD thêm tài liệu về vận động → thêm câu mẫu `knowledge.exercise`) |
| `data/eval/router_test.jsonl` | Gặp câu phân loại sai, hoặc thêm chủ đề mới. **Không** chép câu từ `exemplars.json` sang đây |
| `data/chunk_profiles.json` | Muốn thêm một kiểu chunk mới cho một loại tài liệu |

Sửa `exemplars.json` hoặc `.env` xong phải **restart uvicorn**. Sửa cách chunk/embedding xong phải `ingest.py` lại (`--reset` hoặc `--only`).
Tham số cần chỉnh theo kết quả eval (`ai-service/.env`): `VECTOR_RELEVANCE_THRESHOLD`, `VECTOR_RELEVANCE_THRESHOLD_<LANG>`, `LANG_SCORE_OFFSET_<LANG>`,
`RELEVANCE_THRESHOLD` (chỉ khi bật rerank), `RERANK_CANDIDATES_PER_LANG`,
`ROUTER_MARGIN`, `ROUTER_SUB_MARGIN`, `ROUTER_OOS_MARGIN`, `ROUTER_KEYWORD_BOOST`.
