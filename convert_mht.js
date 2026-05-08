const fs = require("fs");
const path = require("path");

const [, , inputPath = "xuexindangan.mht", outputPath = "xuexindangan.html"] =
  process.argv;

if (!fs.existsSync(inputPath)) {
  console.error(`找不到输入文件: ${inputPath}`);
  process.exit(1);
}

const rawContent = fs.readFileSync(inputPath, "utf8");

const boundaryMatch =
  rawContent.match(/boundary="([^"]+)"/i) ||
  rawContent.match(/boundary=([^;\r\n]+)/i);

if (!boundaryMatch) {
  console.error("未能识别MHT文件的boundary。");
  process.exit(1);
}

const boundary = boundaryMatch[1];
const boundaryToken = `--${boundary}`;

const parts = rawContent.split(boundaryToken);

function decodeQuotedPrintable(input) {
  const bytes = [];
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "=") {
      const next = input[i + 1];
      const nextNext = input[i + 2];
      // 软换行处理
      if (next === "\r" && nextNext === "\n") {
        i += 2;
        continue;
      }
      if (next === "\n") {
        i += 1;
        continue;
      }
      const hex = input.substr(i + 1, 2);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(input.charCodeAt(i));
  }
  return Buffer.from(bytes);
}

function extractHtmlPart() {
  for (const part of parts) {
    if (part.toLowerCase().includes("content-type: text/html")) {
      const headerEnd = part.indexOf("\r\n\r\n");
      const altHeaderEnd = part.indexOf("\n\n");
      const splitIndex =
        headerEnd !== -1
          ? headerEnd + 4
          : altHeaderEnd !== -1
          ? altHeaderEnd + 2
          : -1;

      if (splitIndex === -1) {
        continue;
      }

      const header = part.slice(0, splitIndex);
      const body = part.slice(splitIndex);

      const encodingMatch = header.match(
        /Content-Transfer-Encoding:\s*([^\s;]+)/i,
      );
      const charsetMatch = header.match(/charset="?([^\s";]+)/i);

      const encoding = encodingMatch
        ? encodingMatch[1].toLowerCase()
        : "7bit";
      const charset = charsetMatch
        ? charsetMatch[1].toLowerCase()
        : "utf-8";

      let buffer;
      if (encoding === "base64") {
        const cleaned = body.replace(/\s+/g, "");
        buffer = Buffer.from(cleaned, "base64");
      } else if (encoding === "quoted-printable") {
        buffer = decodeQuotedPrintable(body);
      } else {
        buffer = Buffer.from(body, "binary");
      }

      try {
        return buffer.toString(
          charset === "utf8" || charset === "utf-8" ? "utf8" : charset,
        );
      } catch (error) {
        console.warn(`按${charset}解码失败，回退为utf8。`, error.message);
        return buffer.toString("utf8");
      }
    }
  }
  return null;
}

const htmlContent = extractHtmlPart();

if (!htmlContent) {
  console.error("未找到HTML内容。");
  process.exit(1);
}

fs.writeFileSync(outputPath, htmlContent);

console.log(
  `已将 ${path.basename(inputPath)} 中的HTML内容导出到 ${path.basename(
    outputPath,
  )}`,
);

