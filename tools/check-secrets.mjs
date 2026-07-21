import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const mode = process.argv.includes("--history") ? "history" : "staged";
const sensitivePath = /(^|\/)(\.env($|\.)|[^/]+\.(?:pem|key|p12|pfx|jks|keystore)$|credentials[^/]*\.json$|secrets?[^/]*\.(?:json|ya?ml)$|\.npmrc$|\.pypirc$)/i;
const ignoredPaths = [
  /^assets\/vendor\//,
  /^tools\/check-secrets\.mjs$/,
];
const rules = [
  {
    name: "private-key",
    regex: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
    gitRegex: "-----BEGIN( [A-Z]+)? PRIVATE KEY-----",
  },
  {
    name: "known-token-format",
    regex: /AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[0-9A-Za-z-]{10,}|sk_live_[0-9A-Za-z]{16,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    gitRegex: "AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(proj-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[0-9A-Za-z-]{10,}|sk_live_[0-9A-Za-z]{16,}|eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}",
  },
  {
    name: "literal-secret-assignment",
    regex: /["'`]?(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|master[_-]?key|ratis[_-]?master[_-]?key)["'`]?\s*[:=]\s*["'`][^"'`\s]{8,}["'`]/i,
    gitRegex: "[\"'`]?(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|master[_-]?key|ratis[_-]?master[_-]?key)[\"'`]?[[:space:]]*[:=][[:space:]]*[\"'`][^\"'`[:space:]]{8,}[\"'`]",
  },
  {
    name: "documented-credential-pair",
    regex: /^\s*-\s*[^:\n]*(?:계정|관리자|사용자|admin|user)[^:\n]*:\s*`[^`\s]+`\s*\/\s*`[^`\s]{6,}`/im,
    gitRegex: "^[[:space:]]*-[[:space:]]*[^:]*(계정|관리자|사용자|admin|user)[^:]*:[[:space:]]*`[^`[:space:]]+`[[:space:]]*/[[:space:]]*`[^`[:space:]]{6,}`",
  },
];

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: options.encoding || "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowNoMatch) {
    const message = String(result.stderr || "Git command failed").trim();
    throw new Error(message);
  }
  return result;
}

function ignored(path) {
  return ignoredPaths.some((pattern) => pattern.test(path));
}

function lineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function scanStaged() {
  const names = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], { encoding: "buffer" }).stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const findings = [];

  for (const path of names) {
    if (ignored(path)) continue;
    if (sensitivePath.test(path)) {
      findings.push({ path, line: 1, rule: "sensitive-filename" });
      continue;
    }
    const shown = git(["show", `:${path}`], { encoding: "buffer" });
    const buffer = shown.stdout;
    if (buffer.includes(0)) continue;
    const content = buffer.toString("utf8");
    for (const rule of rules) {
      const match = rule.regex.exec(content);
      if (match) findings.push({ path, line: lineNumber(content, match.index), rule: rule.name });
    }
  }
  return findings;
}

function scanHistory() {
  const commits = git(["rev-list", "--all"]).stdout.trim().split(/\r?\n/).filter(Boolean);
  const findings = new Map();

  for (const commit of commits) {
    const names = git(["ls-tree", "-r", "--name-only", "-z", commit], { encoding: "buffer" }).stdout
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    for (const path of names) {
      if (!ignored(path) && sensitivePath.test(path)) {
        findings.set(`${commit}:${path}:sensitive-filename`, { commit, path, line: 1, rule: "sensitive-filename" });
      }
    }
    for (const rule of rules) {
      const result = git([
        "grep", "-I", "-n", "-i", "-E", rule.gitRegex, commit, "--",
        ":(exclude)assets/vendor/**",
        ":(exclude)tools/check-secrets.mjs",
      ], { allowNoMatch: true });
      for (const outputLine of String(result.stdout || "").split(/\r?\n/).filter(Boolean)) {
        const match = outputLine.match(/^[^:]+:([^:]+):(\d+):/);
        if (!match) continue;
        const [, path, line] = match;
        findings.set(`${commit}:${path}:${line}:${rule.name}`, { commit, path, line: Number(line), rule: rule.name });
      }
    }
  }
  return [...findings.values()];
}

try {
  const findings = mode === "history" ? scanHistory() : scanStaged();
  if (findings.length) {
    console.error("Secret scan blocked. Values are intentionally redacted:");
    for (const finding of findings.slice(0, 100)) {
      const prefix = finding.commit ? `${finding.commit.slice(0, 12)}:` : "";
      console.error(`- ${prefix}${finding.path}:${finding.line} [${finding.rule}]`);
    }
    if (findings.length > 100) console.error(`- ...and ${findings.length - 100} more finding(s)`);
    process.exit(1);
  }
  console.log(`Secret scan passed (${mode}).`);
} catch (error) {
  console.error(`Secret scan failed safely: ${error.message}`);
  process.exit(2);
}
