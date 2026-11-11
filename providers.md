# Other providers — pointers and gotchas (November 2026)

The scaffold is Claude Code–native, but `scaffold/AGENTS.md` is the cross-tool
contract: it's read natively by nearly every other agent. This file is the short
list of what each tool needs and what bites people. Verify against the linked
docs before relying on details — this surface changes monthly.

## AGENTS.md (the standard)

Stewarded by the Agentic AI Foundation under the Linux Foundation; spec at
[agents.md](https://agents.md). Plain Markdown, no required fields,
nearest-file-wins in monorepos. Read natively by Codex, Cursor, Copilot,
VS Code, Antigravity, Devin, Zed, Warp, and most others.

- **Claude Code reads it natively (v2.1.277+), but only when no `CLAUDE.md`
  exists** in the working directory or above. The scaffold ships a `CLAUDE.md`,
  so it imports `@AGENTS.md` explicitly.
  ([docs](https://code.claude.com/docs/en/memory#agents-md))
- **Gemini CLI does NOT read it by default** — needs opt-in config (below).
- "Supports AGENTS.md" varies: nested-file handling, layering, and caps differ
  per tool. Don't assume uniform behavior.
- **Skills have a shared path too.** Codex, Antigravity and Gemini CLI read
  `.agents/skills/<name>/SKILL.md`. Claude Code reads `.claude/skills/`. To
  share the scaffold's skill, copy `.claude/skills/zenn` to
  `.agents/skills/zenn`. Only `name` and `description` are portable frontmatter.

## Cursor

- Reads `AGENTS.md` natively, including nested ones (nearest wins). Rules live
  in `.cursor/rules/*.mdc`; root `.cursorrules` is legacy — migrate off it.
- A plain `.md` dropped into `.cursor/rules/` is silently ignored (needs `.mdc`
  frontmatter). Put plain markdown guidance in AGENTS.md instead.
- Since 2.4, Cursor has Agent Skills (`SKILL.md`), hooks (`beforeSubmitPrompt`,
  `PreToolUse`, `PostToolUse`, `stop`) and **Claude Code hook compatibility in
  its CLI** — this scaffold's hooks may work there; test before trusting.
- Docs: [cursor.com/docs/rules](https://cursor.com/docs/rules)

## GitHub Copilot

- Three layers: `.github/copilot-instructions.md` (repo-wide, all surfaces),
  `.github/instructions/*.instructions.md` (path-scoped via `applyTo:` glob),
  and `AGENTS.md` (nearest-wins).
- In VS Code, AGENTS.md files **outside the workspace root are off by default**.
- JetBrains/Xcode/Eclipse Copilot read only `.github/copilot-instructions.md`.
- Coding-agent environment setup: `.github/workflows/copilot-setup-steps.yml`.
- Docs: [Repository custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)

## OpenAI Codex

- The docs moved: `developers.openai.com/codex/*` now redirects to
  `learn.chatgpt.com/docs/*`.
- Most elaborate AGENTS.md handling: global (`~/.codex/AGENTS.md`) → root →
  nested, concatenated root-first. **Silent 32 KiB combined cap**
  (`project_doc_max_bytes`): Codex stops adding files at the limit.
- An `AGENTS.override.md` in a directory replaces the `AGENTS.md` beside it —
  a classic "why is it ignoring my instructions" bug.
- **Code review** (`@codex review`, `/review`) reads a `## Code Review Rules`
  section in AGENTS.md. The scaffold's section points at `REVIEW.md`.
- Skills live in `.agents/skills/<name>/SKILL.md` (repo) and
  `~/.agents/skills/` (user), with `name` and `description` frontmatter.
  Codex-only metadata goes in `agents/openai.yaml`, not in frontmatter.
- Hooks use the Claude Code shape (`matcher`, `hooks[]`, `type: "command"`,
  exit 2 blocks) in `.codex/hooks.json`, for trusted projects, after a `/hooks`
  review. `PreToolUse` has no `ask` decision, and `prompt` and `agent` hook
  types are skipped. Test this scaffold's hooks there before trusting them.
- Subagents are TOML files in `.codex/agents/` (`name`, `description`,
  `developer_instructions`). Markdown agents from `.claude/agents/` don't load.
- Project config is `.codex/config.toml`, read only in trusted projects.
  `[profiles.*]` tables and `approval_policy = "untrusted"` are gone.
- OpenAI's prompting guides say newer models follow AGENTS.md and skills more
  literally: remove repeated rules, and keep "always" and "never" for true
  invariants.
- Docs: [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
  [skills](https://learn.chatgpt.com/docs/build-skills),
  [hooks](https://learn.chatgpt.com/docs/hooks),
  [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## Google Antigravity

- Google's main coding agent since mid-2026 (the app, and the `agy` CLI). It
  replaced Gemini CLI for consumer plans, and **Jules ends new sessions on
  2026-11-11**.
- Reads `AGENTS.md` and `GEMINI.md` natively, from the workspace up to the repo
  root. Nested files below the workspace are not loaded.
- **Truncates each file at 24,000 bytes**, and always-on rules share a
  20,000-token budget.
- Rules in `.agents/rules/*.md` need a `trigger` frontmatter (`always_on`,
  `model_decision`, `glob`, `manual`). A file without it is silently dropped.
- Skills: `.agents/skills/<name>/SKILL.md`; each also becomes `/<name>`.
  Workflows are deprecated in favor of skills.
- Hooks: `.agents/hooks.json` with `PreToolUse`, `PostToolUse`, `Stop` and
  others, but a different payload (camelCase, other tool names). This
  scaffold's hooks do not run there as they are.
- Docs: [rules](https://antigravity.google/docs/rules),
  [skills](https://antigravity.google/docs/skills),
  [hooks](https://antigravity.google/docs/hooks/)

## Gemini CLI

- Since 2026-06-18 it serves only Code Assist Standard/Enterprise licenses and
  paid API keys. Everyone else moved to Antigravity CLI.
- Default context file is `GEMINI.md`. To use AGENTS.md, set
  `{"context": {"fileName": ["AGENTS.md", "GEMINI.md"]}}` in
  `.gemini/settings.json` — note the setting **replaces** the default, so keep
  `"GEMINI.md"` in the array.
- Skills: `.gemini/skills/` or `.agents/skills/`. Subagents:
  `.gemini/agents/*.md`. Custom commands are TOML under `.gemini/commands/`.
- Hooks use other event names (`BeforeTool`, `AfterTool`, `AfterAgent`) with
  the same exit codes as Claude Code (2 blocks).
- `/memory show` displays the exact concatenated context — use it to verify
  what actually loaded.
- Docs: [geminicli.com/docs](https://geminicli.com/docs/)

## Devin Desktop (formerly Windsurf)

- Windsurf became Devin Desktop in June 2026 (Cognition); the bundled agent is
  Devin Local, Cascade is being phased out.
- Reads AGENTS.md; `.windsurfrules` is legacy — don't create it for new
  projects. Three generations of ignore files coexist (`.devinignore`,
  `.windsurfignore`, `.codeiumignore`).
- Docs links in this ecosystem rot fast; start from the
  [changelog](https://windsurf.com/changelog).
