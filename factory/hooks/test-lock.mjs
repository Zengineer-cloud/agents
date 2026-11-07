// PreToolUse hook for Edit|Write|NotebookEdit. While a factory feature is in
// build, review or ship, edits to its acceptance tests (listed one path per
// line in specs/<slug>/tests.lock) and to the lock file itself go to the user
// for approval. In an unattended run (`run: unattended` in status.md) nobody is
// there to approve, so the edit is denied and the agent parks the run instead.
// The agent that writes the code must not quietly rewrite the tests that grade
// it. Any error lets the edit through: this hook steers, the verifier and the
// review's test lens are the checks.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const LOCKED_STAGES = new Set(["build", "review", "ship"]);
const norm = (p) => {
  const r = resolve(p).replace(/\\/g, "/");
  return process.platform === "win32" ? r.toLowerCase() : r;
};

function main(input) {
  const target = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  if (!target) return;
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const specs = join(root, "specs");
  if (!existsSync(specs)) return;
  const file = norm(resolve(input.cwd || root, target));

  for (const slug of readdirSync(specs)) {
    const lock = join(specs, slug, "tests.lock");
    const status = join(specs, slug, "status.md");
    if (!existsSync(lock) || !existsSync(status)) continue;
    const text = readFileSync(status, "utf8");
    const stage = /^stage:\s*(\S+)/m.exec(text)?.[1];
    if (!LOCKED_STAGES.has(stage)) continue;
    const unattended = /^run:\s*unattended\b/m.test(text);

    const locked = readFileSync(lock, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => norm(join(root, l)));
    if (file === norm(lock) || locked.includes(file)) {
      const what = `${target} is a locked acceptance test of spec "${slug}" (stage ${stage}). `;
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: unattended ? "deny" : "ask",
          permissionDecisionReason: unattended
            ? what + "This is an unattended run: park it (stage: parked, say why the test " +
              "looks wrong under Where to resume) and print FACTORY RUN PARKED."
            : what + "Change the spec first and say why the test is wrong; the user approves this edit.",
        },
      };
    }
  }
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const out = main(JSON.parse(raw || "{}"));
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    // Never block a session on a hook bug.
  }
  process.exit(0);
});
