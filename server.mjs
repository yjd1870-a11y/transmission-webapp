import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const root = process.cwd();
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";
const lineDiagramCacheVersion = "excel-picture-v7-mapyeong-colored-text";
const lineDiagramCacheDir = join(root, ".cache", "line-diagram-images");
const lineDiagramJobs = new Map();
const authSessions = new Map();
const authSessionCookie = "ratis_session";
const authSessionLifetimeMs = 8 * 60 * 60 * 1000;
const authDatabasePath = process.env.RATIS_AUTH_DB_PATH
  ? resolve(process.env.RATIS_AUTH_DB_PATH)
  : join(root, "data", "auth-users.json");
const scryptAsync = promisify(scryptCallback);
let authDatabaseWriteQueue = Promise.resolve();

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

function activeSession(request) {
  const token = requestCookies(request)[authSessionCookie];
  if (!token) return null;
  const session = authSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + authSessionLifetimeMs;
  return { token, session };
}

function requireAdmin(request, response) {
  const active = activeSession(request);
  if (active?.session?.role === "admin") return active;
  sendJson(response, 401, { error: "관리자 인증이 필요합니다." });
  return null;
}

function authCookie(token, maxAgeSeconds = Math.floor(authSessionLifetimeMs / 1000)) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${authSessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function normalizeStoredAccount(account) {
  return {
    id: String(account?.id || "").trim(),
    name: String(account?.name || "").trim(),
    role: account?.role === "admin" ? "admin" : "user",
    passwordSalt: String(account?.passwordSalt || ""),
    passwordHash: String(account?.passwordHash || ""),
    passwordUpdatedAt: String(account?.passwordUpdatedAt || ""),
    disabled: Boolean(account?.disabled),
  };
}

async function readAuthAccounts() {
  try {
    const parsed = JSON.parse(await readFile(authDatabasePath, "utf8"));
    return (Array.isArray(parsed?.users) ? parsed.users : []).map(normalizeStoredAccount);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const sharedDatabase = JSON.parse(await readFile(join(root, "assets", "shared-db.json"), "utf8"));
    const initialUsers = (Array.isArray(sharedDatabase?.users) ? sharedDatabase.users : [])
      .filter((user) => user?.role !== "admin" && String(user?.id || "").trim() !== "admin")
      .map((user) => normalizeStoredAccount(user));
    await writeAuthAccounts(initialUsers);
    return initialUsers;
  }
}

async function writeAuthAccounts(users) {
  await mkdir(dirname(authDatabasePath), { recursive: true });
  await writeFile(authDatabasePath, `${JSON.stringify({ version: 1, users }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function mutateAuthAccounts(mutator) {
  const operation = authDatabaseWriteQueue.then(async () => {
    const users = await readAuthAccounts();
    const result = await mutator(users);
    await writeAuthAccounts(users);
    return result;
  });
  authDatabaseWriteQueue = operation.catch(() => {});
  return operation;
}

function validateAccountId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(id)) {
    throw new Error("아이디는 영문, 숫자, 점, 밑줄, 하이픈으로 3~64자여야 합니다.");
  }
  if (id.toLowerCase() === "admin") throw new Error("admin 아이디는 서버 루트 관리자 전용입니다.");
  return id;
}

function validateAccountName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 100) throw new Error("이름은 1~100자로 입력해주세요.");
  return name;
}

function validateAccountRole(value) {
  if (!['user', 'admin'].includes(value)) throw new Error("권한은 user 또는 admin이어야 합니다.");
  return value;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 128) {
    throw new Error("비밀번호는 10~128자로 입력해주세요.");
  }
  return password;
}

async function passwordDigest(password, salt = randomBytes(16).toString("base64")) {
  const derived = await scryptAsync(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString("base64") };
}

async function verifyPassword(account, password) {
  if (!account?.passwordSalt || !account?.passwordHash) return false;
  const expected = Buffer.from(account.passwordHash, "base64");
  const actual = Buffer.from(await scryptAsync(String(password || ""), account.passwordSalt, expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicAccount(account, rootAccount = false) {
  return {
    id: account.id,
    name: account.name,
    role: account.role,
    disabled: Boolean(account.disabled),
    passwordConfigured: rootAccount ? Boolean(adminAccountFromEnvironment()) : Boolean(account.passwordHash),
    passwordUpdatedAt: rootAccount ? "" : account.passwordUpdatedAt,
    rootAccount,
  };
}

async function handleLogin(request, response) {
  try {
    const body = await collectRequestBody(request, 16 * 1024);
    const credentials = JSON.parse(body.toString("utf8") || "{}");
    const requestedId = String(credentials.id || "").trim();
    let authenticatedAccount = null;

    if (requestedId === "admin") {
      const rootAccount = adminAccountFromEnvironment();
      if (!rootAccount) {
        sendJson(response, 503, { error: "서버 인증 키가 설정되지 않았습니다." });
        return;
      }
      if (safeTextEqual(rootAccount.masterKey, credentials.password)) authenticatedAccount = rootAccount;
    } else {
      const account = (await readAuthAccounts()).find((candidate) => safeTextEqual(candidate.id, requestedId));
      if (account && !account.disabled && await verifyPassword(account, credentials.password)) {
        authenticatedAccount = account;
      }
    }

    if (!authenticatedAccount) {
      sendJson(response, 401, { error: "아이디 또는 비밀번호를 확인해주세요." });
      return;
    }

    const token = randomBytes(32).toString("hex");
    authSessions.set(token, {
      id: String(authenticatedAccount.id),
      name: String(authenticatedAccount.name || authenticatedAccount.id),
      role: authenticatedAccount.role === "admin" ? "admin" : "user",
      expiresAt: Date.now() + authSessionLifetimeMs,
    });
    sendJson(response, 200, {
      authenticated: true,
      user: {
        id: authenticatedAccount.id,
        name: authenticatedAccount.name || authenticatedAccount.id,
        role: authenticatedAccount.role === "admin" ? "admin" : "user",
      },
    }, { "set-cookie": authCookie(token) });
  } catch (error) {
    sendJson(response, 400, { error: "로그인 요청 형식을 확인해주세요." });
  }
}

function handleSession(request, response) {
  const active = activeSession(request);
  if (!active) {
    sendJson(response, 401, { authenticated: false });
    return;
  }
  const { id, name, role } = active.session;
  sendJson(response, 200, { authenticated: true, user: { id, name, role } });
}

function handleLogout(request, response) {
  const active = activeSession(request);
  if (active) authSessions.delete(active.token);
  sendJson(response, 200, { authenticated: false }, { "set-cookie": authCookie("", 0) });
}

async function handleListUsers(response) {
  try {
    const users = await readAuthAccounts();
    const rootAccount = { id: "admin", name: "관리자", role: "admin", disabled: false };
    sendJson(response, 200, { users: [publicAccount(rootAccount, true), ...users.map((user) => publicAccount(user))] });
  } catch (error) {
    console.error("Auth database read failed:", error);
    sendJson(response, 500, { error: "계정 DB를 불러오지 못했습니다." });
  }
}

async function handleCreateUser(request, response) {
  try {
    const payload = JSON.parse((await collectRequestBody(request, 32 * 1024)).toString("utf8") || "{}");
    const id = validateAccountId(payload.id);
    const name = validateAccountName(payload.name);
    const role = validateAccountRole(payload.role);
    const password = validatePassword(payload.password);
    const digest = await passwordDigest(password);
    const account = await mutateAuthAccounts((users) => {
      if (users.some((candidate) => candidate.id.toLowerCase() === id.toLowerCase())) {
        throw new Error("이미 사용 중인 아이디입니다.");
      }
      const nextAccount = normalizeStoredAccount({
        id,
        name,
        role,
        passwordSalt: digest.salt,
        passwordHash: digest.hash,
        passwordUpdatedAt: new Date().toISOString(),
        disabled: false,
      });
      users.push(nextAccount);
      return nextAccount;
    });
    sendJson(response, 201, { user: publicAccount(account) });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "계정을 생성하지 못했습니다." });
  }
}

async function handleUpdateUser(request, response, id) {
  try {
    const accountId = validateAccountId(id);
    const payload = JSON.parse((await collectRequestBody(request, 16 * 1024)).toString("utf8") || "{}");
    const account = await mutateAuthAccounts((users) => {
      const target = users.find((candidate) => candidate.id === accountId);
      if (!target) throw new Error("계정을 찾을 수 없습니다.");
      if (Object.hasOwn(payload, "name")) target.name = validateAccountName(payload.name);
      if (Object.hasOwn(payload, "role")) target.role = validateAccountRole(payload.role);
      if (Object.hasOwn(payload, "disabled")) target.disabled = Boolean(payload.disabled);
      return target;
    });
    for (const [token, session] of authSessions) {
      if (session.id === accountId) authSessions.delete(token);
    }
    sendJson(response, 200, { user: publicAccount(account) });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "계정을 수정하지 못했습니다." });
  }
}

async function handleResetUserPassword(request, response, id) {
  try {
    const accountId = validateAccountId(id);
    const payload = JSON.parse((await collectRequestBody(request, 16 * 1024)).toString("utf8") || "{}");
    const digest = await passwordDigest(validatePassword(payload.password));
    const account = await mutateAuthAccounts((users) => {
      const target = users.find((candidate) => candidate.id === accountId);
      if (!target) throw new Error("계정을 찾을 수 없습니다.");
      target.passwordSalt = digest.salt;
      target.passwordHash = digest.hash;
      target.passwordUpdatedAt = new Date().toISOString();
      target.disabled = false;
      return target;
    });
    for (const [token, session] of authSessions) {
      if (session.id === accountId) authSessions.delete(token);
    }
    sendJson(response, 200, { user: publicAccount(account) });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "비밀번호를 재설정하지 못했습니다." });
  }
}

async function handleDeleteUser(response, id) {
  try {
    const accountId = validateAccountId(id);
    await mutateAuthAccounts((users) => {
      const index = users.findIndex((candidate) => candidate.id === accountId);
      if (index < 0) throw new Error("계정을 찾을 수 없습니다.");
      users.splice(index, 1);
    });
    for (const [token, session] of authSessions) {
      if (session.id === accountId) authSessions.delete(token);
    }
    sendJson(response, 200, { deleted: true });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "계정을 삭제하지 못했습니다." });
  }
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
    await handleLogin(request, response);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    handleSession(request, response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    handleLogout(request, response);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    if (!requireAdmin(request, response)) return;
    await handleListUsers(response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/admin/users") {
    if (!requireAdmin(request, response)) return;
    await handleCreateUser(request, response);
    return;
  }
  const userPasswordMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
  if (request.method === "POST" && userPasswordMatch) {
    if (!requireAdmin(request, response)) return;
    await handleResetUserPassword(request, response, decodeURIComponent(userPasswordMatch[1]));
    return;
  }
  const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (request.method === "PATCH" && userMatch) {
    if (!requireAdmin(request, response)) return;
    await handleUpdateUser(request, response, decodeURIComponent(userMatch[1]));
    return;
  }
  if (request.method === "DELETE" && userMatch) {
    if (!requireAdmin(request, response)) return;
    await handleDeleteUser(response, decodeURIComponent(userMatch[1]));
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
  const adminPageSession = isAdminPage ? activeSession(request) : null;
  if (isAdminPage && adminPageSession?.session?.role !== "admin") {
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
