import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const authTempDirectory = await mkdtemp(join(tmpdir(), "ratis-auth-test-"));
const authDatabasePath = join(authTempDirectory, "auth-users.json");

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`테스트 서버가 종료되었습니다 (${child.exitCode}).`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("테스트 서버가 준비되지 않았습니다.");
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const testMasterKey = randomBytes(32).toString("hex");
let serverOutput = "";
const child = spawn(process.execPath, [join(root, "server.mjs")], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    RATIS_MASTER_KEY: testMasterKey,
    RATIS_AUTH_DB_PATH: authDatabasePath,
  },
  windowsHide: true,
});
child.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
child.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

try {
  await waitForServer(baseUrl, child);

  const unauthenticatedAdmin = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
  assert.equal(unauthenticatedAdmin.status, 302);
  assert.equal(unauthenticatedAdmin.headers.get("location"), "/?auth=admin-required");

  const privateServerSource = await fetch(`${baseUrl}/server.mjs`);
  assert.equal(privateServerSource.status, 404);

  const unauthenticatedUsers = await fetch(`${baseUrl}/api/admin/users`);
  assert.equal(unauthenticatedUsers.status, 401);

  const publicDatabase = await fetch(`${baseUrl}/assets/shared-db.json`);
  assert.equal(publicDatabase.status, 200);
  const publicUsers = (await publicDatabase.json()).users;
  assert.ok(publicUsers.every((user) => user.role !== "admin"));
  assert.ok(publicUsers.every((user) => !("password" in user)));

  const rejectedLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "admin", password: "wrong" }),
  });
  assert.equal(rejectedLogin.status, 401);

  const acceptedLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "admin", password: testMasterKey }),
  });
  assert.equal(acceptedLogin.status, 200);
  const cookie = String(acceptedLogin.headers.get("set-cookie") || "").split(";")[0];
  assert.match(cookie, /^ratis_session=/);

  const authenticatedSession = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
  assert.equal(authenticatedSession.status, 200);
  assert.equal((await authenticatedSession.json()).user.role, "admin");

  const authenticatedAdmin = await fetch(`${baseUrl}/admin`, { headers: { cookie }, redirect: "manual" });
  assert.equal(authenticatedAdmin.status, 200);
  assert.match(await authenticatedAdmin.text(), /id="adminView"/);

  const initialAccountsResponse = await fetch(`${baseUrl}/api/admin/users`, { headers: { cookie } });
  assert.equal(initialAccountsResponse.status, 200);
  const initialAccounts = (await initialAccountsResponse.json()).users;
  assert.ok(initialAccounts.some((account) => account.id === "admin" && account.rootAccount));
  assert.ok(initialAccounts.every((account) => !("passwordHash" in account) && !("passwordSalt" in account)));

  const userPassword = randomBytes(24).toString("base64url");
  const createdUserResponse = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ id: "mobile-user", name: "모바일 사용자", role: "user", password: userPassword }),
  });
  assert.equal(createdUserResponse.status, 201);
  assert.equal((await createdUserResponse.json()).user.passwordConfigured, true);

  const userLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "mobile-user", password: userPassword }),
  });
  assert.equal(userLogin.status, 200);
  const userCookie = String(userLogin.headers.get("set-cookie") || "").split(";")[0];
  assert.equal((await userLogin.json()).user.role, "user");

  const userAdminPage = await fetch(`${baseUrl}/admin`, { headers: { cookie: userCookie }, redirect: "manual" });
  assert.equal(userAdminPage.status, 302);
  const userAdminApi = await fetch(`${baseUrl}/api/admin/users`, { headers: { cookie: userCookie } });
  assert.equal(userAdminApi.status, 401);

  const storedAuthDatabase = await readFile(authDatabasePath, "utf8");
  assert.ok(!storedAuthDatabase.includes(userPassword));
  assert.match(storedAuthDatabase, /"passwordHash"/);

  const lockUser = await fetch(`${baseUrl}/api/admin/users/mobile-user`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ disabled: true }),
  });
  assert.equal(lockUser.status, 200);
  const revokedUserSession = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: userCookie } });
  assert.equal(revokedUserSession.status, 401);
  const lockedUserLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "mobile-user", password: userPassword }),
  });
  assert.equal(lockedUserLogin.status, 401);

  const resetPassword = randomBytes(24).toString("base64url");
  const resetResponse = await fetch(`${baseUrl}/api/admin/users/mobile-user/password`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ password: resetPassword }),
  });
  assert.equal(resetResponse.status, 200);
  const resetLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "mobile-user", password: resetPassword }),
  });
  assert.equal(resetLogin.status, 200);

  const additionalAdminPassword = randomBytes(24).toString("base64url");
  const createdAdmin = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ id: "site-admin", name: "현장 관리자", role: "admin", password: additionalAdminPassword }),
  });
  assert.equal(createdAdmin.status, 201);
  const additionalAdminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "site-admin", password: additionalAdminPassword }),
  });
  assert.equal(additionalAdminLogin.status, 200);
  assert.equal((await additionalAdminLogin.json()).user.role, "admin");

  const deletedUser = await fetch(`${baseUrl}/api/admin/users/mobile-user`, { method: "DELETE", headers: { cookie } });
  assert.equal(deletedUser.status, 200);
  const deletedUserLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "mobile-user", password: resetPassword }),
  });
  assert.equal(deletedUserLogin.status, 401);

  const protectedUpload = await fetch(`${baseUrl}/api/line-diagram-images`, { method: "POST", body: Buffer.alloc(0) });
  assert.equal(protectedUpload.status, 401);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie } });
  assert.equal(logout.status, 200);
  const expiredSession = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
  assert.equal(expiredSession.status, 401);

} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  child.kill();
}

const noKeyPort = await freePort();
const noKeyBaseUrl = `http://127.0.0.1:${noKeyPort}`;
const noKeyEnvironment = {
  ...process.env,
  PORT: String(noKeyPort),
  HOST: "127.0.0.1",
  RATIS_AUTH_DB_PATH: authDatabasePath,
};
delete noKeyEnvironment.RATIS_MASTER_KEY;
const noKeyChild = spawn(process.execPath, [join(root, "server.mjs")], {
  cwd: root,
  env: noKeyEnvironment,
  windowsHide: true,
});

try {
  await waitForServer(noKeyBaseUrl, noKeyChild);
  const unavailableLogin = await fetch(`${noKeyBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "admin", password: testMasterKey }),
  });
  assert.equal(unavailableLogin.status, 503);
} finally {
  noKeyChild.kill();
  await rm(authTempDirectory, { recursive: true, force: true });
}

console.log("관리자 지정 계정 인증 테스트 통과");
