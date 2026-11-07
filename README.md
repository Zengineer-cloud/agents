# agents — one clean scaffold for agentic development

[![test](https://github.com/cleverfakealias/agents/actions/workflows/test.yml/badge.svg)](https://github.com/cleverfakealias/agents/actions/workflows/test.yml)

A single, condensed project scaffold for AI-assisted coding, built on
June-2026 best practices. Claude Code–native, with `AGENTS.md` as the
cross-tool contract so Cursor, Codex, Copilot, Devin, and friends read the
same rules.

The premise: don't make the agent remember standards — **automate them**.
Hooks format, lint, and test automatically; skills carry the language
conventions; permissions and guard hooks enforce security policy.

The guard hooks are a best-effort layer. They pattern-match commands and URLs
and can be bypassed. The OS sandbox in `settings.local.json` is the real
security boundary.

## What's in the box

```
scaffold/                      ← copy this into your repo
├── AGENTS.md                  cross-tool contract (fill in the placeholders)
├── CLAUDE.md                  @AGENTS.md import + Claude-specific notes
└── .claude/
    ├── settings.json          permissions (secret-read denials, no force-push,
    │                          no publish) + hook wiring
    ├── hooks/
    │   ├── spec-gate.mjs            UserPromptSubmit: Zenn-mode nudge — impl prompts
    │   │                            with no spec get a firm (never blocking) spec-first nudge
    │   ├── format-and-lint.mjs      PostToolUse: ruff / biome / stylua+selene on
    │   │                            every file Claude edits; unfixable issues are
    │   │                            fed back to Claude to fix
    │   ├── run-tests-on-stop.mjs    Stop: typecheck + tests for files changed this
    │   │                            session (pytest / tsc+vitest / busted); failures
    │   │                            block Claude from finishing until fixed
    │   ├── block-secret-writes.mjs  PreToolUse: no writes to .env/keys/creds or
    │   │                            policy files (.claude/settings, hooks, .mcp.json)
    │   ├── block-destructive-bash.mjs PreToolUse: no rm -rf /, force push, curl|sh;
    │   │                            no shell reads of secrets (cat .env, ~/.ssh —
    │   │                            the Bash bypass of Read deny rules); no env
    │   │                            dumps; no policy-file edits; npx/uvx/pnpm-dlx
    │   │                            gated to allowed-run-packages.txt
    │   ├── webfetch-allowlist.mjs   PreToolUse: WebFetch only to domains in
    │   │                            allowed-domains.txt (prompt-injection front door)
    │   ├── cleanup-worktrees.mjs    SessionStart + Stop: commit each .claude/worktrees
    │   │                            worktree's WIP onto its branch (secrets excluded),
    │   │                            then remove the worktree — work is kept on a branch
    │   │                            to resume later, so worktree dirs never pile up
    │   └── allowed-domains.txt / allowed-run-packages.txt   human-edited allowlists
    ├── skills/
    │   ├── python-standards/        uv + ruff + pytest + typing + security
    │   ├── typescript-standards/    pnpm + biome + tsc + vitest + security
    │   ├── lua-standards/           stylua + selene + busted + LuaLS + security
    │   ├── zenn-mode/               intent-driven dev (spec → blueprint → tasks → state)
    │   ├── security-review/         OWASP-agentic-aware review checklist
    │   └── commit-and-push/         user-invoked only; scans for secrets first
    ├── commands/
    │   ├── zenn.md                  /zenn — activate Zenn mode explicitly
    │   └── spec.md                  /spec — generic spec-and-test-driven cycle
    ├── agents/
    │   └── security-reviewer.md     read-only audit subagent
    └── settings.local.json.example  OS sandbox + network allowlist (copy to
                                     settings.local.json — the real boundary)
providers.md                   ← gotchas for Cursor / Copilot / Codex / Gemini / Devin
```

## Setup

### 1. Copy the scaffold into your repo

```bash
cp -r /path/to/agents/scaffold/. /path/to/your-repo/
cd /path/to/your-repo
```

(`cp -r scaffold/.` — the trailing `/.` matters: it copies the *contents*,
including the dot-directories.) The hooks are Node scripts (`.mjs`) invoked via
`node`, so they run identically on Windows, macOS, and Linux — Node on PATH is
the only requirement (no exec bit, no Git Bash).

### 2. Fill in AGENTS.md

Open `AGENTS.md` and replace every `<!-- placeholder -->`: project name,
purpose, stack. In the **Commands** block, keep only the language sections you
use and make the commands real (they're what every agent will run). Add any
off-limits paths under **Boundaries**.

### 3. Gitignore the local settings file

```bash
echo ".claude/settings.local.json" >> .gitignore
```

`settings.json` (shared policy) is committed; `settings.local.json`
(per-machine) is not.

### 4. Enable the OS sandbox (recommended)

```bash
cp .claude/settings.local.json.example .claude/settings.local.json
```

Then edit the `network.allowedDomains` list for whatever registries/APIs your
project actually needs. This is the layer that actually enforces the security
policy — hooks and deny rules are advisory layers above it.

### 5. Tune the allowlists (optional)

- `.claude/hooks/allowed-domains.txt` — domains Claude may WebFetch.
- `.claude/hooks/allowed-run-packages.txt` — packages runnable via
  `npx`/`uvx`/`pnpm dlx`.

Edit these by hand as needs come up; the agent is deliberately blocked from
editing them itself.

### 6. Verify it works

Open Claude Code in the repo and ask it to make a small change to a Python,
TS, or Lua file. You should see: the file comes back formatted; lint problems
get fixed without being asked; and when Claude finishes, the test suite runs
for whatever changed. Then ask it to `cat .env` — it should refuse with a
hook message. That's the whole system working.

### Day-to-day

- Hooks self-disable when a tool isn't installed (no ruff → Python hook
  no-ops), so the scaffold drops into Python-only, TS-only, mixed, or
  greenfield repos unchanged.
- `CLAUDE_SKIP_STOP_TESTS=1 claude` skips the test-on-stop hook for a session.
- **Worktrees are disposable; the work isn't.** Anything under `.claude/worktrees/`
  is treated as scratch. On session start/stop the `cleanup-worktrees` hook commits
  each worktree's uncommitted work onto its branch as a `chore(wip):` commit (secrets
  like `.env`/keys are never committed), then removes the worktree. Resume later with
  `git worktree add .claude/worktrees/<name> <branch>` (and `git reset --soft HEAD~1`
  if you'd rather un-WIP the commit). Escape hatches: `CLAUDE_WORKTREE_NO_AUTOCOMMIT=1`
  keeps dirty worktrees in place and only reports them; `CLAUDE_SKIP_WORKTREE_CLEANUP=1`
  disables the hook entirely.
- `/security-review` before merging significant changes; `/commit-and-push`
  for guarded commits.
- `/zenn` or `/spec` to start intent-driven work; the spec-gate hook nudges you
  there automatically. `CLAUDE_SKIP_SPEC_GATE=1 claude` turns the nudge off.
- Using another agent? `AGENTS.md` is read natively by almost everything —
  see [providers.md](providers.md) for per-tool setup and gotchas.

## Testing the hooks

The security hooks have tests that run with Node's built-in test runner. No
install step is needed.

```bash
node --test 'scaffold/.claude/hooks/tests/*.test.mjs'
```

Each test spawns a hook with a tool payload on stdin and checks the exit code
(0 allows, 2 blocks). CI runs the same command on every push and pull request.

## Toolchain assumptions (June 2026)

Python: **uv** + **ruff 0.15** + **pytest 9** (mypy/pyright as typecheck gate; ty when stable).
TypeScript: **pnpm 11** + **Biome 2.4** + **tsc --noEmit** (tsgo as drop-in) + **vitest**.
Lua: **StyLua 2.x** + **selene** (luacheck legacy) + **busted** (LuaLS `--check` advisory).
Hooks: **Node** (`.mjs`, run via `node`) — cross-platform, the one runtime the scaffold itself requires.
Security: layered — deny rules (first line), guard hooks (reliable enforcement:
secret reads/writes, destructive commands, policy-file self-modification, WebFetch
domain allowlist, npx/uvx gating), OS sandbox with network allowlist (real
boundary). Plus: `disableBypassPermissionsMode`, lockfile-frozen installs,
dependency cooldowns left on, external content treated as untrusted (OWASP
Agentic Top 10).

Older multi-provider scaffolds (Claude/Copilot/Cursor/Gemini/Codex/Windsurf,
plus the legacy `.agents/` system) live in git history before June 2026.

## License

MIT. See [LICENSE](LICENSE).
