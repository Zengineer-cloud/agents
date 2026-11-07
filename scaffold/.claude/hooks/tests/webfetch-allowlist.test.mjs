import assert from "node:assert/strict";
import { test } from "node:test";
import { runHook } from "./helpers.mjs";

const fetch = (url, env) => runHook("webfetch-allowlist.mjs", { url }, env);

const allowed = [
  "https://docs.python.org/3/",
  "https://github.com/cleverfakealias/agents",
  "https://api.github.com/repos", // subdomain of an allowed domain
  "https://GITHUB.COM./", // case and trailing dot are normalized
];

const denied = [
  "https://evil.com#.github.com", // fragment is not part of the host
  "https://github.com@evil.com", // userinfo is not part of the host
  "https://evil.com\\@github.com", // backslash is a path separator in WHATWG URLs
  "https://evilgithub.com/", // suffix match must be on a dot boundary
  "https://github.com.evil.com/",
  "file:///etc/passwd",
  "not a url",
];

for (const url of allowed) {
  test(`allows ${url}`, () => {
    assert.equal(fetch(url).code, 0);
  });
}

for (const url of denied) {
  test(`denies ${url}`, () => {
    const { code, stderr } = fetch(url);
    assert.equal(code, 2);
    assert.match(stderr, /blocked/);
  });
}

test("fails closed when the allowlist file is missing", () => {
  const { code, stderr } = fetch("https://github.com/", { CLAUDE_PROJECT_DIR: "/nonexistent" });
  assert.equal(code, 2);
  assert.match(stderr, /allowlist missing/);
});
