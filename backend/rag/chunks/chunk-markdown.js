const fs = require("fs/promises");
const path = require("path");

const INPUT_FILE = path.join(
  __dirname,
  "../extractors/pdf/output/quyet_dinh_hd_an_bo_sung.md"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "quyet_dinh_hd_an_bo_sung.chunks.json"
);

// =========================
// Chunk configuration
// =========================

const MAX_CHARS = 1500;

// =========================
// Utilities
// =========================

function cleanText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function getHeadingLevel(text) {
  const match = text.match(/^(#{1,6})\s+/);

  return match ? match[1].length : null;
}


function getHeadingText(text) {
  return text
    .replace(/^#{1,6}\s+/, "")
    .trim();
}


// =========================
// Markdown parser
// =========================

function parseMarkdown(markdown) {
  const lines = markdown.split("\n");

  const blocks = [];

  let currentParagraph = [];

  let currentPage = null;

  function flushParagraph() {
    if (currentParagraph.length === 0) {
      return;
    }

    const content = cleanText(
      currentParagraph.join("\n")
    );

    if (content) {
      blocks.push({
        type: "paragraph",
        content,
        page: currentPage,
      });
    }

    currentParagraph = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ---------------------------------
    // PDF page marker
    // ---------------------------------

    const pageMatch = line.match(
      /^\s*<!--\s*PDF page\s+(\d+)\s*-->\s*$/
    );

    if (pageMatch) {
      flushParagraph();

      currentPage = Number(pageMatch[1]);

      continue;
    }

    // ---------------------------------
    // Empty line
    // ---------------------------------

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    // ---------------------------------
    // YAML frontmatter
    // ---------------------------------

    if (
      i === 0 &&
      line.trim() === "---"
    ) {
      flushParagraph();

      i++;

      while (
        i < lines.length &&
        lines[i].trim() !== "---"
      ) {
        i++;
      }

      continue;
    }

    // ---------------------------------
    // Heading
    // ---------------------------------

    if (/^#{1,6}\s+/.test(line)) {
      flushParagraph();

      blocks.push({
        type: "heading",
        content: line.trim(),
        page: currentPage,
      });

      continue;
    }

    // ---------------------------------
    // Markdown table
    // ---------------------------------

    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      isMarkdownTableSeparator(lines[i + 1])
    ) {
      flushParagraph();

      const tableLines = [];

      tableLines.push(line.trim());

      i++;

      tableLines.push(lines[i].trim());

      i++;

      while (
        i < lines.length &&
        lines[i].trim().startsWith("|")
      ) {
        tableLines.push(lines[i].trim());
        i++;
      }

      i--;

      blocks.push({
        type: "table",
        content: tableLines.join("\n"),
        page: currentPage,
      });

      continue;
    }

    // ---------------------------------
    // List
    // ---------------------------------

    if (
      /^\s*([-*+]|\d+\.)\s+/.test(line)
    ) {
      flushParagraph();

      blocks.push({
        type: "list",
        content: line.trim(),
        page: currentPage,
      });

      continue;
    }

    // ---------------------------------
    // Normal paragraph
    // ---------------------------------

    currentParagraph.push(line.trim());
  }

  flushParagraph();

  return blocks;
}


// =========================
// Detect markdown table
// =========================

function isMarkdownTableSeparator(line) {
  const trimmed = line.trim();

  if (!trimmed.startsWith("|")) {
    return false;
  }

  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

  if (cells.length === 0) {
    return false;
  }

  return cells.every((cell) =>
    /^:?-{3,}:?$/.test(cell)
  );
}


// =========================
// Heading context
// =========================

function updateHeadingStack(
  headingStack,
  heading
) {
  const level = getHeadingLevel(
    heading.content
  );

  const text = getHeadingText(
    heading.content
  );

  // Remove headings at same/deeper level
  while (
    headingStack.length > 0 &&
    headingStack[
      headingStack.length - 1
    ].level >= level
  ) {
    headingStack.pop();
  }

  headingStack.push({
    level,
    text,
  });
}


function getSectionContext(headingStack) {
  if (!headingStack.length) {
    return null;
  }

  return headingStack
    .map((item) => item.text)
    .join(" > ");
}


function getHeadingMarkdown(headingStack) {
  return headingStack
    .map(
      (item) =>
        `${"#".repeat(item.level)} ${item.text}`
    )
    .join("\n");
}


// =========================
// Text chunking
// =========================

function splitLongParagraph(
  text,
  maxChars
) {
  if (text.length <= maxChars) {
    return [text];
  }

  const parts = [];

  let remaining = text;

  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf(
      " ",
      maxChars
    );

    // Avoid extremely small chunks
    if (cut < maxChars * 0.5) {
      cut = maxChars;
    }

    parts.push(
      remaining.slice(0, cut).trim()
    );

    remaining = remaining
      .slice(cut)
      .trim();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
}


function createTextChunks(
  units,
  headingStack,
  pageStart,
  pageEnd
) {
  const results = [];

  const headingContext =
    getHeadingMarkdown(headingStack);

  let currentUnits = [];

  function buildContent(unitsToUse) {
    const body = unitsToUse
      .map((unit) => unit.content)
      .join("\n\n");

    if (!body) {
      return headingContext;
    }

    return headingContext
      ? `${headingContext}\n\n${body}`
      : body;
  }

  function flush() {
    if (!currentUnits.length) {
      return;
    }

    results.push({
      content: buildContent(currentUnits),

      content_type: "text",
section:
    getSectionContext(headingStack),


      page_start:
        currentUnits[0].page,

      page_end:
        currentUnits[
          currentUnits.length - 1
        ].page,
    });
  }

  for (const unit of units) {
    const candidate = [
      ...currentUnits,
      unit,
    ];

    const candidateContent =
      buildContent(candidate);

    // Vẫn còn chỗ → thêm block
    if (
      candidateContent.length <= MAX_CHARS
    ) {
      currentUnits.push(unit);
      continue;
    }

    // Chunk hiện tại đầy
    flush();

    // --------------------------------
    // Overlap:
    // chỉ giữ block cuối cùng
    // --------------------------------

    const lastUnit =
      currentUnits.length > 0
        ? currentUnits[
            currentUnits.length - 1
          ]
        : null;

    currentUnits = [];

    if (lastUnit) {
      const overlapContent =
        buildContent([lastUnit]);

      // Chỉ overlap nếu bản thân block
      // không quá lớn
      if (
        overlapContent.length <
        MAX_CHARS * 0.5
      ) {
        currentUnits.push(lastUnit);
      }
    }

    // Thêm block hiện tại
    currentUnits.push(unit);

    // --------------------------------
    // Một paragraph quá dài
    // --------------------------------

    const currentContent =
      buildContent(currentUnits);

    if (
      currentContent.length > MAX_CHARS &&
      currentUnits.length === 1
    ) {
      const availableChars =
        MAX_CHARS -
        headingContext.length -
        2;

      const parts =
        splitLongParagraph(
          unit.content,
          availableChars
        );

      currentUnits = [];

      for (const part of parts) {
        results.push({
          content: headingContext
            ? `${headingContext}\n\n${part}`
            : part,

          content_type: "text",

          page_start: unit.page,
          page_end: unit.page,
        });
      }
    }

    pageStart = unit.page;
    pageEnd = unit.page;
  }

  flush();

  return results;
}


// =========================
// Table processing
// =========================

function parseTableRows(tableContent) {
  return tableContent
    .split("\n")
    .filter(Boolean);
}


function createTableChunks(
  tableBlock,
  headingStack,
  tableNumber
) {
  const rows =
    parseTableRows(tableBlock.content);

  if (rows.length < 2) {
    return [];
  }

  const header = rows[0];
  const separator = rows[1];

  const dataRows = rows.slice(2);

  const headingContext =
    getHeadingMarkdown(headingStack);

  const tableTitle =
    tableNumber
      ? `Bảng ${tableNumber}`
      : "Bảng";

  const results = [];

  let currentRows = [];

  function buildContent(rowsToUse) {
    const parts = [];

    if (headingContext) {
      parts.push(headingContext);
    }

    parts.push(tableTitle);

    parts.push(
      [
        header,
        separator,
        ...rowsToUse,
      ].join("\n")
    );

    return parts.join("\n\n");
  }

  for (const row of dataRows) {
    const candidateRows = [
      ...currentRows,
      row,
    ];

    const candidateContent =
      buildContent(candidateRows);

    if (
      candidateContent.length <= MAX_CHARS
    ) {
      currentRows.push(row);

      continue;
    }

    // ---------------------------------
    // Save current table chunk
    // ---------------------------------

    if (currentRows.length > 0) {
      results.push({
        content:
          buildContent(currentRows),

        content_type: "table",

        table_id: `table_${tableNumber}`,

        page_start: tableBlock.page,
        page_end: tableBlock.page,
      });
    }

    // ---------------------------------
    // Table overlap:
    // repeat the last row if possible
    // ---------------------------------

    currentRows = [row];
  }

  if (currentRows.length > 0) {
    results.push({
      content:
        buildContent(currentRows),

      content_type: "table",

      table_id: `table_${tableNumber}`,
section:
    getSectionContext(headingStack),


      page_start: tableBlock.page,
      page_end: tableBlock.page,
    });
  }

  return results;
}


// =========================
// Main chunking pipeline
// =========================

function chunkMarkdown(markdown) {
  const blocks =
    parseMarkdown(markdown);

  const chunks = [];

  const headingStack = [];

  let textUnits = [];

  let textPageStart = null;
  let textPageEnd = null;

  let tableCounter = 0;

  function flushText() {
    if (!textUnits.length) {
      return;
    }

    const results =
      createTextChunks(
        textUnits,
        headingStack,
        textPageStart,
        textPageEnd
      );

    chunks.push(...results);

    textUnits = [];
    textPageStart = null;
    textPageEnd = null;
  }

  for (const block of blocks) {
    // ---------------------------------
    // Heading
    // ---------------------------------

    if (block.type === "heading") {
      flushText();

      updateHeadingStack(
        headingStack,
        block
      );

      continue;
    }

    // ---------------------------------
    // Table
    // ---------------------------------

    if (block.type === "table") {
      flushText();

      tableCounter++;

      const tableChunks =
        createTableChunks(
          block,
          headingStack,
          tableCounter
        );

      chunks.push(...tableChunks);

      continue;
    }

    // ---------------------------------
    // Text / list
    // ---------------------------------

    if (
      block.type === "paragraph" ||
      block.type === "list"
    ) {
      if (textPageStart === null) {
        textPageStart = block.page;
      }

      textPageEnd = block.page;

      textUnits.push({
        content: block.content,
        type: block.type,
        page: block.page,
      });
    }
  }

  flushText();

  return chunks;
}


// =========================
// Add metadata
// =========================

function addMetadata(
  chunks,
  documentId
) {
  return chunks.map(
    (chunk, index) => ({
      chunk_id:
        `${documentId}_${String(
          index + 1
        ).padStart(4, "0")}`,

      content: chunk.content,

      metadata: {
        document_id: documentId,

        source: "nin",

        document_type: "pdf",

        content_type:
          chunk.content_type,

        ...(chunk.table_id && {
          table_id: chunk.table_id,
        }),

        section: chunk.section ?? null,

        page_start:
          chunk.page_start ?? null,

        page_end:
          chunk.page_end ?? null,

        chunk_index: index,

        chunk_size:
          chunk.content.length,

        max_chunk_size:
          MAX_CHARS,
      },
    })
  );
}



// =========================
// Main
// =========================

async function main() {
  console.log(
    `Reading: ${INPUT_FILE}`
  );

  const markdown =
    await fs.readFile(
      INPUT_FILE,
      "utf8"
    );

  const documentId =
    path.basename(
      INPUT_FILE,
      ".md"
    );

  const rawChunks =
    chunkMarkdown(markdown);

  const chunks =
    addMetadata(
      rawChunks,
      documentId
    );

  await fs.writeFile(
    OUTPUT_FILE,
    JSON.stringify(
      chunks,
      null,
      2
    ),
    "utf8"
  );

  // =========================
  // Statistics
  // =========================

  const textChunks =
    chunks.filter(
      (c) =>
        c.metadata.content_type ===
        "text"
    );

  const tableChunks =
    chunks.filter(
      (c) =>
        c.metadata.content_type ===
        "table"
    );

  console.log("\nChunking completed.");

  console.log(
    `Total chunks: ${chunks.length}`
  );

  console.log(
    `Text chunks: ${textChunks.length}`
  );

  console.log(
    `Table chunks: ${tableChunks.length}`
  );

  console.log(
    `MAX_CHARS: ${MAX_CHARS}`
  );


  console.log(
    `Output: ${OUTPUT_FILE}`
  );
}


main().catch((error) => {
  console.error(
    "Chunking failed:",
    error
  );

  process.exit(1);
});