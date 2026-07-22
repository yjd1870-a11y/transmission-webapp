import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  bootstrapNeon,
  createPendingPhoto,
  getPhoto,
  listPhotos,
  neonConfigured,
  readNeonAuthAccounts,
  readNeonSharedDatabase,
  readyPhoto,
  removePhoto,
  writeNeonAuthAccounts,
  writeNeonSharedDatabase,
} from "./lib/neon-store.mjs";
import {
  deletePhotoObject,
  inspectPhotoObject,
  r2Configured,
  r2ConfigurationComplete,
  signedPhotoDownloadUrl,
  signedPhotoUploadUrl,
} from "./lib/r2-photo-store.mjs";

const root = process.cwd();
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";
const apiVersion = "neon-r2-v2";
const lineDiagramCacheVersion = "excel-picture-v7-mapyeong-colored-text";
const lineDiagramCacheDir = join(root, ".cache", "line-diagram-images");
const lineDiagramJobs = new Map();
const authSessions = new Map();
const loginAttempts = new Map();
const authSessionCookie = "ratis_session";
const authSessionLifetimeMs = 8 * 60 * 60 * 1000;
const loginAttemptWindowMs = 15 * 60 * 1000;
const loginAttemptLimit = 8;
const authDatabasePath = process.env.RATIS_AUTH_DB_PATH
  ? resolve(process.env.RATIS_AUTH_DB_PATH)
  : join(root, "data", "auth-users.json");
const sharedDatabasePath = process.env.RATIS_SHARED_DB_PATH
  ? resolve(process.env.RATIS_SHARED_DB_PATH)
  : join(root, "assets", "shared-db.json");
const scryptAsync = promisify(scryptCallback);
let authDatabaseWriteQueue = Promise.resolve();
let persistentStorageBootstrapPromise;

const photoSizeLimitBytes = 10 * 1024 * 1024;
const photoContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

function applySecurityHeaders(request, response) {
  response.setHeader("content-security-policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https://api.github.com https://*.r2.cloudflarestorage.com",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "object-src 'none'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; "));
  response.setHeader("cross-origin-opener-policy", "same-origin");
  response.setHeader("cross-origin-resource-policy", "same-origin");
  response.setHeader("permissions-policy", "camera=(), geolocation=(), microphone=()");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  const forwardedProtocol = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  if (process.env.NODE_ENV === "production" || forwardedProtocol === "https") {
    response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
}

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

function requireSession(request, response) {
  const active = activeSession(request);
  if (active) return active;
  sendJson(response, 401, { error: "인증이 필요합니다." });
  return null;
}

function authCookie(request, token, maxAgeSeconds = Math.floor(authSessionLifetimeMs / 1000)) {
  const forwardedProtocol = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = process.env.NODE_ENV === "production" || forwardedProtocol === "https" ? "; Secure" : "";
  return `${authSessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function loginAttemptKey(request, accountId) {
  const remoteAddress = String(request.socket.remoteAddress || "unknown");
  const forwardedAddress = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return `${remoteAddress}|${forwardedAddress}|${String(accountId || "").toLowerCase()}`;
}

function activeLoginAttempt(request, accountId) {
  const now = Date.now();
  const key = loginAttemptKey(request, accountId);
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.expiresAt <= now) {
    loginAttempts.delete(key);
    return { key, count: 0, expiresAt: now + loginAttemptWindowMs };
  }
  return { key, ...attempt };
}

function recordFailedLogin(request, accountId) {
  const attempt = activeLoginAttempt(request, accountId);
  if (loginAttempts.size >= 10_000) {
    const now = Date.now();
    for (const [key, entry] of loginAttempts) {
      if (entry.expiresAt <= now) loginAttempts.delete(key);
    }
    if (loginAttempts.size >= 10_000) {
      const oldestKey = loginAttempts.keys().next().value;
      if (oldestKey) loginAttempts.delete(oldestKey);
    }
  }
  loginAttempts.set(attempt.key, { count: attempt.count + 1, expiresAt: attempt.expiresAt });
}

function clearFailedLogins(request, accountId) {
  loginAttempts.delete(loginAttemptKey(request, accountId));
}

function rejectCrossSiteMutation(request, response) {
  const fetchSite = String(request.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    sendJson(response, 403, { error: "교차 사이트 요청은 허용되지 않습니다." });
    return true;
  }
  return false;
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

async function readFileAuthAccounts() {
  try {
    const parsed = JSON.parse(await readFile(authDatabasePath, "utf8"));
    return (Array.isArray(parsed?.users) ? parsed.users : []).map(normalizeStoredAccount);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const sharedDatabase = JSON.parse(await readFile(join(root, "assets", "shared-db.json"), "utf8"));
    const initialUsers = (Array.isArray(sharedDatabase?.users) ? sharedDatabase.users : [])
      .filter((user) => user?.role !== "admin" && String(user?.id || "").trim() !== "admin")
      .map((user) => normalizeStoredAccount(user));
    await writeFileAuthAccounts(initialUsers);
    return initialUsers;
  }
}

async function writeFileAuthAccounts(users) {
  await mkdir(dirname(authDatabasePath), { recursive: true });
  await writeFile(authDatabasePath, `${JSON.stringify({ version: 1, users }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function initializePersistentStorage() {
  if (!neonConfigured()) return;
  if (!persistentStorageBootstrapPromise) {
    persistentStorageBootstrapPromise = Promise.all([
      readFileAuthAccounts(),
      readFile(sharedDatabasePath, "utf8").then(JSON.parse).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      }),
    ]).then(([authUsers, sharedDatabase]) => bootstrapNeon({ authUsers, sharedDatabase }));
  }
  return persistentStorageBootstrapPromise;
}

async function readAuthAccounts() {
  if (!neonConfigured()) return readFileAuthAccounts();
  await initializePersistentStorage();
  return readNeonAuthAccounts();
}

async function writeAuthAccounts(users) {
  if (!neonConfigured()) return writeFileAuthAccounts(users);
  await initializePersistentStorage();
  return writeNeonAuthAccounts(users);
}

async function readSharedDatabase() {
  if (!neonConfigured()) return JSON.parse(await readFile(sharedDatabasePath, "utf8"));
  await initializePersistentStorage();
  const sharedDatabase = await readNeonSharedDatabase();
  if (!sharedDatabase) throw new Error("Neon 공용 데이터가 초기화되지 않았습니다.");
  return sharedDatabase;
}

async function writeSharedDatabase(sharedDatabase) {
  if (!neonConfigured()) {
    await mkdir(dirname(sharedDatabasePath), { recursive: true });
    await writeFile(sharedDatabasePath, `${JSON.stringify(sharedDatabase, null, 2)}\n`, "utf8");
    return;
  }
  await initializePersistentStorage();
  await writeNeonSharedDatabase(sharedDatabase);
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
    const loginAttempt = activeLoginAttempt(request, requestedId);
    if (loginAttempt.count >= loginAttemptLimit) {
      const retryAfter = Math.max(1, Math.ceil((loginAttempt.expiresAt - Date.now()) / 1000));
      sendJson(response, 429, { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." }, {
        "retry-after": String(retryAfter),
      });
      return;
    }
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
      recordFailedLogin(request, requestedId);
      sendJson(response, 401, { error: "아이디 또는 비밀번호를 확인해주세요." });
      return;
    }

    clearFailedLogins(request, requestedId);
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
    }, { "set-cookie": authCookie(request, token) });
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
  sendJson(response, 200, { authenticated: false }, { "set-cookie": authCookie(request, "", 0) });
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
    const sharedDatabase = await readSharedDatabase();
    const { users: _legacyUsers, ...publicDatabase } = sharedDatabase;
    sendJson(response, 200, publicDatabase);
  } catch (error) {
    sendJson(response, 500, { error: "공용 DB를 불러오지 못했습니다." });
  }
}

async function handleSaveSharedDatabase(request, response) {
  try {
    const payload = JSON.parse((await collectRequestBody(request, 64 * 1024 * 1024)).toString("utf8") || "{}");
    const databaseKeys = ["records", "floorPlans", "b2cLines", "b2cDiagrams"];
    if (!databaseKeys.every((key) => Array.isArray(payload[key]))) {
      sendJson(response, 400, { error: "데이터·평면도·B2C·직선도 DB 형식을 확인해주세요." });
      return;
    }
    const updatedAt = new Date().toISOString();
    const sharedDatabase = {
      schemaVersion: 1,
      version: updatedAt,
      appVersion: String(payload.appVersion || ""),
      updatedAt,
      records: payload.records,
      floorPlans: payload.floorPlans,
      b2cLines: payload.b2cLines,
      b2cDiagrams: payload.b2cDiagrams,
    };
    await writeSharedDatabase(sharedDatabase);
    sendJson(response, 200, {
      saved: true,
      version: updatedAt,
      storage: neonConfigured() ? "neon" : "file",
      counts: Object.fromEntries(databaseKeys.map((key) => [key, sharedDatabase[key].length])),
    });
  } catch (error) {
    console.error("Shared database save failed:", error);
    sendJson(response, 400, { error: "공용 DB를 저장하지 못했습니다." });
  }
}

function photoStorageAvailable(response) {
  if (!neonConfigured() || !r2Configured()) {
    sendJson(response, 503, {
      code: "PHOTO_STORAGE_DISABLED",
      error: "Neon 또는 R2 사진 저장소가 아직 설정되지 않았습니다.",
    });
    return false;
  }
  return true;
}

function validatePhotoType(value) {
  const type = String(value || "").toLowerCase();
  if (!['onu', 'ups'].includes(type)) throw new Error("사진 종류가 올바르지 않습니다.");
  return type;
}

function validatePhotoRecordKey(value) {
  const recordKey = String(value || "").trim();
  if (!recordKey || recordKey.length > 200) throw new Error("사진 대상 CELL 정보를 확인해주세요.");
  return recordKey;
}

function validatePhotoId(value) {
  const id = String(value || "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error("사진 식별자가 올바르지 않습니다.");
  }
  return id;
}

function photoUrl(photoId) {
  return `/api/photos/${encodeURIComponent(photoId)}/content`;
}

function photoExtension(contentType) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }[contentType] || "bin";
}

async function handleListPhotos(response, url) {
  try {
    if (!photoStorageAvailable(response)) return;
    const recordKey = validatePhotoRecordKey(url.searchParams.get("recordKey"));
    const type = validatePhotoType(url.searchParams.get("type"));
    const photos = await listPhotos(recordKey, type);
    sendJson(response, 200, {
      photos: photos.map((photo) => ({
        id: photo.id,
        url: photoUrl(photo.id),
        contentType: photo.contentType,
        sizeBytes: photo.sizeBytes,
        originalName: photo.originalName,
        createdAt: photo.createdAt,
      })),
    });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "사진 목록을 불러오지 못했습니다." });
  }
}

async function handleCreatePhotoUpload(request, response, session) {
  try {
    if (!photoStorageAvailable(response)) return;
    const payload = JSON.parse((await collectRequestBody(request, 32 * 1024)).toString("utf8") || "{}");
    const recordKey = validatePhotoRecordKey(payload.recordKey);
    const photoType = validatePhotoType(payload.type);
    const contentType = String(payload.contentType || "").toLowerCase();
    const sizeBytes = Number(payload.sizeBytes);
    const originalName = String(payload.fileName || "photo").trim().slice(0, 200);
    const replacesPhotoId = payload.replacesPhotoId ? validatePhotoId(payload.replacesPhotoId) : "";
    if (!photoContentTypes.has(contentType)) throw new Error("JPEG, PNG, WEBP, GIF 사진만 등록할 수 있습니다.");
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > photoSizeLimitBytes) {
      throw new Error("사진은 한 장당 10MB 이하여야 합니다.");
    }

    const id = randomUUID();
    const now = new Date();
    const objectKey = `photos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}.${photoExtension(contentType)}`;
    await createPendingPhoto({
      id,
      recordKey,
      photoType,
      objectKey,
      contentType,
      sizeBytes,
      originalName,
      uploadedBy: session.session.id,
      replacesPhotoId,
    });
    try {
      const upload = await signedPhotoUploadUrl({ objectKey, contentType, expiresIn: 300 });
      sendJson(response, 201, {
        photoId: id,
        uploadUrl: upload.url,
        expiresAt: upload.expiresAt,
        contentType,
      });
    } catch (error) {
      await removePhoto(id).catch(() => {});
      throw error;
    }
  } catch (error) {
    const status = ["PHOTO_LIMIT", "PHOTO_NOT_FOUND"].includes(error.code) ? 409 : 400;
    sendJson(response, status, { code: error.code || "PHOTO_UPLOAD_ERROR", error: error.message || "사진 업로드를 준비하지 못했습니다." });
  }
}

async function handleCompletePhoto(response, photoId) {
  try {
    if (!photoStorageAvailable(response)) return;
    const id = validatePhotoId(photoId);
    const photo = await getPhoto(id, { includePending: true });
    if (!photo) {
      sendJson(response, 404, { error: "사진 업로드 정보를 찾지 못했습니다." });
      return;
    }
    const object = await inspectPhotoObject(photo.objectKey);
    if (object.sizeBytes !== photo.sizeBytes || object.sizeBytes > photoSizeLimitBytes || object.contentType !== photo.contentType) {
      await deletePhotoObject(photo.objectKey).catch(() => {});
      await removePhoto(id).catch(() => {});
      sendJson(response, 400, { error: "업로드된 사진의 크기 또는 형식이 요청과 일치하지 않습니다." });
      return;
    }
    const completed = await readyPhoto(id);
    if (!completed) {
      sendJson(response, 404, { error: "사진 업로드 정보를 찾지 못했습니다." });
      return;
    }
    if (completed.replacedObjectKey) {
      await deletePhotoObject(completed.replacedObjectKey).catch((error) => {
        console.warn("Replaced R2 photo cleanup failed:", error);
      });
    }
    sendJson(response, 200, {
      photo: {
        id: completed.photo.id,
        url: photoUrl(completed.photo.id),
        contentType: completed.photo.contentType,
        sizeBytes: completed.photo.sizeBytes,
      },
    });
  } catch (error) {
    console.error("Photo completion failed:", error);
    sendJson(response, 400, { error: error.message || "사진 업로드를 완료하지 못했습니다." });
  }
}

async function handlePhotoContent(response, photoId) {
  try {
    if (!photoStorageAvailable(response)) return;
    const photo = await getPhoto(validatePhotoId(photoId));
    if (!photo) {
      sendJson(response, 404, { error: "사진을 찾지 못했습니다." });
      return;
    }
    const location = await signedPhotoDownloadUrl({ objectKey: photo.objectKey, expiresIn: 600 });
    response.writeHead(302, { location, "cache-control": "private, no-store" });
    response.end();
  } catch (error) {
    console.error("Photo download failed:", error);
    sendJson(response, 400, { error: error.message || "사진을 불러오지 못했습니다." });
  }
}

async function handleDeletePhoto(response, photoId) {
  try {
    if (!photoStorageAvailable(response)) return;
    const id = validatePhotoId(photoId);
    const photo = await getPhoto(id, { includePending: true });
    if (!photo) {
      sendJson(response, 404, { error: "사진을 찾지 못했습니다." });
      return;
    }
    await deletePhotoObject(photo.objectKey);
    await removePhoto(id);
    sendJson(response, 200, { deleted: true });
  } catch (error) {
    console.error("Photo delete failed:", error);
    sendJson(response, 400, { error: error.message || "사진을 삭제하지 못했습니다." });
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

async function handleRequest(request, response) {
  applySecurityHeaders(request, response);
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method || "") && rejectCrossSiteMutation(request, response)) {
    return;
  }
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
  if (request.method === "GET" && url.pathname === "/api/photos") {
    if (!requireSession(request, response)) return;
    await handleListPhotos(response, url);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/photos/upload-url") {
    const session = requireSession(request, response);
    if (!session) return;
    await handleCreatePhotoUpload(request, response, session);
    return;
  }
  const photoContentMatch = url.pathname.match(/^\/api\/photos\/([^/]+)\/content$/);
  if (request.method === "GET" && photoContentMatch) {
    if (!requireSession(request, response)) return;
    await handlePhotoContent(response, decodeURIComponent(photoContentMatch[1]));
    return;
  }
  const photoCompleteMatch = url.pathname.match(/^\/api\/photos\/([^/]+)\/complete$/);
  if (request.method === "POST" && photoCompleteMatch) {
    if (!requireSession(request, response)) return;
    await handleCompletePhoto(response, decodeURIComponent(photoCompleteMatch[1]));
    return;
  }
  const photoMatch = url.pathname.match(/^\/api\/photos\/([^/]+)$/);
  if (request.method === "DELETE" && photoMatch) {
    if (!requireSession(request, response)) return;
    await handleDeletePhoto(response, decodeURIComponent(photoMatch[1]));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({
      ok: true,
      apiVersion,
      authConfigured: Boolean(adminAccountFromEnvironment()),
      database: neonConfigured() ? "neon" : "file",
      photoStorage: neonConfigured() && r2Configured() ? "r2" : "disabled",
      r2ConfigurationComplete: r2ConfigurationComplete(),
      activeLineDiagramJobs: lineDiagramJobs.size,
    }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/assets/shared-db.json") {
    if (!requireSession(request, response)) return;
    await handlePublicSharedDatabase(response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/line-diagram-images") {
    if (!requireAdmin(request, response)) return;
    await handleLineDiagramImages(request, response);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/admin/shared-db") {
    if (!requireAdmin(request, response)) return;
    await handleSaveSharedDatabase(request, response);
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

  let pathname = "";
  try {
    pathname = decodeURIComponent((url.pathname === "/" || isAdminPage) ? "/index.html" : url.pathname);
  } catch {
    sendJson(response, 400, { error: "잘못된 요청 경로입니다." });
    return;
  }
  if (pathname.startsWith("/assets/") && !requireSession(request, response)) return;
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
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Request handling failed:", error);
    if (!response.headersSent) sendJson(response, 500, { error: "서버 요청 처리에 실패했습니다." });
    else response.end();
  });
});

// Excel 그림 변환은 큰 통합 문서에서 몇 분 걸릴 수 있습니다.
server.requestTimeout = 0;
server.timeout = 0;

async function startServer() {
  if (!r2ConfigurationComplete()) {
    throw new Error("R2 환경변수는 R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET을 모두 설정해야 합니다.");
  }
  await initializePersistentStorage();
  server.listen(port, host, () => {
    console.log(`CATV app ready at http://${host}:${port} (${neonConfigured() ? "Neon" : "file"}, ${r2Configured() ? "R2" : "local photos"})`);
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error);
  process.exitCode = 1;
});
