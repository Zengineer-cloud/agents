// Run with: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scaffold = fileURLToPath(new URL("../scaffold/", import.meta.url));
const lines = (rel) => readFileSync(join(scaffold, rel), "utf8").trimEnd().split("\n").length;
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

// ── checks.mjs ─────────────────────────────────────────────────────────────────
const PASS = `node -e "process.exit(0)"`;
const FAIL = `node -e "console.error('boom'); process.exit(1)"`;
const TOUCH = `node -e "require('fs').writeFileSync(process.argv[1] + '.seen', '')" {file}`;

// A copy of the hook in a temp dir with its own checks.json and one sample file.
function setup(config) {
  const dir = mkdtempSync(join(tmpdir(), "checks test "));
  cpSync(join(scaffold, ".claude/hooks/checks.mjs"), join(dir, "checks.mjs"));
  const setConfig = (c) => writeFileSync(join(dir, "checks.json"), JSON.stringify(c));
  setConfig(config);
  const file = join(dir, "sample.txt");
  writeFileSync(file, "x");
  const session_id = `test-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const run = (mode, input = {}, env = {}) =>
    spawnSync("node", [join(dir, "checks.mjs"), mode], {
      input: typeof input === "string" ? input : JSON.stringify({ session_id, cwd: dir, ...input }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_SKIP_CHECKS: "", ...env },
    });
  const edit = () => run("format", { tool_input: { file_path: file } });
  return { dir, file, run, edit, setConfig };
}

test("empty config does nothing", () => {
  const t = setup({ format: {}, verify: [] });
  assert.equal(t.edit().status, 0);
  assert.equal(t.run("verify").status, 0);
});

test("format runs the command for the file's extension, with the path quoted", () => {
  const t = setup({ format: { "md, .txt": TOUCH }, verify: [] });
  assert.equal(t.edit().status, 0);
  assert.ok(existsSync(`${t.file}.seen`), "formatter received the file path");
});

test("format passes a hostile file name through intact and runs nothing from it", () => {
  const t = setup({ format: { txt: TOUCH }, verify: [] });
  const file = join(t.dir, "it's $(echo pwned) & %PATH% ; x.txt");
  writeFileSync(file, "x");
  assert.equal(t.run("format", { tool_input: { file_path: file } }).status, 0);
  assert.ok(existsSync(`${file}.seen`), "formatter received the exact path");
  assert.deepEqual(readdirSync(t.dir).filter((f) => f.includes("pwned") && !f.startsWith("it's")), []);
});

test("format skips extensions with no command", () => {
  const t = setup({ format: { py: FAIL }, verify: [] });
  assert.equal(t.edit().status, 0);
});

test("format failure exits 2 and reports the output", () => {
  const t = setup({ format: { txt: FAIL }, verify: [] });
  const r = t.edit();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /boom/);
  assert.match(r.stderr, /sample\.txt/);
});

test("a tool that isn't installed is skipped", () => {
  const t = setup({ format: { txt: "definitely-not-installed-xyz {file}" }, verify: ["definitely-not-installed-xyz"] });
  assert.equal(t.edit().status, 0);
  assert.equal(t.run("verify").status, 0);
});

test("verify only runs after Claude edited a file", () => {
  const t = setup({ format: {}, verify: [FAIL] });
  assert.equal(t.run("verify").status, 0, "no edits yet");
  t.edit();
  const r = t.run("verify");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /boom/);
});

test("verify lets Claude stop on the second attempt, then checks again next turn", () => {
  const t = setup({ format: {}, verify: [FAIL] });
  t.edit();
  assert.equal(t.run("verify", { stop_hook_active: true }).status, 0);
  assert.equal(t.run("verify").status, 2);
});

test("a passing verify clears the pending state", () => {
  const t = setup({ format: {}, verify: [PASS] });
  t.edit();
  assert.equal(t.run("verify").status, 0);
  t.setConfig({ format: {}, verify: [FAIL] });
  assert.equal(t.run("verify").status, 0, "nothing edited since the passing run");
});

test("task keeps the task open when its checks fail, and names it", () => {
  const t = setup({ format: {}, task: [FAIL], verify: [] });
  assert.equal(t.run("task").status, 0, "no edits yet");
  t.edit();
  const r = t.run("task", { task_subject: "Add login" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /boom/);
  assert.match(r.stderr, /"Add login" is not complete/);
});

test("a passing task check clears only the task state", () => {
  const t = setup({ format: {}, task: [PASS], verify: [FAIL] });
  t.edit();
  assert.equal(t.run("task").status, 0);
  t.setConfig({ format: {}, task: [FAIL], verify: [FAIL] });
  assert.equal(t.run("task").status, 0, "nothing edited since the passing task run");
  assert.equal(t.run("verify").status, 2, "the session still verifies at the end");
});

test("ci runs verify without an edit, and a missing tool fails", () => {
  const t = setup({ format: {}, verify: [PASS, FAIL] });
  const r = t.run("ci");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PASS {2}node -e "process\.exit\(0\)"/);
  assert.match(r.stderr, /boom/);
  t.setConfig({ format: {}, verify: ["definitely-not-installed-xyz"] });
  assert.equal(t.run("ci").status, 1);
  t.setConfig({ format: {}, verify: [PASS] });
  assert.equal(t.run("ci").status, 0);
});

test("fails open on bad input and honors CLAUDE_SKIP_CHECKS", () => {
  const t = setup({ format: { txt: FAIL }, verify: [FAIL] });
  assert.equal(t.run("format", "not json").status, 0);
  assert.equal(t.run("format", { tool_input: { file_path: t.file } }, { CLAUDE_SKIP_CHECKS: "1" }).status, 0);
});

test("commands run in the git worktree Claude is working in", (t) => {
  const s = setup({ format: {}, verify: [`node -e "console.error(process.cwd()); process.exit(1)"`] });
  const git = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: s.dir });
  if (git("init", "-q").status !== 0) return t.skip("git not available");
  git("commit", "-q", "--allow-empty", "-m", "init");
  const wt = join(s.dir, ".claude", "worktrees", "wt");
  assert.equal(git("worktree", "add", "-q", wt).status, 0);
  s.edit();
  assert.match(s.run("verify", { cwd: wt }).stderr, /worktrees[\\/]wt/);
  assert.doesNotMatch(s.run("verify").stderr, /worktrees[\\/]wt/);
});

// ── scaffold files ─────────────────────────────────────────────────────────────
const settings = JSON.parse(readFileSync(join(scaffold, ".claude/settings.json"), "utf8"));
const rules = ["allow", "ask", "deny"].flatMap((k) => settings.permissions[k] ?? []);

test("every hook points at a script that exists and parses", () => {
  const hooks = Object.values(settings.hooks).flat().flatMap((m) => m.hooks);
  assert.ok(hooks.length > 0);
  for (const h of hooks) {
    const script = h.args[0].replace("${CLAUDE_PROJECT_DIR}", scaffold);
    assert.ok(existsSync(script), `${h.args[0]} exists`);
  }
  for (const f of walk(scaffold).filter((f) => f.endsWith(".mjs")))
    assert.equal(spawnSync("node", ["--check", f]).status, 0, `${f} passes node --check`);
});

test("path rules only use Read and Edit", () => {
  // Claude Code accepts Write(path) and similar rules but never consults them.
  for (const r of rules) assert.doesNotMatch(r, /^(Write|NotebookEdit|MultiEdit|Glob)\(/, r);
});

test("every Bash command rule has a PowerShell twin", () => {
  // PowerShell is the primary shell tool on Windows and Bash rules don't cover it.
  for (const r of rules.filter((r) => /^Bash\((?!\w+:)/.test(r)))
    assert.ok(rules.includes(r.replace(/^Bash/, "PowerShell")), `PowerShell twin of ${r}`);
});

test("files stay within their size limits", () => {
  assert.ok(lines("AGENTS.md") <= 150, "AGENTS.md is at most 150 lines");
  assert.ok(lines("CLAUDE.md") <= 50, "CLAUDE.md is at most 50 lines");
  for (const f of walk(join(scaffold, ".claude/skills")).filter((f) => f.endsWith("SKILL.md")))
    assert.ok(readFileSync(f, "utf8").trimEnd().split("\n").length <= 90, `${f} is at most 90 lines`);
});
