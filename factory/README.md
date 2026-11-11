# factory

A Claude Code plugin that runs one feature at a time through a small software
factory: you explain what you want, agents write the spec, build it test-first,
review it, and ship it. A person decides at every gate.

```
 you ──► /factory:spec ──► /factory:build ──► /factory:review ──► /factory:ship ──► live
          │ interview        │ test-author       │ 5 lenses          │ PR + CI
          │ spec-critic      │ one task/commit   │ refute each       │ preview + smoke
          ▼                  │ verifier          ▼ finding           ▼ lessons
       GATE: approve      GATE: verifier PASS  GATE: accept     GATE: merge, prod
```

Every stage reads and writes `specs/<slug>/` in the target repo:

| File | Written by | Holds |
| :- | :- | :- |
| `requirements.md` | spec | problem, goals, non-goals, EARS acceptance criteria (AC-n) |
| `plan.md` | spec | design, interfaces, files, AC-to-test table, risks, deploy |
| `tasks.md` | spec, build | ordered tasks, one commit each, `[P]` when parallel-safe |
| `status.md` | every stage | `stage:`, branch, PR, preview, decisions, log, lessons |

`status.md` is the handoff: a fresh session reads it and continues. The
`session-context` mod already shows the newest one at session start.

## What is in the plugin

| Part | Kind | Job |
| :- | :- | :- |
| `factory` | skill | entry point: lists specs and their stage, routes to the next stage |
| `spec` | skill | interview, write the four files, critique, ask for approval |
| `build` | skill | branch, tests first, one task per commit, independent verify |
| `review` | skill | run the review workflow, fix confirmed findings, re-verify |
| `ship` | skill | push, PR, CI, preview and smoke check, hand over merge and prod, lessons |
| `spec-critic` | agent | read-only check of a spec for untestable, vague or missing parts |
| `test-author` | agent | writes the failing acceptance tests from the ACs only |
| `verifier` | agent | read-only: runs the checks, maps each AC to evidence, finds weakened tests |
| `factory-review` | workflow | five read-only review lenses, then one skeptic per finding |
| `test-lock` | hook | asks the user before an edit to a locked acceptance test (`specs/<slug>/tests.lock`) during build, review and ship; denies it in an unattended run |
| `evals/` | plugin evals | cases that check the stage skills behave: quick fixes skip the factory, spec stops at the gate, build and unattended runs refuse a spec that is not approved |

## Design choices

- **The spec is the contract.** Acceptance criteria in EARS form, each mapped
  to a test before code exists. Code and spec never drift: the spec changes
  first.
- **Makers never grade their own work.** One agent writes the tests, the main
  session writes the code, a third agent verifies, and review findings must
  survive a skeptic. This is the main defense against reward hacking.
- **Small, green steps.** One task per commit, checks after every edit (the
  scaffold's `checks.mjs`), so a bad step is cheap to undo.
- **Files over memory.** All state lives in `specs/<slug>/` and git, so a
  session can end at any point and another can resume.
- **People own the irreversible steps.** Spec approval, merge, and production
  deploy. Push asks once per feature. The plugin's one hook guards the
  acceptance tests; everything else comes from the scaffold's permission
  rules and the user-level mods.
- **Review scales to risk.** Each spec states low, medium or high risk. Low
  gets `/code-review medium`; medium and high get the review workflow; high
  also gets `/security-review` and a list of files for a person to read.
  The target repo's `REVIEW.md` sets what every review reports and skips.
- **Unattended runs are opt-in.** After spec approval, `/factory` can print a
  `/goal` line (in session, auto mode) or a headless `claude -p` command with
  a cost cap. Build and review then run without questions. Anything that
  would need a person parks the run. It ends at a reviewed local branch, and
  ship stays attended.
  WARNING: on native Windows an unattended run has no OS sandbox, because the
  sandbox supports only macOS, Linux and WSL2. The permission rules and auto
  mode are then the only limits. Use WSL2 or a dev container for a run you do
  not watch.
- **Guard against filler and empty tests.** The test-author writes only tests
  that can fail, with literal expected values and no assertions on mocks. The
  verifier rejects such tests as evidence and flags silenced checkers. The
  review's test and simplicity lenses report hidden failures, unrequested
  options, and idioms older than the toolchain the repo pins. The rules
  themselves live in the target repo's AGENTS.md (Conventions, Tests,
  Language notes), so every agent reads the same ones.

## Requirements in the target repo

1. The scaffold (`../scaffold`) copied in, with AGENTS.md commands filled in
   and `.claude/hooks/checks.json` set up.
2. A **Deploy** line in AGENTS.md (preview, production, smoke check), or the
   ship stage asks for one and adds it.
3. `gh` signed in, for the PR and CI steps.

## Load it

Add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, next
to the mods (see `../mods/README.md`):

```
...;Z:/github_projects/agents/factory
```

Or for one session: `claude --plugin-dir Z:/github_projects/agents/factory`.

## Work on it

```bash
claude plugin validate factory
```

```bash
node --test tests/factory.test.mjs
```

The behavior evals call the model and cost money. Run them before a release
of a changed skill, from the `factory` folder:

```bash
claude plugin eval . --runs 3 --max-cost-usd 5
```

The `scaffold/skills/zenn` skill is the light version of the spec stage, for
repos without this plugin. The research behind the design, and the Claude
Code features still to adopt, are in `docs/research.md`.
