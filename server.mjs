import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const root = process.cwd();
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";
const lineDiagramCacheVersion = "excel-picture-v5-visible-bounds";
const lineDiagramCacheDir = join(root, ".cache", "line-diagram-images");
const lineDiagramJobs = new Map();
const adminSessions = new Map();
const adminSessionCookie = "catv_admin_session";
const adminSessionLifetimeMs = 8 * 60 * 60 * 1000;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function requestCookies(request) {
  return String(request.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return cookies;
      const key = decodeURIComponent(part.slice(0, separator));
      const value = decodeURIComponent(part.slice(separator + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function safeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function adminAccountFromEnvironment() {
  const masterKey = String(process.env.RATIS_MASTER_KEY || "");
  if (!masterKey) return null;
  return { id: "admin", masterKey, name: "관리자", role: "admin" };
}

function activeAdminSession(request) {
  const token = requestCookies(request)[adminSessionCookie];
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + adminSessionLifetimeMs;
  return { token, session };
}

function requireAdmin(request, response) {
  const active = activeAdminSession(request);
  if (active) return active;
  sendJson(response, 401, { error: "관리자 인증이 필요합니다." });
  return null;
}

function adminCookie(token, maxAgeSeconds = Math.floor(adminSessionLifetimeMs / 1000)) {
  return `${adminSessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

async function handleAdminLogin(request, response) {
  try {
    const body = await collectRequestBody(request, 16 * 1024);
    const credentials = JSON.parse(body.toString("utf8") || "{}");
    const account = adminAccountFromEnvironment();
    if (!account) {
      sendJson(response, 503, { error: "서버 인증 키가 설정되지 않았습니다." });
      return;
    }
    if (
      !safeTextEqual(account.id, credentials.id)
      || !safeTextEqual(account.masterKey, credentials.password)
    ) {
      sendJson(response, 401, { error: "아이디 또는 비밀번호를 확인해주세요." });
      return;
    }

    const token = randomBytes(32).toString("hex");
    adminSessions.set(token, {
      id: String(account.id),
      name: String(account.name || "관리자"),
      role: "admin",
      expiresAt: Date.now() + adminSessionLifetimeMs,
    });
    sendJson(response, 200, {
      authenticated: true,
      user: { id: account.id, name: account.name || "관리자", role: "admin" },
    }, { "set-cookie": adminCookie(token) });
  } catch (error) {
    sendJson(response, 400, { error: "관리자 로그인 요청 형식을 확인해주세요." });
  }
}

function handleAdminSession(request, response) {
  const active = activeAdminSession(request);
  if (!active) {
    sendJson(response, 401, { authenticated: false });
    return;
  }
  const { id, name, role } = active.session;
  sendJson(response, 200, { authenticated: true, user: { id, name, role } });
}

function handleAdminLogout(request, response) {
  const active = activeAdminSession(request);
  if (active) adminSessions.delete(active.token);
  sendJson(response, 200, { authenticated: false }, { "set-cookie": adminCookie("", 0) });
}

async function handlePublicSharedDatabase(response) {
  try {
    const sharedDatabase = JSON.parse(await readFile(join(root, "assets", "shared-db.json"), "utf8"));
    const publicDatabase = {
      ...sharedDatabase,
      users: Array.isArray(sharedDatabase?.users)
        ? sharedDatabase.users
          .filter((user) => user?.role !== "admin")
          .map(({ password: _password, ...user }) => user)
        : [],
    };
    sendJson(response, 200, publicDatabase);
  } catch (error) {
    sendJson(response, 500, { error: "공용 DB를 불러오지 못했습니다." });
  }
}

function isPublicStaticPath(pathname) {
  if (pathname.includes("\\") || pathname.split("/").includes("..")) return false;
  if (["/index.html", "/app.js", "/styles.css", "/favicon.ico"].includes(pathname)) return true;
  return pathname.startsWith("/assets/");
}

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

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    await handleAdminLogin(request, response);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    handleAdminSession(request, response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    handleAdminLogout(request, response);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({ ok: true, activeLineDiagramJobs: lineDiagramJobs.size }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/assets/shared-db.json") {
    await handlePublicSharedDatabase(response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/line-diagram-images") {
    if (!requireAdmin(request, response)) return;
    await handleLineDiagramImages(request, response);
    return;
  }

  const isAdminPage = request.method === "GET" && ["/admin", "/admin/"].includes(url.pathname);
  if (isAdminPage && !activeAdminSession(request)) {
    response.writeHead(302, {
      location: "/?auth=admin-required",
      "cache-control": "no-store",
    });
    response.end();
    return;
  }

  const pathname = decodeURIComponent((url.pathname === "/" || isAdminPage) ? "/index.html" : url.pathname);
  if (!isPublicStaticPath(pathname)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const filePath = normalize(join(root, pathname));

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": types[extname(filePath)] || "application/octet-stream",
    ...(isAdminPage ? { "cache-control": "no-store" } : {}),
  });
  createReadStream(filePath).pipe(response);
});

// Excel 그림 변환은 큰 통합 문서에서 몇 분 걸릴 수 있습니다.
server.requestTimeout = 0;
server.timeout = 0;
server.listen(port, host, () => {
  console.log(`CATV app ready at http://${host}:${port}`);
});
