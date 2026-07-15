import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";
const lineDiagramCacheVersion = "excel-picture-v5-visible-bounds";
const lineDiagramCacheDir = join(root, ".cache", "line-diagram-images");
const lineDiagramJobs = new Map();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

function collectRequestBody(request, limitBytes = 80 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error("Uploaded file is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function runPowerShell(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-Sta",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      ...args,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `PowerShell exited with ${code}`));
    });
  });
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return { width: 0, height: 0 };
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function renderLineDiagramImages(body) {
  const tempDir = await mkdtemp(join(tmpdir(), "catv-line-diagram-"));
  try {
    const inputPath = join(tempDir, "workbook.xlsx");
    const outputDir = join(tempDir, "images");
    await writeFile(inputPath, body);

    const scriptPath = join(root, "tools", "export-line-diagram-images.ps1");
    const output = await runPowerShell(scriptPath, ["-InputPath", inputPath, "-OutputDir", outputDir]);
    const parsed = JSON.parse(output || "[]");
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const sheets = [];
    for (const row of rows) {
      if (!row?.fileName) continue;
      const image = await readFile(join(outputDir, row.fileName));
      const { width, height } = pngSize(image);
      sheets.push({
        sheetName: row.sheetName || "",
        width,
        height,
        content: image.toString("base64"),
        searchTargets: Array.isArray(row.searchTargets) ? row.searchTargets : [],
      });
    }

    return { sheets };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleLineDiagramImages(request, response) {
  const startedAt = Date.now();
  try {
    const body = await collectRequestBody(request);
    const cacheKey = createHash("sha256")
      .update(lineDiagramCacheVersion)
      .update(body)
      .digest("hex");
    await mkdir(lineDiagramCacheDir, { recursive: true });
    const cachePath = join(lineDiagramCacheDir, `${cacheKey}.json`);

    const cached = await readFile(cachePath, "utf8").catch(() => "");
    if (cached) {
      console.log(`[line-diagram] cache hit ${cacheKey.slice(0, 12)} in ${Date.now() - startedAt}ms`);
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "x-line-diagram-cache": "HIT",
      });
      response.end(cached);
      return;
    }

    let job = lineDiagramJobs.get(cacheKey);
    const joinedExistingJob = Boolean(job);
    if (!job) {
      job = renderLineDiagramImages(body)
        .then(async (payload) => {
          const serialized = JSON.stringify(payload);
          await writeFile(cachePath, serialized, "utf8").catch((error) => {
            console.warn("Line diagram cache write failed:", error);
          });
          return serialized;
        })
        .finally(() => lineDiagramJobs.delete(cacheKey));
      lineDiagramJobs.set(cacheKey, job);
    }

    const serialized = await job;
    console.log(`[line-diagram] ${joinedExistingJob ? "joined" : "rendered"} ${cacheKey.slice(0, 12)} in ${Date.now() - startedAt}ms`);
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "x-line-diagram-cache": joinedExistingJob ? "JOINED" : "MISS",
    });
    response.end(serialized);
  } catch (error) {
    console.error("Line diagram image export failed:", error);
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message || "Failed to render workbook" }));
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (request.method === "POST" && url.pathname === "/api/line-diagram-images") {
    await handleLineDiagramImages(request, response);
    return;
  }

  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = normalize(join(root, pathname));

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`CATV app ready at http://${host}:${port}`);
});
