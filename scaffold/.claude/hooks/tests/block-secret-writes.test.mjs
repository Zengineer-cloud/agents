import assert from "node:assert/strict";
import { test } from "node:test";
import { runHook } from "./helpers.mjs";

const write = (file_path) => runHook("block-secret-writes.mjs", { file_path });

const denied = [
  ".env",
  "/repo/.env.local",
  "config/secrets.yaml",
  "certs/server.pem",
  "/home/me/.ssh/id_ed25519",
  ".npmrc",
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/hooks/block-destructive-bash.mjs",
  ".mcp.json",
  ".git/config",
  "C:\\repo\\.env", // Windows separators are normalized
];

const allowed = [".env.example", "src/index.ts", "README.md", "docs/environment.md"];

for (const path of denied) {
  test(`denies write to ${path}`, () => {
    const { code, stderr } = write(path);
    assert.equal(code, 2);
    assert.match(stderr, /blocked/);
  });
}

for (const path of allowed) {
  test(`allows write to ${path}`, () => {
    assert.equal(write(path).code, 0);
  });
}
