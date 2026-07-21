import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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
  assert.match(cookie, /^catv_admin_session=/);

  const authenticatedSession = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
  assert.equal(authenticatedSession.status, 200);
  assert.equal((await authenticatedSession.json()).user.role, "admin");

  const authenticatedAdmin = await fetch(`${baseUrl}/admin`, { headers: { cookie }, redirect: "manual" });
  assert.equal(authenticatedAdmin.status, 200);
  assert.match(await authenticatedAdmin.text(), /id="adminView"/);

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
}

console.log("관리자 인증 미들웨어 테스트 통과");
