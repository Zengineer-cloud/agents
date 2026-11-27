# mods

User-level Claude Code mods: plugins of function hooks that load into every
session on this machine, whatever repo it runs in. The scaffold (`../scaffold`)
sets each repo's rules; these mods fix the friction that repeats across all of
them. Each one came out of an audit of 65 real sessions (2026-07 to 2026-10).

| Mod | What it does | Why |
| :- | :- | :- |
| `shell-sense` | Denies shell mistakes that are certain to fail on Windows: long heredocs, inline scripts that edit files, `pwsh`, `tar C:`, PowerShell 5.1's missing `??` `?.` `&&`, here-string commit messages with quotes. Notes likely ones (backslash paths in Bash, `2>&1` in PowerShell). | 40+ shell failures and 30+ fragile script edits |
| `package-gate` | Asks you before any package install (npm, pnpm, yarn, bun, npx, dlx, pip, uv, pipx, cargo, go, gem, winget, choco, scoop, PowerShell Gallery), with a registry link per package. Also asks when an Edit or Write adds a dependency to `package.json` or `requirements*.txt`. Lockfile restores (`npm ci`, `pnpm install`, `pip install -r`) pass. Redirects and shell variables (`*> $null`, `2>$null`) are never read as package names. | Nothing gets installed without you looking at it first |
| `secret-shield` | Denies shell reads of secret files (Read deny rules don't cover Bash), denies full env dumps, hides token values in tool output before the transcript keeps them, and checks `git add -A` and `git push` for secret files. Source code that only names a secret (`secret: string`, `Promise<string>`, `MAX_RESPONSE_TOKENS`) stays readable; a quoted value, or one with digits, is still hidden. | A live Twitch token and Sanity/Turnstile secrets ended up in transcripts |
| `repo-lock` | Denies dependency changes with the wrong package manager, or from a folder with no lockfile (the parent `Z:\github_projects`). Shows `repo · package manager · branch`: in the status line, and as a dim line above the prompt in the Desktop Code tab, which draws no plugin status lines. | Wrong cwd and npm-vs-pnpm mix-ups in 15+ sessions |
| `context-meter` | A band above the prompt that warns on quality, not capacity, in tokens: amber from 200k ("quality fading"), red from 350k ("dumb zone"), where the Handoff button turns solid. Each mark is the smaller of that count and a share of the window (35%, 50%), so a 200k window warns at 70k and turns the button solid at 100k. The marks sit a little above the 2025-2026 long-context results (recall bends near 128k-256k). The handoff never runs on its own: the person presses Handoff or types `/handoff`. Then Claude writes a state doc to `.claude/handoff/` (the folder ignores itself), the session runs `/clear` (or `/compact` with the doc named, where `/clear` is refused), and Claude reads the doc back, checks it against the repo, and waits. The engine's own autocompact is held while there is room, with one toast per context (not a second time in one turn, nor after a failed turn: then the request itself is too long). A prompt typed during the handoff tells Claude to add to the doc. The handoff touches nothing outside its own chat: the read-back it owes across the `/clear` lives in the module, which the process keeps, never in `$.store` (one file shared by every open chat of every project). Research behind the marks: `context-meter/docs/`. Desktop and VS Code draw two lines: the token figures as text with a thin bar each (the context, with ticks at the two marks, then the 5h and 7d limits), and under them the zone, growth and turns to the next mark. The terminal draws one row. Every figure is real text, which the surface sizes, wraps and reads aloud; an image holds only a bar. The bar colors keep 3:1 contrast on light and dark backgrounds (a test checks each one), and each zone has its own shape (● ▲ ■) beside its name, so nothing depends on color alone. Under it, a model radio group (from the `/config` model row, always the 1M variant where a family has one), an effort slider, and a Handoff button: quiet before the dumb zone, a button inside it, and `/handoff` as a typed command, so a natural break can take it early. A refused command shows a toast. A session that loaded a smaller window than the model has (an old `autoCompactWindow`) says so in a row under the card; the handoff keeps that process and its window, only a new chat loads the model's own. Details (or `d` while focused) opens four titled sections. Context: the zone, growth per turn, the baseline every turn pays (prompt, tools, memory), a row and a bar per part of the `/context` breakdown, and the largest memory files. Cache: the share of the last request and of the whole session that the prompt cache served (read, written, new), the cache lifetime, and the time left before an idle cache expires. Limits: each rate limit with its reset time. Session: cost and the warning signs. Rows with no data (cost, limits) are left out. The cache lifetime is read off the plan (an hour on a subscription seat, five minutes on API or cloud-provider billing); the `cacheTtlMinutes` option sets it by hand. | Long sessions that drifted into poor answers, cost, or compaction loops |
| `session-context` | With each typed prompt, Claude also reads one line: repo, package manager, branch, uncommitted work, upstream. It is sent only when it changed. The first prompt also gets the last 3 commits and the newest `specs/` status note. `/where` shows the same to you. In the parent folder it lists the repos and the absolute-cd rule. | "Where did we leave off?" (5+ times) and commands run in the wrong folder |

Rules are deliberately narrow: a deny names the fix, so the next try works.
The mods are steering, not a security boundary; the permission rules in each
repo's `.claude/settings.json` and the OS sandbox are that.

## Load them in every session

Add the mod folders to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of
`~/.claude/settings.json` (paths separated by `;` on Windows):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "Z:/github_projects/agents/mods/shell-sense;Z:/github_projects/agents/mods/package-gate;Z:/github_projects/agents/mods/secret-shield;Z:/github_projects/agents/mods/repo-lock;Z:/github_projects/agents/mods/context-meter;Z:/github_projects/agents/mods/session-context",
    "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
  }
}
```

`CLAUDE_CODE_PLUGIN_DIR_WATCH=1` makes sessions that are already open, the
Desktop app's included, reload a mod when you save it. Without it, an edit
reaches new sessions only.

For one session only: `claude --plugin-dir mods/shell-sense --plugin-dir ...`.

## Work on them

Each mod is `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts`
(the hooks, which pass `$` only to functions declared in that file; `.tsx` where
it draws UI, as `context-meter` does), and
`hooks/rules.ts` (pure logic the tests import). `package-gate`, `repo-lock` and
`secret-shield` also hold `hooks/shell.ts`, the shell tokenizer they share: change
one copy, then copy it over the other two. `tests/mods.test.mjs` fails while they differ.

```bash
claude plugin validate mods/<name>    # what the engine would load or refuse
claude plugin test mods/<name>        # runs tests/*.test.ts against the engine
```

Type-check: run `/plugin-types mods/.types` in Claude Code once per Claude Code
update (it writes the API declarations, gitignored), then `tsc -p mods`.

Things that cost a debugging round:

- The Desktop Code tab draws no `$.ui.status` lines. Use an `AbovePrompt` band
  (`ui.render`) for anything that must stay on screen there.
- The engine heads each `$.ui.toast` with the plugin's name; don't add it again.
- `'Svg' in $.ui.resolve(e)` is true on the terminal too. Branch on `e.surface`.
- Never name a local `h` (the JSX factory) or `next` inside a hook (the engine
  refuses a shadowed continuation at load).
- Model and effort changes made through `$.command.run` (`/model`, `/effort`)
  apply to the session, but the Desktop app's own picker does not follow them.
- A `types/index.d.ts` contract exports types and nothing else: an `export {}`
  makes the validator skip the file, and every atom then reads "not declared".
  `tsc -p mods` reads these files through the `*/types` include.
- `$.prompt.submit` is refused inside a `command.run` hook (it would wait on the
  turn the hook holds). Submit from `$.clock.after(0, ...)` instead.
