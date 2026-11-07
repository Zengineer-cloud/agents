// Run with: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const factory = fileURLToPath(new URL("../factory/", import.meta.url));
const lines = (p) => readFileSync(p, "utf8").trimEnd().split("\n").length;

// ── test-lock.mjs ──────────────────────────────────────────────────────────────
function repo(stage, mode = "attended") {
  const dir = mkdtempSync(join(tmpdir(), "test lock "));
  mkdirSync(join(dir, "specs", "login"), { recursive: true });
  writeFileSync(join(dir, "specs", "login", "status.md"), `---\nstage: ${stage}\nrun: ${mode}\n---\n# Status\n`);
  writeFileSync(join(dir, "specs", "login", "tests.lock"), "# acceptance tests\ntests/login.test.ts\n");
  const run = (file, raw) =>
    spawnSync("node", [join(factory, "hooks", "test-lock.mjs")], {
      input: raw ?? JSON.stringify({ cwd: dir, tool_input: { file_path: file } }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
  return { dir, run };
}
const decision = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : "none");

test("test-lock asks before an edit to a locked test during build", () => {
  const t = repo("build");
  assert.equal(decision(t.run(join(t.dir, "tests", "login.test.ts"))), "ask");
  assert.equal(decision(t.run("tests/login.test.ts")), "ask", "relative paths resolve from cwd");
});

test("test-lock asks before an edit to the lock file itself", () => {
  const t = repo("review");
  assert.equal(decision(t.run(join(t.dir, "specs", "login", "tests.lock"))), "ask");
});

test("test-lock denies instead of asking in an unattended run", () => {
  const t = repo("build", "unattended");
  const r = t.run(join(t.dir, "tests", "login.test.ts"));
  assert.equal(decision(r), "deny");
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /FACTORY RUN PARKED/);
  assert.equal(decision(t.run("src/login.ts")), "none", "other files still go through");
});

test("test-lock lets other files and finished features through", () => {
  assert.equal(decision(repo("build").run("src/login.ts")), "none");
  const done = repo("done");
  assert.equal(decision(done.run(join(done.dir, "tests", "login.test.ts"))), "none");
});

test("test-lock exits 0 on bad input", () => {
  const r = repo("build").run(null, "not json");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

// ── plugin shape ───────────────────────────────────────────────────────────────
test("factory skills stay under 90 lines and name themselves", () => {
  for (const name of readdirSync(join(factory, "skills"))) {
    const file = join(factory, "skills", name, "SKILL.md");
    assert.ok(lines(file) <= 90, `${name}/SKILL.md is ${lines(file)} lines`);
    assert.match(readFileSync(file, "utf8"), new RegExp(`^---\\r?\\nname: ${name}\\r?\\n`), `${name} frontmatter`);
  }
});

test("factory workflows start with a literal meta block", () => {
  for (const name of readdirSync(join(factory, "workflows"))) {
    assert.match(readFileSync(join(factory, "workflows", name), "utf8"), /^export const meta = \{/);
  }
});

test("factory hook script passes node --check", () => {
  const r = spawnSync("node", ["--check", join(factory, "hooks", "test-lock.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

const hasClaude = spawnSync("claude", ["--version"], { shell: true }).status === 0;
test("factory plugin validates", { skip: !hasClaude && "claude CLI not on PATH" }, () => {
  const r = spawnSync("claude", ["plugin", "validate", factory], { encoding: "utf8", shell: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
