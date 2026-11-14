# Báo cáo: RAG y khoa chống ảo giác, đánh giá truy xuất và khuyến nghị vận động theo chuẩn WHO

Hệ thống: NutriCare (backend Node.js + ai-service Python). Phạm vi: các thay đổi từ commit `13816aa` đến nay.

## 1. Mục tiêu

Báo cáo trình bày ba nội dung đã phát triển. Thứ nhất, tích hợp tài liệu y khoa (WHO, ACSM) vào chatbot theo hướng RAG, kèm prompt và cơ chế kiểm tra để chatbot không bịa số liệu. Thứ hai, đánh giá định lượng khả năng truy xuất tài liệu. Thứ ba, khuyến nghị bài tập cá nhân hóa bằng cách so dữ liệu vận động thật của người dùng (Google Health) với chuẩn khuyến nghị của WHO.

## 2. Chống ảo giác cho câu trả lời có dùng RAG (commit `13816aa`)

Trước khi sửa, prompt chỉ yêu cầu chatbot "dựa trên tài liệu và nêu nguồn khi phù hợp". Ngoài ra, cấu hình Gemini còn cho phép dùng kiến thức chung khi tool không trả kết quả. Vì vậy chatbot vẫn có thể tự đưa ra con số không có trong tài liệu.

Hệ thống mới hoạt động qua ba lớp. Lớp thứ nhất là prompt. Mỗi đoạn tài liệu lấy được trong một lượt chat được đánh mã `[S1]`, `[S2]`... Chatbot nhận 10 quy tắc, trong đó có: chỉ dùng thông tin trong các đoạn nguồn; câu nào có số liệu thì phải kết thúc bằng mã nguồn; chép đúng con số, không tự quy đổi đơn vị; tài liệu không có thì phải nói là chưa có thông tin; nêu rõ đối tượng áp dụng của khuyến nghị; không chẩn đoán, không kê thuốc.

Lớp thứ hai là bộ kiểm tra tự động `POST /rag/verify` (file `ai-service/app/grounding.py`). Bộ kiểm tra tách câu trả lời thành từng câu, chuẩn hóa các con số (ví dụ "10.000" và "10,000" là một số, "2,5" và "2.5" là một số), rồi kiểm tra ba điều: mã nguồn được nhắc có tồn tại không, mỗi con số có xuất hiện trong nguồn không, câu có số liệu có trích nguồn không. Số liệu cá nhân của người dùng (cân nặng, số phút vận động lấy từ database) được khai báo riêng và được phép dùng mà không cần nguồn.

Lớp thứ ba là xử lý khi kiểm tra không đạt. Chatbot được yêu cầu viết lại một lần, kèm danh sách lỗi cụ thể. Nếu bản viết lại vẫn sai, hệ thống bỏ các câu có số bịa, tự gắn mã nguồn cho những câu có số đúng nhưng quên trích, và ghi chú rằng một phần nội dung đã được lược bỏ. Nếu không còn nội dung nào có căn cứ, chatbot trả lời bằng câu từ chối cố định. Danh sách "Nguồn tham khảo" ở cuối câu trả lời do code tạo ra, không phải do chatbot viết.

Kết quả minh họa (`docs/bao-cao/ket-qua/01_chong_bia_demo.txt`), dùng đoạn khuyến nghị người lớn thật trong tài liệu WHO 2020:
- Câu trả lời đúng nguồn được chấp nhận.
- Câu "WHO khuyến nghị 200 phút mỗi tuần" bị chặn.
- Câu có số đúng nhưng quên trích dẫn được tự gắn `[S1]`.
- Câu trích nguồn không tồn tại `[S4]` bị loại bỏ.

Bộ kiểm tra có 13 unit test và đều đạt.

Lớp kiểm tra thứ tư là so độ tương đồng ngữ nghĩa giữa từng câu trả lời và đoạn nguồn bằng embedding, và lớp này **không hiệu quả**. Trong demo, câu đúng có cosine 0,57–0,61, còn câu bịa số lại đạt 0,72. Câu bịa vẫn nói đúng chủ đề, chỉ sai con số, nên điểm tương đồng không phân biệt được. Lớp này vì vậy chỉ được giữ ở mức cảnh báo. Việc chặn câu bịa do lớp kiểm tra số liệu và trích dẫn đảm nhận.

## 3. Quản lý và bổ sung tài liệu nguồn (commit `1205a1d`)

Nguyên tắc đặt ra là nội dung trong kho phải là nguyên văn của file gốc tải từ trang chính thức. AI chỉ được thêm phần thông tin đầu file (front matter) và tiêu đề mục. Mọi tài liệu được ghi trong sổ đăng ký `ai-service/data/sources.yaml`, gồm: URL, DOI, mã băm sha256 của file gốc, giấy phép, trạng thái kiểm tra và người duyệt. Script `check_sources.py` đối chiếu từng câu và từng con số trong file markdown với file gốc. Câu nào không có trong file gốc thì tài liệu đó bị đánh FAIL. `ingest.py` không nạp các tài liệu chưa kiểm tra.

Công cụ này phát hiện ba vấn đề thật:
- File WHO 2020 có sẵn trong kho đã bị người trước sửa hai chỗ: bỏ số trích dẫn tài liệu tham khảo, và sửa một lỗi chính tả của bản gốc. Không có nội dung bịa. Lỗi chính tả đã được trả về nguyên văn, còn việc bỏ số trích dẫn được ghi thành quy tắc chỉnh sửa được phép.
- Thư viện chuyển PDF sang markdown (`pymupdf4llm`) đọc lẫn chữ giữa cột chính và khung bên lề của tài liệu HHS, tạo ra 59 câu sai nghĩa. Tôi viết bộ chuyển PDF riêng đọc theo cột, đạt 100% nguyên văn.
- Một bảng hai cột bị đọc theo hàng ngang, khiến "đi bộ" nằm lẫn vào cột bài tăng cơ. Lỗi này checker không phát hiện được, vì từng dòng vẫn đúng nguyên văn. Bộ chuyển đã được sửa để đọc bảng theo cột.

Ba tài liệu đã được thêm vào kho, cả ba đều đạt 100% nguyên văn:
- WHO Physical activity fact sheet (2024): lợi ích, rủi ro, số liệu chung.
- ACSM Position Stand 2026 về tập kháng lực: bản truy cập mở trên PubMed Central, giấy phép CC BY-NC-ND.
- Physical Activity Guidelines for Americans 2nd ed. (HHS 2018): chỉ lấy các phần WHO không có, gồm cường độ vận động, an toàn khi tập, bệnh mạn tính, người cao tuổi và số bước chân.

Hai bài ACSM 2011 và 2015 không tải được (bị chặn tự động và cần trả phí) nên được đánh dấu `rejected`, nội dung tương ứng lấy từ HHS. Kho hiện có 18 tài liệu được nạp, tổng cộng 483 đoạn (chunk). 13 tài liệu tiếng Việt cũ chưa có file gốc nên ở trạng thái `legacy`, chưa chứng minh được nguồn.

## 4. Đánh giá định lượng khả năng truy xuất (commit `6d5d7d2`, `7348121`)

Bộ câu hỏi mới gồm 46 câu về vận động có đáp án và 8 câu ngoài kho. Mỗi câu ghi nguồn, đối tượng (người lớn, người cao tuổi, trẻ em, bà bầu...) và kiểu diễn đạt (sát chữ tài liệu, đời thường, gián tiếp, không dấu). Nhãn đáp án đều được kiểm tra: mỗi nhãn phải khớp với đoạn có thật trong kho và đoạn đó phải chứa câu trả lời. Gộp với bộ cũ, đánh giá dùng 88 câu có đáp án.

Ngoài các chỉ số chuẩn (Hit@K, Recall@K, Precision@K, nDCG@K, MAP, MRR), tôi thêm hai chỉ số gắn với hành vi thật của chatbot. Usable@5 là tỷ lệ câu mà đoạn đúng vừa nằm trong 5 kết quả đầu vừa vượt ngưỡng liên quan, tức là chatbot thật sự nhận được nó. Reject@5 là tỷ lệ câu ngoài kho mà hệ thống không trả về đoạn nào vượt ngưỡng, tức là chatbot từ chối đúng.

Đánh giá cho thấy vấn đề chính nằm ở ngưỡng, không nằm ở khả năng tìm kiếm. Hit@5 đạt 0,943, nhưng Usable@5 chỉ 0,705. Lý do là ngưỡng tiếng Việt 0,82 loại bỏ 21 đoạn đúng (nhóm tài liệu Bộ Y tế có Usable bằng 0), còn ngưỡng tiếng Anh 0,50 lại cho câu ngoài kho lọt qua (Reject@5 chỉ 0,375). Tôi quét lưới các cặp ngưỡng và dùng kiểm định chéo 2-fold để tránh chọn ngưỡng trên chính bộ test. Hai fold cho vùng ngưỡng ổn định là VI 0,60–0,64 và EN 0,56–0,58. Cặp được chọn là VI = 0,64 và EN = 0,58.

Lỗi xếp hạng phổ biến nhất là câu hỏi về người lớn lại trả về mục dành cho người cao tuổi. Tôi sửa bằng cách trừ 0,04 điểm xếp hạng cho các đoạn thuộc mục dành riêng cho một nhóm (người cao tuổi, trẻ em, bà bầu, người khuyết tật) khi câu hỏi không nhắc đến nhóm đó.

| Chỉ số | Trước | Sau |
|---|---|---|
| Hit@1 | 0,670 | 0,739 |
| MRR | 0,785 | 0,834 |
| nDCG@5 | 0,624 | 0,641 |
| Usable@5 | 0,705 | 0,864 |
| Reject@5 | 0,375 | 1,000 |

Thí nghiệm ablation (`05_ablation.md`) cho thấy bỏ cơ chế điều chỉnh điểm theo ngôn ngữ làm nDCG@5 giảm từ 0,624 xuống 0,588. Lọc theo đối tượng và số ứng viên không ảnh hưởng với bộ câu hỏi này. Điểm yếu còn lại là câu hỏi không dấu (Hit@5 chỉ 0,29), và số câu ngoài kho còn ít (32 câu khi quét ngưỡng) nên Reject@5 còn dao động.

## 5. Khuyến nghị vận động từ dữ liệu Google Health so với chuẩn WHO

Khi tra tài liệu API chính thức, tôi phát hiện "phút vận động" của Google gồm ba mức LIGHT, MODERATE, VIGOROUS, và code cũ cộng cả ba. Trong khi đó WHO chỉ tính phút cường độ vừa và mạnh, với 1 phút mạnh tương đương 2 phút vừa. Hệ thống nay lưu riêng phút vừa và phút mạnh. Nếu không xác định được mức của một phút nào đó thì trường để trống, không ghi 0, để tránh báo nhầm "0 phút". Ví dụ trong demo: một người có 336 phút "active" theo Google thực ra chỉ đạt 114 phút theo cách tính của WHO.

Chuẩn WHO theo nhóm tuổi được đặt trong `whoGuidelines.config.js`, mọi con số đều đối chiếu với nguyên văn tài liệu:
- Người lớn: 150–300 phút/tuần quy đổi cường độ vừa, và tập tăng cơ ít nhất 2 ngày/tuần.
- Người từ 65 tuổi: như người lớn, thêm vận động đa thành phần (thăng bằng và sức mạnh) ít nhất 3 ngày/tuần.
- Trẻ 5–17 tuổi: trung bình 60 phút/ngày.

Phần tính toán là code thuần nên kiểm thử được độc lập, có 13 test đều đạt. Phần này quy định:
- Ngày nào có dữ liệu Google thì dùng Google; ngày không có mới dùng buổi tập trong app, tránh đếm hai lần.
- Dưới 4/7 ngày có dữ liệu thì không đưa ra kết luận.
- Thiếu bao nhiêu phút thì đề xuất số buổi và số phút tương ứng. Người mới tập chỉ tăng tối đa 60 phút/tuần.
- Người đang quá tải chỉ được khuyên hồi phục, không được khuyên tập thêm.
- Số bước chân chỉ để tham khảo, vì WHO không đặt chỉ tiêu số bước (tài liệu HHS ghi rõ "10,000 steps… is not a guideline").

Bài tập gợi ý được chọn từ database bằng bộ chấm điểm có sẵn, loại bỏ bài không phù hợp với chấn thương, thiết bị, trình độ của người dùng, hoặc có va chạm mạnh. Bài HIIT chỉ được gợi ý cho người đã quen tập và đang ở trạng thái tốt.

Mỗi chỉ tiêu được trích dẫn bằng RAG, lọc theo tài liệu WHO, HHS hoặc ACSM. Khi kiểm tra, tôi phát hiện mục khuyến nghị người lớn của WHO bị cắt thành hai đoạn, và đoạn đứng đầu kết quả tìm kiếm không chứa câu khuyến nghị chính. Với người lớn, đoạn đúng nằm ở hạng 2; với người cao tuổi, ở hạng 3. Cách sửa là mỗi chỉ tiêu khai báo cụm chữ bắt buộc và mục bắt buộc. Sau khi sửa, cả 12 nguồn trích dẫn đều đúng mục và chứa câu khuyến nghị chính.

Tính năng được đưa vào hai nơi: API `GET /api/google-health/who-comparison` và tool chat `get_activity_vs_who`. Câu trả lời của chatbot đi qua cùng bộ kiểm tra ở mục 2: số liệu của người dùng được dùng tự do, còn số chuẩn WHO bắt buộc có mã nguồn. Router được bổ sung 8 câu mẫu, nhờ đó 6/6 câu hỏi kiểu "tôi vận động đủ chưa" được phân đúng nhóm, và độ chính xác chung của router tăng từ 0,672 lên 0,693.

Cuối cùng, phần điều chỉnh kế hoạch tập (`adaptivePlan`) trước đây tính "phút/tuần theo WHO" bằng tổng phút Google cộng mọi buổi trong app, kể cả buổi tập tạ. Phần này nay dùng chung hàm tính với màn hình so sánh WHO, nên hai nơi luôn hiển thị cùng một con số. Script mô phỏng 8 kịch bản cho thấy chỉ 1 kịch bản đổi quyết định: người tập đều 3 buổi/tuần có 210 phút quy đổi, chưa vượt 300, nên được tăng cường độ thay vì giữ nguyên (`08_mo_phong_adaptive_plan.txt`).

## 6. Hạn chế và hướng phát triển

Tính năng so sánh WHO đã được kiểm thử ở phần tính toán, mô phỏng và nạp module, nhưng chưa chạy với tài khoản Google thật. Tên trường mức vận động trong response thật của Google cần được xác nhận bằng một lần đồng bộ ở chế độ debug. Khi không có thiết bị đo, Google chỉ cung cấp số bước và buổi tập tự nhập tay; số ngày tập tăng cơ và thăng bằng vì vậy chỉ lấy từ app. Hệ thống chưa phát hiện được câu bịa không chứa con số; muốn chặn loại này cần dùng thêm một LLM làm giám khảo. Câu hỏi không dấu vẫn truy xuất kém. Bộ câu hỏi đánh giá còn nhỏ, đặc biệt là câu ngoài kho. 13 tài liệu tiếng Việt cũ cần được tìm lại file gốc từ trang chính thức để nâng trạng thái.

## Phụ lục: chạy lại kết quả minh họa

Kết quả đã lưu trong `docs/bao-cao/ket-qua/`. Chạy lại bằng các lệnh sau, trong thư mục `ai-service` (dùng `venv/bin/python`) và `backend`:

```
ai-service$ venv/bin/python scripts/demo_grounding.py                 # 01 chống ảo giác
ai-service$ venv/bin/python -m unittest tests.test_grounding tests.test_evaluation -v   # 02
ai-service$ venv/bin/python scripts/check_sources.py                  # 03 kiểm tra nguyên văn tài liệu
ai-service$ venv/bin/python scripts/eval_retrieval.py --verbose       # 04 đánh giá truy xuất
ai-service$ venv/bin/python scripts/eval_ablation.py                  # 05 ablation + quét ngưỡng
ai-service$ venv/bin/python scripts/eval_router.py                    # 06 router
backend$    node scripts/test_activity_guideline.js                   # 07 test so sánh WHO
backend$    node scripts/simulate_adaptive_scenarios.js               # 08 mô phỏng adaptivePlan
backend$    node scripts/demo_who_comparison.js                       # 09 demo 3 hồ sơ
```
