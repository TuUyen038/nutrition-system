const fs = require("fs/promises");
const path = require("path");

async function loadPyMuPDFOutput(filePath) {
  const fileName = path.basename(filePath, ".pdf") + ".json";
  const jsonPath = path.join(
    "/Users/tuantq/UyenTTT/khuyennghidinhduong/search-service/output",
    fileName,
  );
  return JSON.parse(await fs.readFile(jsonPath, "utf8"));
}

async function extract(filePath, source = "nin") {
  const pages = await loadPyMuPDFOutput(filePath);
  const bodySize = computeBodyFontSize(pages);

  const pageContents = [];
  const allTables = [];

  for (const page of pages) {
    allTables.push(...(page.tables ?? []));
    pageContents.push({
      page: page.page,
      paragraphs: linesToParagraphs(page.lines, bodySize),
    });
  }

  const sections = buildSections(pageContents);
  const rawText = sectionsToRawText(sections);

  return {
    id: path.basename(filePath, ".pdf"),
    title: path.basename(filePath, ".pdf"),
    source,
    documentType: "pdf",
    originalFile: filePath,
    rawText,
    metadata: {
      pageCount: pages.length,
      extractedAt: new Date().toISOString(),
      extractor: "PyMuPDF",
    },
    sections,
    tables: allTables,
  };
}

/**
 * Size xuất hiện nhiều nhất (weighted theo số ký tự) trong toàn tài liệu
 * -> coi là size thân bài. Span nào bold hoặc to hơn rõ rệt là ứng viên heading.
 */
function computeBodyFontSize(pages) {
  const freq = new Map();
  for (const page of pages) {
    for (const line of page.lines ?? []) {
      for (const span of line.spans ?? []) {
        const size = Math.round(span.size * 10) / 10;
        freq.set(size, (freq.get(size) ?? 0) + (span.text?.length ?? 0));
      }
    }
  }
  let bodySize = 12;
  let max = -1;
  for (const [size, count] of freq) {
    if (count > max) {
      max = count;
      bodySize = size;
    }
  }
  return bodySize;
}

function isBoldSpan(span) {
  return Boolean(span.flags & 16) || /bold/i.test(span.font ?? "");
}

function boldRatio(line) {
  let boldChars = 0, totalChars = 0;
  for (const s of line.spans ?? []) {
    const len = (s.text ?? "").trim().length;
    if (!len) continue;
    totalChars += len;
    if (isBoldSpan(s)) boldChars += len;
  }
  return totalChars ? boldChars / totalChars : 0;
}
function isBold(span) {
  // flags PyMuPDF: bit 4 (giá trị 16) = bold. 20/22 = bold, 4/6 = không bold
  return (span.flags & 16) !== 0;
}

function lineIsHeadingLike(line, bodySize) {
  if (!line.spans?.length) return false;

  const firstSpan = line.spans[0];
  const sizeBoost = line.spans.some((s) => s.size > bodySize + 1);

  // Heading thật sự luôn mở đầu bằng span bold có nội dung (số thứ tự + đầu đề)
  // Không quan tâm các span sau (chú thích trong ngoặc thường italic, không bold)
  if (isBold(firstSpan) && firstSpan.text.trim().length >= 2) return true;

  const ratio = boldRatio(line);
  return ratio >= 0.7 || sizeBoost;
}

function linesToParagraphs(lines, bodySize) {
  if (!lines?.length) return [];

  const paragraphs = [];
  let current = null;
  let prevY = null;

  for (const line of lines) {
    const text = line.text?.trim();
    if (!text) continue;

    const y = line.bbox[1];
    const headingLike = lineIsHeadingLike(line, bodySize);

    if (prevY !== null && y - prevY > 20) {
      if (current) paragraphs.push(finalizeParagraph(current));
      current = null;
    }

    if (!current) current = { text: "", headingLike };

    current.text += (current.text ? " " : "") + text;
    prevY = y;
  }

  if (current) paragraphs.push(finalizeParagraph(current));
  return paragraphs;
}

function finalizeParagraph(p) {
  return { text: normalizeText(p.text), headingLike: p.headingLike };
}

function normalizeText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSections(pageContents) {
  const sections = [];
  let order = 1;
  let current = null;
  const headingStack = []; // [{level, text}] để track breadcrumb

  for (const { page, paragraphs } of pageContents) {
    for (const p of paragraphs) {
      const canOpenHeading = p.headingLike;
      const heading = canOpenHeading ? splitHeading(p.text) : null;

      if (heading) {
        const level = headingLevel(heading.heading); // 1, 2, 3 dựa trên số dấu chấm
        // pop stack về đúng cấp cha
        while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
          headingStack.pop();
        }

        if (current && current.text.trim()) {
          // có nội dung thật -> chốt section cũ, lưu breadcrumb tại thời điểm đó
          sections.push(current);
          order++;
        }
        // luôn push heading mới vào stack (dù section cũ có text hay không)
        headingStack.push({ level, text: heading.heading });

        current = {
          order,
          pageStart: page,
          pageEnd: page,
          heading: heading.heading,
          breadcrumb: headingStack.slice(0, -1).map(h => h.text).join(" > "),
          text: "",
        };
      } else {
        if (!current) {
          current = { order, pageStart: page, pageEnd: page, heading: null, breadcrumb: "", text: "" };
        }
        current.text += (current.text ? "\n\n" : "") + p.text;
      }
      if (current) current.pageEnd = page;
    }
  }
  if (current && current.text.trim()) sections.push(current);

  return sections.filter(s => s.text.trim().length > 0); // bỏ section rỗng, breadcrumb đã giữ ngữ cảnh cha
}

function headingLevel(heading) {
  const m = heading.match(/^\d+(\.\d+)*/);
  return m ? m[0].split(".").filter(Boolean).length : 1; // "1.1.1" -> level 3
}

function looksUnfinished(text) {
  return Boolean(text) && !/[.:;)]\s*$/.test(text.trim());
}

function splitHeading(paragraph) {
  const trimmed = paragraph.trim();
  let match;

  match = trimmed.match(/^Điều\s+\d+.*/i);
  if (match) return { heading: match[0], text: "" };

  match = trimmed.match(/^Chương\s+[IVXLCDM\d]+.*/i);
  if (match) return { heading: match[0], text: "" };

  match = trimmed.match(/^Mục\s+\d+.*/i);
  if (match) return { heading: match[0], text: "" };

  match = trimmed.match(/^Khoản\s+\d+.*/i);
  if (match) return { heading: match[0], text: "" };

  match = trimmed.match(/^Thứ\s+(nhất|hai|ba|tư|năm|sáu|bảy).*/i);
  if (match) return { heading: match[0], text: "" };

  // số La Mã: I. II. III. IV.
  match = trimmed.match(/^[IVXLCDM]{1,6}\.\s*.+/);
  if (match) return { heading: match[0], text: "" };

  // số thường: 1.1.2. hoặc 1.1.1.Khái niệm (không cần khoảng trắng sau dấu chấm)
  match = trimmed.match(/^\d+(\.\d+)*[\.\)]?\s*.+/);
  if (match) return { heading: match[0], text: "" };

  
  return null;
}

function sectionsToRawText(sections) {
  return sections
    .map((s) => (s.heading ? s.heading + "\n" : "") + s.text)
    .join("\n\n")
    .trim();
}

module.exports = { extract };