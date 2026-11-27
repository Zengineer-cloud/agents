#!/usr/bin/env node
// Project checks, driven by checks.json next to this file. Does nothing until that
// file is filled in:
//
//   { "format": { "py": "ruff format {file}", "ts,tsx": "biome check --write {file}" },
//     "task": ["npx vitest run --changed"], "verify": ["npm test"] }
//
//   node checks.mjs format   PostToolUse (Edit|Write): run the command configured for
//                            the edited file's extension. {file} is the file's path.
//   node checks.mjs task     TaskCompleted: if Claude edited files since the last
//                            passing run, run the task commands (fast, changed-only
//                            tests). A failure keeps the task open.
//   node checks.mjs verify   Stop: if Claude edited files since the last passing run,
//                            run the verify commands (tests, typecheck).
//   node checks.mjs ci       CI: run the verify commands every time. Exit 1 on a
//                            failure, and a tool that isn't installed is a failure.
//
// Exit 0 = clean or nothing to do. Exit 2 = a check failed; stderr goes to Claude.
// In the hook modes, a command whose tool isn't installed is skipped, never an error.
// CLAUDE_SKIP_CHECKS=1 turns both modes off for a session.
// https://code.claude.com/docs/en/hooks
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (process.env.CLAUDE_SKIP_CHECKS === "1") process.exit(0);

const parse = (read) => {
  try {
    return JSON.parse(read() || "{}") ?? {};
  } catch {
    return {}; // fail open: a bad payload or config never blocks the session
  }
};
const here = dirname(fileURLToPath(import.meta.url));
const config = parse(() => readFileSync(join(here, "checks.json"), "utf8"));
const formatters = Object.entries(config.format ?? {});
const commands = (v) => [].concat(v ?? []).filter((c) => typeof c === "string" && c.trim());
const verifiers = commands(config.verify);
const taskChecks = commands(config.task);
const ci = process.argv[2] === "ci";
if (ci && !verifiers.length) {
  process.stdout.write("checks.json has no verify commands, so CI checks nothing.\n");
  process.exit(0);
}
if (!formatters.length && !verifiers.length && !taskChecks.length) process.exit(0);

const payload = ci ? {} : parse(() => readFileSync(0, "utf8"));
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const isWin = process.platform === "win32";

// Set when Claude edits a file, cleared when that mode's commands pass.
const session = String(payload.session_id ?? "none").replace(/[^A-Za-z0-9_-]/g, "_");
const marker = join(tmpdir(), `claude-checks-${session}`);
const taskMarker = `${marker}-task`;

const norm = (p) => (isWin ? resolve(p).toLowerCase() : resolve(p));
// CLAUDE_PROJECT_DIR doesn't follow Claude into a git worktree, so run commands in
// the checkout that holds `dir` when that is a different checkout from the project.
function rootFor(dir) {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" });
  const top = r.status === 0 ? r.stdout.trim() : "";
  if (!top) return projectDir;
  const sameCheckout = norm(projectDir) === norm(top) || norm(projectDir).startsWith(norm(top) + sep);
  return sameCheckout ? projectDir : top;
}

// {file} becomes a quoted variable reference, never the path itself, so a file name
// with quotes, $( ) or ; in it can't break out of the command.
const FILE_REF = isWin ? `"%CHECKS_FILE%"` : `"$CHECKS_FILE"`;
function run(cmd, cwd, env = {}) {
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", cwd, env: { ...process.env, ...env } });
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  const missing =
    Boolean(r.error) ||
    r.status === 127 ||
    (isWin && r.status === 1 && /is not recognized as an internal or external command/.test(out));
  return { ok: r.status === 0 || (missing && !ci), out: out.split(/\r?\n/).slice(-60).join("\n") };
}
function fail(heading, failures) {
  process.stderr.write(`${heading}\n${failures.map((f) => `── ${f.cmd} ──\n${f.out}`).join("\n")}\n`);
  process.exit(2);
}

if (process.argv[2] === "format") {
  const raw = String(payload.tool_input?.file_path ?? "");
  const file = raw && (isAbsolute(raw) ? raw : resolve(payload.cwd || projectDir, raw));
  if (!file || !existsSync(file)) process.exit(0);
  if (verifiers.length) writeFileSync(marker, "");
  if (taskChecks.length) writeFileSync(taskMarker, "");

  const ext = extname(file).slice(1).toLowerCase();
  const match = formatters.find(([exts]) =>
    exts.split(",").some((e) => e.trim().replace(/^\./, "").toLowerCase() === ext),
  );
  if (!match) process.exit(0);
  const cmd = String(match[1]);
  const r = run(cmd.replaceAll("{file}", FILE_REF), rootFor(dirname(file)), { CHECKS_FILE: file });
  if (!r.ok) fail(`Format/lint left issues in ${file}. Fix them:`, [{ cmd, out: r.out }]);
}

if (process.argv[2] === "task") {
  if (!existsSync(taskMarker)) process.exit(0);
  const root = rootFor(payload.cwd || projectDir);
  const failures = taskChecks.map((cmd) => ({ cmd, ...run(cmd, root) })).filter((r) => !r.ok);
  const subject = payload.task_subject ? ` "${payload.task_subject}"` : "";
  if (failures.length) fail(`Checks failed, so task${subject} is not complete. Fix them first:`, failures);
  rmSync(taskMarker, { force: true });
}

if (ci) {
  const failures = verifiers.map((cmd) => ({ cmd, ...run(cmd, projectDir) })).filter((r) => !r.ok);
  for (const f of verifiers) process.stdout.write(`${failures.some((x) => x.cmd === f) ? "FAIL" : "PASS"}  ${f}\n`);
  if (failures.length) {
    process.stderr.write(failures.map((f) => `── ${f.cmd} ──\n${f.out}`).join("\n") + "\n");
    process.exit(1);
  }
}

if (process.argv[2] === "verify") {
  // Already continuing because this hook blocked once: let Claude stop. The marker
  // stays, so the next turn verifies again.
  if (payload.stop_hook_active === true || !existsSync(marker)) process.exit(0);
  const root = rootFor(payload.cwd || projectDir);
  const failures = verifiers.map((cmd) => ({ cmd, ...run(cmd, root) })).filter((r) => !r.ok);
  if (failures.length) fail("Checks failed for this session's changes. Fix them before finishing:", failures);
  rmSync(marker, { force: true });
}
process.exit(0);
