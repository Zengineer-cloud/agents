// Shared helper: run a hook script the way Claude Code does, with the tool
// payload as JSON on stdin and CLAUDE_PROJECT_DIR pointing at the scaffold.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = join(dirname(fileURLToPath(import.meta.url)), "..");
export const scaffoldDir = join(hooksDir, "..", "..");

export function runHook(hook, toolInput, env = {}) {
  const result = spawnSync(process.execPath, [join(hooksDir, hook)], {
    input: JSON.stringify({ tool_input: toolInput }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: scaffoldDir, ...env },
    encoding: "utf8",
  });
  return { code: result.status, stderr: result.stderr };
}
