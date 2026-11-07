# AGENTS.md — working on this repo

This repo is a single, condensed agent scaffold (`scaffold/`) plus a short
per-provider reference (`providers.md`). The scaffold is a **template** — it is
copied into target repos, never executed here. `mods/` holds user-level mods,
and `factory/` is the software factory plugin (spec, build, review, ship). Its
skills follow the same ≤90-line limit.

## Rules

- Ground every change in current official docs — agent tooling changes monthly,
  and hallucinated config fields are the #1 failure mode. Cite the doc URL in
  the commit body.
- Keep it condensed. New files need to earn their place; prefer editing an
  existing file over adding one. `scaffold/AGENTS.md` stays ≤150 lines,
  `scaffold/CLAUDE.md` ≤50, skills ≤90.
- Placeholders are HTML comments (`<!-- ... -->`); substitution replaces the
  whole comment. No realistic-looking secrets anywhere — use `EXAMPLE_API_KEY`.
- Hook scripts are cross-platform Node (`.mjs`, run via `node`) and must pass
  `node --check`, handle missing tools gracefully (exit 0, never crash the
  session), and only exit 2 with actionable stderr.
- Keep the scaffold language-neutral and light on prescription. Prefer Claude
  Code's built-in controls (permission rules, protected paths, sandbox) over
  custom hooks that match command text.
- One logical change per commit, conventional commit messages.

## Tests

`node --test "tests/*.test.mjs"` exercises `checks.mjs`, enforces the rules above (size limits,
hook paths, rule syntax), and runs `claude plugin validate` and `claude plugin test`
on each mod in `mods/`. Run it before committing. CI runs it on every pull request,
without the claude CLI, so the plugin cases skip there.

## Smoke test

Copy `scaffold/.` into a sample repo, fill in `.claude/hooks/checks.json`, open
Claude Code, edit a file, and verify: the format command fires, the Stop hook
runs the verify commands, `.env` can't be read, and `git push` asks first.
