# agents — a clean starting point for agentic development

A small, language-neutral scaffold you copy into a repo so coding agents start
with sensible guardrails. It is Claude Code–native, with `AGENTS.md` as the
cross-tool contract that Cursor, Codex, Copilot, and others read too.

It is deliberately small. It leans on Claude Code's built-in controls where they
exist, and adds one hook for the part that has to be project-specific: running
your formatter and your tests.

## What's in the box

```
scaffold/                 ← copy this into your repo
├── AGENTS.md             project facts, commands, conventions, security (fill in)
├── CLAUDE.md             imports AGENTS.md, plus a few Claude-specific notes
├── REVIEW.md             what code review reports and skips (managed Code Review, factory)
├── .gitignore            lines to add to yours
└── .claude/
    ├── settings.json     permission rules and hook wiring
    ├── hooks/
    │   ├── checks.mjs    runs your formatter after edits, your tests before Claude finishes
    │   └── checks.json   the commands it runs (empty until you fill it in)
    └── skills/zenn/      /zenn: optional spec-first workflow for larger work
providers.md              notes for Cursor / Copilot / Codex / Antigravity / Gemini CLI / Devin
mods/                     user-level Claude Code mods (see mods/README.md)
factory/                  plugin: spec → build → review → ship, with gates (see factory/README.md)
tests/                    node --test "tests/*.test.mjs": the hook, the scaffold rules, the mods
```

## Setup

### 1. Copy the scaffold into your repo

```bash
cp -r /path/to/agents/scaffold/. /path/to/your-repo/
```

The trailing `/.` copies the contents, including the dot-directories. If the repo
already has a `.gitignore`, `AGENTS.md`, or `CLAUDE.md`, merge those by hand
instead of overwriting them. Node on `PATH` is the only requirement.

### 2. Fill in AGENTS.md

Replace each `<!-- placeholder -->` with the project's name, stack, and real
commands, and delete the sections you don't need. Under **Language notes**, keep
the blocks for the languages the repo uses (Python, Java, TypeScript) and delete
the rest. **Conventions** and **Tests** hold the rules that keep agents from
padding a change, hiding errors, and writing tests that prove nothing.

### 3. Tell the checks hook what to run

Edit `.claude/hooks/checks.json`. Both lists are empty by default, which turns
the hook off.

```json
{
  "format": {
    "py": "ruff format {file}",
    "ts,tsx,js": "npx --no-install prettier --write {file}"
  },
  "verify": ["pytest -q"]
}
```

- `format` maps file extensions to a command that runs after Claude edits a file
  of that type. `{file}` is the edited file's path, already quoted. If the command
  fails, its output goes back to Claude to fix.
- `verify` commands run when Claude finishes a turn in which it edited files.
  If one fails, Claude gets the output and keeps working. The hook blocks once
  per turn, so Claude can never loop on it, and it runs again at the end of the
  next turn until the commands pass.
- Commands run from the repo root. A command whose tool isn't installed is
  skipped. `CLAUDE_SKIP_CHECKS=1 claude` turns the hook off for a session.

### 4. Turn on the OS sandbox (optional)

On macOS, Linux, or WSL2, run `/sandbox` in Claude Code. It confines shell
commands to the project directory and to network hosts you approve. The secret
paths denied in `settings.json` apply inside the sandbox too.

## How the guardrails work

| Layer | What it covers |
| :- | :- |
| `deny` rules | Secrets are never read or written: `.env*`, `.dev.vars*`, key files, `~/.ssh`, `~/.gnupg`, cloud credentials (AWS, GCP, Azure, Kubernetes), tool and registry credentials (GitHub CLI, Docker, npm, PyPI, RubyGems, `~/.git-credentials`, `~/.netrc`). `.env.example` stays usable. Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `*.lock`, `*.lockb`, `go.sum`) are not read either: they are large, and they only change through the package manager. |
| File search | `settings.json` sets `CLAUDE_CODE_GLOB_NO_IGNORE=false`, so Claude's file search respects `.gitignore`. By default it also lists ignored files such as `node_modules` and build output. |
| `ask` rules | A person approves `git push`, `git reset --hard`, `git clean`, `gh pr merge`, CI workflow edits, and any command retried outside the sandbox. These prompt in every permission mode, including auto. |
| Built into Claude Code | Writes to `.claude/`, `.git/`, `.mcp.json`, and shell startup files are never auto-approved. `rm -rf` on the project, home, or root is always stopped. `settings.json` also disables bypass-permissions mode. |
| Checks hook | Your formatter and tests run without anyone remembering to. |
| `AGENTS.md` | Conventions and intent. It shapes what agents try; it enforces nothing. |

There are no `allow` rules: nothing is pre-approved. Claude Code already runs
read-only commands without asking, and saves your own "don't ask again" choices to
`.claude/settings.local.json`.

No permission mode is pinned either. Use Manual, auto, or plan as you prefer; the
deny and ask rules hold in all of them.

## Limits worth knowing

- **Shell rules match the command as written.** `Bash(git push *)` catches
  `git push origin main` but not `git -C . push`. The rules stop the usual form,
  not a determined workaround. For anything that must never happen, protect the
  branch on the remote.
- **Read rules don't see inside scripts.** They cover Claude's file tools and
  common shell readers such as `cat`. A script that opens a file itself is only
  stopped by the OS sandbox.
- **The sandbox doesn't run on native Windows.** Use WSL2 or a dev container
  there if you need real isolation.
- **`*.pem` and `*.key` are denied wholesale.** Delete those two lines from
  `settings.json` if your repo keeps non-secret files with those extensions.
- **Lockfiles can't be read.** To check a resolved version, ask the package
  manager (`npm ls <pkg>`, `pnpm why <pkg>`), or delete the lockfile lines from
  `settings.json`.

## User-level mods

`mods/` holds Claude Code mods that load into every session on the machine,
whatever repo it runs in, the Desktop Code tab included. Each one fixes friction
that kept repeating across real sessions:

| Mod | In short |
| :- | :- |
| `shell-sense` | Denies shell commands that are certain to fail on Windows, and says what works instead. |
| `package-gate` | Asks you before any package install, with a registry link per package. |
| `secret-shield` | Keeps secret files and token values out of shell reads and the transcript. |
| `repo-lock` | Denies dependency changes with the wrong package manager or from the wrong folder. |
| `context-meter` | A band above the prompt: context fill against quality marks (30% fading, 40% "dumb zone"), rate limits, and model and effort switchers. |
| `session-context` | Tells Claude the repo, branch and uncommitted work with each prompt. |

Setup, the full behaviour of each, and how to work on them:
[mods/README.md](mods/README.md).

## Software factory

`factory/` is a Claude Code plugin that takes one feature from your
description to production: `/factory:spec` interviews you and writes a
testable spec, `/factory:build` writes failing tests first and then the code,
`/factory:review` runs independent reviewers and refutes weak findings, and
`/factory:ship` opens the PR, checks CI and the preview, and records lessons.
You approve the spec, merge, and approve production. It builds on this
scaffold (AGENTS.md commands, the checks hook, the permission rules). Design,
setup and research: [factory/README.md](factory/README.md).

## Working on this repo

```bash
node --test "tests/*.test.mjs"
```

The tests exercise `checks.mjs`, enforce the scaffold's own rules (file size
limits, valid hook paths, rule syntax), and check that the mods' shared files
match. Each mod also has its own tests: `claude plugin test mods/<name>`.
Using another agent? See
[providers.md](providers.md).

Earlier versions (per-language standards skills, command-guard hooks, the
multi-provider scaffolds) live in git history.

## License

MIT. See [LICENSE](LICENSE).
