import fs from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error("Usage: node pdfjs-to-md.mjs input.pdf output.md");
  process.exit(2);
}

const isAdolescent = path.basename(input).toLowerCase().includes("adolescent");
const cfg = isAdolescent ? {
  id: "who_guideline_obesity_adolescents_2026",
  title: "WHO guideline on the integrated management of obesity in adolescents",
  audience: "adolescent",
  url: "https://www.who.int/publications/i/item/9789240123878",
  tableStart: 96,
  tableEnd: 141,
  keep: [...Array.from({ length: 11 }, (_, i) => i + 15), ...Array.from({ length: 51 }, (_, i) => i + 27), ...Array.from({ length: 59 }, (_, i) => i + 91)],
} : {
  id: "who_guideline_obesity_children_2026",
  title: "WHO guideline on the integrated management of obesity in children",
  audience: "infant",
  url: "https://www.who.int/publications/i/item/9789240123397",
  tableStart: 93,
  tableEnd: 124,
  keep: [...Array.from({ length: 11 }, (_, i) => i + 15), ...Array.from({ length: 46 }, (_, i) => i + 27), ...Array.from({ length: 46 }, (_, i) => i + 87)],
};
const pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(input)) }).promise;
const keep = [];
keep.push(...cfg.keep);

const recurring = [
  "WHO guideline on the integrated management of obesity in children",
  "Annex 1", "Annex1.", "Annex 2", "Annex 3",
];

function clean(s) {
  return s.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function pageLines(items) {
  const lines = new Map();
  for (const item of items) {
    const text = clean(item.str || "");
    if (!text) continue;
    const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2;
    const x = item.transform?.[4] ?? 0;
    if (!lines.has(y)) lines.set(y, []);
    lines.get(y).push({ x, text });
  }
  return [...lines.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, xs]) => xs.sort((a, b) => a.x - b.x).map(x => x.text).join(" "))
    .map(clean)
    .filter(Boolean);
}

function isPageNumber(line) {
  return /^(?:[ivxlcdm]+|\d{1,3})$/i.test(line);
}

function isHeading(line) {
  return /^(Executive summary|Background|Recommendations|Scope and purpose, objectives, and target audience|Guideline development methodology|Dissemination, implementation, monitoring, evaluation, and ethical considerations|Annex ?[123]\.?|Summary of findings|Evidence-to-decision considerations|Question \d+\.)$/i.test(line)
    || /^Recommendation$/i.test(line)
    || /^Justification$/i.test(line)
    || /^Remarks$/i.test(line)
    || /^Research gaps$/i.test(line)
    || /^Plans for updating$/i.test(line)
    || /^Summary of judgements$/i.test(line)
    || /^Question \d+\./i.test(line);
}

function normalizePage(lines, page) {
  const out = [];
  let tableMode = false;
  const tablePage = page >= cfg.tableStart && page <= cfg.tableEnd; // Annex 2: GRADE evidence tables
  for (let line of lines) {
    if (recurring.includes(line) || isPageNumber(line)
      || new RegExp(`^\\d{1,3}\\s+${cfg.title}$`, "i").test(line)
      || new RegExp(`^[ivxlcdm]+\\s+${cfg.title}$`, "i").test(line)
      || /^(?:Executive summary|Background|Recommendations|Annex 1|Annex 2|Annex 3)\s+[ivxlcdm]+$/i.test(line)) continue;
    if (/^Footnotes?:?$/i.test(line)) tableMode = false;
    if (tablePage && /^(Summary of findings table|Summary of findings:|Outcomes|Patient or population|Setting:|Intervention:|Comparison:|Treatment components)/i.test(line)) {
      if (!tableMode) out.push("| Table content |", "|---|");
      tableMode = true;
    }
    line = line.replace(/\s*\(\s*/g, " (").replace(/\s*\)\s*/g, ") ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (tableMode && tablePage && !/^Footnotes?:?$/i.test(line)) {
      out.push(`| ${line.replace(/\|/g, "\\|")} |`);
      continue;
    }
    if (isHeading(line)) out.push(`## ${line}`);
    else if (/^[•▪◦]/.test(line)) out.push(`- ${line.replace(/^[•▪◦]\s*/, "")}`);
    else out.push(line);
  }
  return out;
}

let md = `---\nid: ${cfg.id}\ntitle: "${cfg.title}"\norg: "World Health Organization"\nyear: "2026"\nurl: "${cfg.url}"\nlang: en\naudience_group: ${cfg.audience}\nchunk_profile: compact\n---\n\n# ${cfg.title}\n\n> Bản Markdown này được chuyển từ PDF để phục vụ chunking/RAG. Đã bỏ phần bản quyền, mục lục, lời cảm ơn, viết tắt, tài liệu tham khảo và danh sách nhân sự/phản biện. Các bảng bằng chứng trong Annex 2 được giữ ở dạng dòng theo thứ tự đọc; cần kiểm tra lại bằng MinerU nếu cần cấu trúc hàng/cột tuyệt đối.\n\n`;

for (const page of keep) {
  const docPage = await pdf.getPage(page);
  const lines = normalizePage(pageLines((await docPage.getTextContent()).items), page);
  if (!lines.length) continue;
  md += `\n<!-- PDF page ${page} -->\n\n` + lines.join("\n") + "\n";
}

// PDF.js returns wrapped visual lines. Merge ordinary lines back into paragraphs,
// while preserving headings, lists, table markers and page boundaries.
const titleMarker = `\n# ${cfg.title}`;
const frontMatter = md.slice(0, md.indexOf(titleMarker));
const bodyMarkdown = md.slice(md.indexOf(titleMarker));
const rawLines = bodyMarkdown.split("\n");
const compact = [];
let paragraph = [];
const flush = () => {
  if (paragraph.length) compact.push(paragraph.join(" ").replace(/\s+([,.;:!?])/g, "$1"));
  paragraph = [];
};
for (const line of rawLines) {
  const t = line.trim();
  if (!t) { flush(); continue; }
  if (/^(#|[-*] |\[BẢNG\]|<!--|> |---$|\|)/.test(t)) { flush(); compact.push(t); }
  else paragraph.push(t);
}
flush();
md = frontMatter.trimEnd() + "\n\n" + compact.join("\n\n")
  .replace(/\bO besity\b/g, "Obesity")
  .replace(/^besity\b/gm, "Obesity")
  .replace(/educational O attainment/g, "educational attainment")
  .replace(new RegExp(`\\s+(?:[ivxlcdm]+|\\d{1,3})\\s+${cfg.title}`, "gi"), "")
  .replace(/\s+([,.;:!?])/g, "$1")
  .replace(/\n{3,}/g, "\n\n")
  .trim() + "\n";
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, md);
console.log(`Wrote ${output} (${md.length} chars)`);
