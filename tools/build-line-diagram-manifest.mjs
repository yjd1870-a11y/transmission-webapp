import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [directory, manifestKey, sourceFile, linebookSheetName = ""] = process.argv.slice(2);

if (!directory || !manifestKey || !sourceFile) {
  console.error("Usage: node tools/build-line-diagram-manifest.mjs <dir> <manifestKey> <sourceFile> [linebookSheetName]");
  process.exit(1);
}

const rows = JSON.parse(readFileSync(join(directory, "index.json"), "utf8"));
const manifest = {
  version: 1,
  sourceFile,
  linebookSheetName,
  sheets: rows.map((row) => ({
    sheetName: row.sheetName || "",
    file: row.fileName || row.file || "",
    width: Number(row.widthPixels || row.width) || 0,
    height: Number(row.heightPixels || row.height) || 0,
    imageFormat: row.imageFormat || "pdf",
    searchTargets: Array.isArray(row.searchTargets) ? row.searchTargets : [],
  })),
};

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(join(directory, "manifest.json"), manifestJson, "utf8");
writeFileSync(
  join(directory, "manifest-data.js"),
  [
    "window.__LINE_DIAGRAM_MANIFESTS__ = window.__LINE_DIAGRAM_MANIFESTS__ || {};",
    `window.__LINE_DIAGRAM_MANIFESTS__.${manifestKey} = ${manifestJson.trimEnd()};`,
    "",
  ].join("\n"),
  "utf8",
);

const targetCount = manifest.sheets.reduce((total, sheet) => total + sheet.searchTargets.length, 0);
console.log(`manifest=${manifestKey} sheets=${manifest.sheets.length} targets=${targetCount}`);
