const fs = require("fs");
const path = require("path");

function loadModules(dirPath) {
  const absolutePath = path.resolve(dirPath);

  const files = fs.readdirSync(absolutePath);

  return files.reduce((acc, file) => {
    if (!file.endsWith(".js")) return acc;

    const filePath = path.join(absolutePath, file);
    const mod = require(filePath);

    return {
      ...acc,
      ...mod,
    };
  }, {});
}

module.exports = loadModules;