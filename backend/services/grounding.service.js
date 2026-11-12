/**
 * grounding.service.js — chống ảo giác cho câu trả lời có dùng RAG.
 *
 * Luồng trong một lượt chat:
 *   1. SourceRegistry đánh số mọi chunk RAG lấy được trong lượt: S1, S2... (trùng chunk -> giữ số cũ).
 *   2. Gemini nhận các chunk dưới dạng khối [Sx] + GROUNDED_RULES, phải trích [Sx] sau mỗi ý có số liệu.
 *   3. groundAnswer() gọi ai-service POST /rag/verify:
 *        - đạt  -> giữ nguyên
 *        - lỗi  -> gửi danh sách lỗi cho Gemini viết lại 1 lần -> kiểm tra lại
 *        - vẫn lỗi -> dùng `fixed_answer` (đã bỏ câu có số bịa / tự gắn [Sx]) + ghi chú đã lược bỏ
 *   4. Danh sách "Nguồn tham khảo" do CODE tạo từ các [Sx] thật sự xuất hiện, LLM không tự viết nguồn.
 *
 * ai-service không chạy -> không chặn câu trả lời, chỉ log và trả grounding.checked = false.
 */
const ragClient = require("./ragClient.service");

const REFERENCES_HEADER = "Nguồn tham khảo:";

const NO_INFO_REPLY =
  "Hiện kho tài liệu đã kiểm duyệt của NutriCare chưa có thông tin đủ tin cậy để trả lời câu hỏi này. " +
  "Bạn có thể hỏi cụ thể hơn, hoặc tham khảo ý kiến chuyên gia dinh dưỡng / bác sĩ.";

const STRIPPED_NOTE =
  "(Một số nội dung không có trong tài liệu đã kiểm duyệt đã được lược bỏ.)";

const GROUNDED_RULES = `
  QUY TẮC TRẢ LỜI TỪ TÀI LIỆU (khi đã gọi rag_retrieve):
  1. CHỈ dùng thông tin nằm trong các khối nguồn [S1], [S2]... do rag_retrieve trả về.
     KHÔNG dùng kiến thức riêng của bạn để bổ sung số liệu, khuyến nghị hay tên tổ chức.
  2. Mỗi câu có con số, mức khuyến nghị hoặc khẳng định y khoa PHẢI kết thúc bằng mã nguồn, VD:
     "Người lớn nên vận động 150–300 phút mỗi tuần ở cường độ vừa [S1]."
     Dùng nhiều nguồn thì ghi [S1, S2]. Chỉ dùng mã nguồn có thật trong lượt này.
  3. Chép đúng con số và đơn vị như trong nguồn. KHÔNG tự quy đổi (phút -> giờ, g -> kg),
     KHÔNG làm tròn, KHÔNG tự tính ra con số mới.
  4. Nguồn chỉ trả lời được một phần -> trả lời phần có trong nguồn, rồi nói rõ:
     "Tài liệu hiện có chưa đề cập đến ...". Không đoán phần còn lại.
  5. rag_retrieve không có kết quả -> trả lời: "Hiện kho tài liệu đã kiểm duyệt chưa có thông tin về ..."
     và KHÔNG đưa ra con số hay khuyến nghị nào.
  6. Nguồn nói về đối tượng khác (trẻ em, người cao tuổi, phụ nữ mang thai...) thì phải nêu rõ đối tượng,
     không áp cho user khi không khớp. Các nguồn khác nhau (VD WHO và Bộ Y tế) nói khác nhau thì nêu cả hai,
     ghi rõ nguồn nào nói gì.
  7. Nguồn tiếng Anh: dịch sang tiếng Việt nhưng giữ nguyên số liệu.
  8. KHÔNG chẩn đoán, KHÔNG kê thuốc/liều dùng. User có bệnh nền, đang mang thai, đau/chấn thương
     -> khuyên hỏi bác sĩ trước khi áp dụng.
  9. KHÔNG tự viết danh sách nguồn ở cuối câu trả lời (hệ thống tự thêm). Chỉ ghi mã [Sx] trong câu.
  10. Số liệu cá nhân của user (cân nặng, phút vận động, dữ liệu từ database tool) được dùng trực tiếp,
     không cần [Sx], nhưng không được trộn lẫn với số liệu khuyến nghị khi không có nguồn.
`;

// ─── SOURCE REGISTRY ──────────────────────────────────────────────────────────

class SourceRegistry {
  constructor() {
    this.sources = [];
    this.byKey = new Map();
    this.ragCalled = false;
  }

  /** Đăng ký một chunk RAG, trả mã nguồn "Sx" (chunk trùng -> mã cũ). */
  add(chunk) {
    const key = chunk.id || `${chunk.doc_id}:${String(chunk.text || "").slice(0, 80)}`;
    if (this.byKey.has(key)) return this.byKey.get(key).id;

    const source = {
      id: `S${this.sources.length + 1}`,
      text: chunk.text || "",
      title: chunk.title || "Tài liệu",
      org: chunk.org || null,
      year: chunk.year != null ? String(chunk.year) : null,
      url: chunk.url || null,
      section: chunk.section || chunk.heading || null,
      lang: chunk.lang || null,
      doc_id: chunk.doc_id || null,
    };
    this.sources.push(source);
    this.byKey.set(key, source);
    return source.id;
  }

  get(id) {
    return this.sources.find((s) => s.id === id) || null;
  }

  get size() {
    return this.sources.length;
  }
}

// ─── FORMAT ───────────────────────────────────────────────────────────────────

const sourceLabel = (s) =>
  [s.title, [s.org, s.year].filter(Boolean).join(", ")].filter(Boolean).join(" — ");

/** Khối nguồn đưa cho Gemini trong functionResponse của rag_retrieve. */
const formatSourceBlock = (s) =>
  `[${s.id}] ${sourceLabel(s)}${s.section ? `\nMục: ${s.section}` : ""}\n${s.text}`;

const CITATION_RE = /\[\s*(S\d+(?:\s*[,;]\s*S\d+)*)\s*\]/gi;

const citedIds = (text = "") => {
  const ids = new Set();
  for (const m of text.matchAll(CITATION_RE)) {
    m[1].split(/\s*[,;]\s*/).forEach((id) => ids.add(id.trim().toUpperCase()));
  }
  return [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
};

function buildCitations(text, registry) {
  return citedIds(text)
    .map((id) => registry.get(id))
    .filter(Boolean)
    .map(({ id, title, org, year, url, section, doc_id }) => ({
      id, title, org, year, url, section, doc_id,
    }));
}

function formatReferences(citations) {
  if (!citations.length) return "";
  const lines = citations.map((c) => {
    const label = sourceLabel(c);
    const section = c.section ? `. Mục: ${c.section}` : "";
    const url = c.url ? `. ${c.url}` : "";
    return `[${c.id}] ${label}${section}${url}`;
  });
  return `${REFERENCES_HEADER}\n${lines.join("\n")}`;
}

/**
 * Bỏ phần "Nguồn tham khảo" và mã [Sx] của các lượt trước khi đưa vào history:
 * mã nguồn được đánh lại từ S1 mỗi lượt, giữ lại sẽ làm Gemini trích nhầm nguồn cũ.
 */
function stripGroundingArtifacts(text = "") {
  const idx = text.indexOf(REFERENCES_HEADER);
  const body = idx >= 0 ? text.slice(0, idx) : text;
  return body.replace(CITATION_RE, "").replace(/[ \t]+([.,;:!?])/g, "$1").trim();
}

// ─── VERIFY + REPAIR ──────────────────────────────────────────────────────────

async function verifySafe(answer, registry, allowedContext) {
  try {
    return await ragClient.verify(answer, registry.sources, allowedContext);
  } catch (err) {
    console.warn("[Grounding] /rag/verify unavailable:", err.message);
    return null;
  }
}

function buildRetryPrompt(report, registry) {
  const issues = report.errors
    .slice(0, 8)
    .map((e) => `- "${e.sentence}": ${e.detail}`)
    .join("\n");
  const ids = registry.sources.map((s) => s.id).join(", ") || "(không có)";

  return (
    "[KIỂM TRA NGUỒN] Câu trả lời vừa rồi có nội dung KHÔNG khớp tài liệu:\n" +
    `${issues}\n\n` +
    `Hãy viết lại TOÀN BỘ câu trả lời, chỉ dùng các nguồn ${ids} đã có. ` +
    "Bỏ mọi con số/ý không có trong nguồn, chép đúng số liệu, mỗi câu có số liệu kết thúc bằng [Sx]. " +
    "Không gọi thêm tool. Không viết danh sách nguồn ở cuối."
  );
}

const firstText = (result) =>
  result?.response?.candidates?.[0]?.content?.parts?.find((p) => p.text?.trim())?.text?.trim() || null;

/** Còn nội dung thật sau khi lược bỏ? (không chỉ là lời chào / câu nối) */
const hasSubstance = (text = "") => text.replace(/[#*_\-\s]/g, "").length >= 40;

/**
 * @param {Object}   p
 * @param {Object}   p.chat            phiên chat Gemini (để yêu cầu viết lại)
 * @param {string}   p.text            câu trả lời của Gemini
 * @param {SourceRegistry} p.registry
 * @param {string[]} p.allowedContext  văn bản được phép chứa số mà không cần nguồn
 * @returns {Promise<{text: string, citations: Array, grounding: Object}>}
 */
async function groundAnswer({ chat, text, registry, allowedContext = [] }) {
  let report = await verifySafe(text, registry, allowedContext);

  if (!report) {
    // Không kiểm tra được: vẫn gắn nguồn cho các [Sx] hợp lệ
    const citations = buildCitations(text, registry);
    return {
      text: [text, formatReferences(citations)].filter(Boolean).join("\n\n"),
      citations,
      grounding: { checked: false, action: "unchecked" },
    };
  }

  const firstReport = report;
  let action = "passed";

  if (!report.passed && chat) {
    try {
      const retryText = firstText(await chat.sendMessage(buildRetryPrompt(report, registry)));
      const retryReport = retryText && (await verifySafe(retryText, registry, allowedContext));
      if (retryReport) {
        text = retryText;
        report = retryReport;
        action = "regenerated";
      }
    } catch (err) {
      console.warn("[Grounding] Regenerate failed:", err.message);
    }
  }

  if (!report.passed) {
    action = "stripped";
    const fixed = report.fixed_answer || "";
    text = hasSubstance(fixed) ? `${fixed}\n\n${STRIPPED_NOTE}` : NO_INFO_REPLY;
    if (!hasSubstance(fixed)) action = "refused";
  }

  const citations = buildCitations(text, registry);
  console.log("[Grounding]", {
    action,
    sources: registry.size,
    firstPassed: firstReport.passed,
    errors: firstReport.errors.length,
    supportRatio: report.support_ratio,
    cited: citations.map((c) => c.id),
  });

  return {
    text: [text, formatReferences(citations)].filter(Boolean).join("\n\n"),
    citations,
    grounding: {
      checked: true,
      action, // passed | regenerated | stripped | refused
      passed: report.passed,
      supportRatio: report.support_ratio,
      claims: report.claims,
      // lỗi của bản nháp đầu tiên: dùng để đánh giá mức độ "bịa" của LLM
      initialErrors: firstReport.errors.map(({ type, detail, sentence }) => ({ type, detail, sentence })),
      warnings: report.warnings.length,
      semanticChecked: report.semantic_checked,
    },
  };
}

module.exports = {
  GROUNDED_RULES,
  NO_INFO_REPLY,
  REFERENCES_HEADER,
  SourceRegistry,
  formatSourceBlock,
  formatReferences,
  buildCitations,
  stripGroundingArtifacts,
  groundAnswer,
};
