const path = require("path");
const fs = require("fs/promises");
const { extract } = require("./pdf.extractor");

(async () => {
  try {
    const result = await extract(
      path.join(
        __dirname,
        "../../knowledge-base/nin/raw/pdf/doc1.pdf"
      )
    );

    const outputDir = path.join(__dirname, "output");
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, "doc1.json");

    await fs.writeFile(
      outputPath,
      JSON.stringify(result, null, 2),
      "utf8"
    );

    console.log("Saved:", outputPath);
  } catch (err) {
    console.error(err);
  }
})();