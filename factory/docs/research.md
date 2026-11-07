# Research behind the factory (2026-10-30)

Two sweeps fed the design: what the industry does with AI software factories,
and which Claude Code features carry each stage. Sources are listed at the end
of each part. Recheck them before a big change: this field moves monthly.

## Part 1: the industry

### The shape everyone converges on

A person owns the intent and the merge. Agents own the mechanical steps in
between, each in an isolated loop with checks the agent cannot fake. Deploy
stays a deterministic pipeline, not an agent.

The 2026 consensus is a "light factory": people review plans, and review code
by risk. StrongDM runs a "dark factory" with no human code review. Dex Horthy
and Addy Osmani each ran one for months, saw the codebase decay after three
to six months, and moved back to plan review plus risk-tiered code review.
Augment automated review first, where its queue was longest, and reports
median time to merge falling from 11.2 h to 3.1 h over 17,200 PRs.

### Tools by stage

| Tool | Spec | Code | Test | Review | Deploy |
| :- | :- | :- | :- | :- | :- |
| GitHub Spec Kit | constitution, `spec.md` with `[NEEDS CLARIFICATION]`, `plan.md`, `tasks.md` with `[P]` | `/speckit.implement` | test-first article | `/speckit.analyze`, converge loop | none |
| AWS Kiro | EARS `requirements.md`, `design.md`, `tasks.md`, steering files | parallel task waves | hooks on save and tool use | spec review comments | none |
| BMAD | analyst, PM, architect personas, story files | dev agent per story | test step | review per story, retro per epic | none |
| Copilot coding agent | issue, custom agents, skills | Actions sandbox, one `copilot/` branch | in sandbox | draft PR; agent cannot approve or merge | your CI |
| OpenAI Codex | layered `AGENTS.md` | cloud env with network allowlist | in env | review rules in AGENTS.md | your CI |
| Devin | knowledge, playbooks | session | regression test per bug | Devin Review, autofix to green CI | your CI |
| Cursor | rules | cloud VMs, PR with video and logs | in VM | Bugbot with autofix | none |
| StrongDM | human spec plus holdout scenarios outside the repo | agents only | LLM judge over scenarios in cloned SaaS twins | none by rule | n/a |
| Stripe Minions | Slack thread, scoped rules | pre-warmed devbox, no internet | lint under 5 s, max 2 CI rounds | human, about 1,300 PRs a week | existing |
| Augment | triage, design doc, tickets | PR author agent | verifier with screenshots and logs | risk analyzer auto-approves low risk | deterministic |

### Patterns the factory copies

| Pattern | Where it lives here |
| :- | :- |
| Planner writes what and why; a fresh context builds from the file | spec stage, `status.md` handoff |
| EARS acceptance criteria and `[NEEDS CLARIFICATION]` markers | `requirements.md` template |
| Always / Ask first / Never boundaries | `requirements.md` Boundaries |
| Human gate on the plan, not only the diff | spec approval step |
| Red before green: confirm the test fails first | `test-author` agent |
| Tests the coder cannot quietly change | `tests.lock` and the test-lock hook |
| Separate, skeptical, read-only evaluator | `verifier`, review workflow skeptics |
| Enforce with hooks, not prose | scaffold `checks.mjs`, test-lock hook |
| Deterministic steps between agent loops; cap CI retries at 2 | build and ship "two tries, then ask" |
| Isolation per task | `[P]` tasks in worktrees |
| Risk-tiered review | `Risk` in requirements, review scales to it |
| Progress file and startup ritual | `status.md` "Where to resume", session-context mod |
| Turn each mistake into a rule or check (the ratchet) | Lessons step in ship |

### Failure modes and the answer here

| Failure | Answer |
| :- | :- |
| Reward hacking: tests deleted, skipped, or rewritten to match code | tests first by another agent, lock hook, verifier integrity check, review test lens |
| Self-evaluation bias | the builder never grades; skeptics default to "refuted" |
| Premature "done" | done means verifier PASS with every AC mapped to a passing test |
| Context rot | one feature per branch, files over memory, subagents for reading, context-meter handoff |
| Spec drift | spec changes first; review spec lens checks the diff against the ACs |
| Spec overload for small work | quick-fix exit in `/factory`; three to six ACs per feature |
| Review fatigue | refute pass removes noise; minor findings are optional; risk tiers |
| Reviewer over-correction | simplicity lens capped at "minor"; user picks minor fixes |
| Cost blowout | review workflow only at medium and high risk; evaluator only at the end |
| Stale scaffolding | Lessons step; delete parts that no longer earn their cost |

### Not adopted yet

- **Holdout scenarios** (StrongDM): end-to-end stories kept outside the repo
  and judged by a model. Worth it once a project has real users.
- **JSON feature list** where the agent may only flip `passes` (Anthropic
  harness post). `tasks.md` checkboxes plus the verifier cover this for now.
- **Auto-approve low-risk PRs.** The user merges every PR today.

### Unverified

Spec Kit command names changed (dotted `/speckit.*` vs hyphenated). BMAD role
names conflict across sources. Tessl, Amp, Jules and Factory details came from
third-party pages. The OpenAI "harness engineering" post was blocked; InfoQ
stood in for it.

### Sources

- Anthropic: [effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps), [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [building a C compiler](https://www.anthropic.com/engineering/building-c-compiler), [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- Spec tools: [Spec Kit](https://github.com/github/spec-kit) and [spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md), [Kiro specs](https://kiro.dev/docs/specs/), [Kiro hooks](https://kiro.dev/docs/hooks/), [BMAD](https://docs.bmad-method.org/), [Böckeler on SDD tools](https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- Factories: [StrongDM](https://factory.strongdm.ai/), [Willison on it](https://simonwillison.net/2026/Feb/7/software-factory/), [Osmani: software factories](https://addyosmani.com/blog/software-factories/), [Osmani: harness engineering](https://addyosmani.com/blog/agent-harness-engineering/), [Osmani: a good spec](https://addyosmani.com/blog/good-spec/), [Horthy WSFF](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md), [Stripe Minions](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents), [Augment](https://www.augmentcode.com/blog/beyond-ai-coding-agents-how-we-built-augments-software-factory), [Cognition on Devin](https://cognition.com/blog/how-cognition-uses-devin-to-build-devin), [Cursor Bugbot autofix](https://cursor.com/blog/bugbot-autofix)
- Practice: [Willison red/green TDD](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/), [Beck augmented coding](https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes), [Copilot agent risks](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations), [awesome-software-factories](https://github.com/varun1505/awesome-software-factories)

## Part 2: Claude Code building blocks

Checked against code.claude.com docs and the CHANGELOG (v2.1.147 to v2.1.314,
May to October 2026). Local build at the time: v2.1.290.

### What the factory uses now

| Feature | Used for | Notes |
| :- | :- | :- |
| Plugin (`.claude-plugin/plugin.json`) | ships skills, agents, hooks, workflow as one unit | skills run as `/factory:<name>` |
| Skills (`skills/<name>/SKILL.md`) | one skill per stage | `${CLAUDE_SKILL_DIR}` points at the skill folder (templates) |
| Subagents (`agents/<name>.md`) | `spec-critic`, `test-author`, `verifier` | `tools` allowlist, `model`, `effort`, `color`. Plugin agents ignore `permissionMode`, `hooks`, `mcpServers` |
| `isolation: worktree` | `[P]` tasks in build | branches from the default branch; removed if unchanged |
| Hooks (`hooks/hooks.json`) | test-lock (`PreToolUse`, `permissionDecision: "ask"`) | scaffold `checks.mjs` covers `PostToolUse` format and `Stop` verify |
| Workflows (`workflows/*.js`, v2.1.154) | `factory-review`: lenses, then skeptics | 16 concurrent agents; scripts cannot touch files; plugin workflows called by name |
| `/code-review`, `/security-review` | review at low risk, or without workflows | levels low to max, `--fix`, `--comment`; `ultra` runs in the cloud |
| Plugin evals (`claude plugin eval`, v2.1.269) | `evals/` cases for the stage skills | runs WITH and WITHOUT the plugin; `--runs`, `--max-cost-usd` |
| `REVIEW.md` | review | read only by the managed Code Review service, from the base branch; local `/code-review` ignores it, so the factory review applies it itself |

### What to add later

| Feature | Stage | Idea |
| :- | :- | :- |
| `/goal <condition>` | build | `/goal every task in specs/<slug>/tasks.md checked and the verifier says PASS` for a long unattended build |
| `claude --bg`, agent view (research preview) | build, test | run a build or a long test suite as a background session |
| `claude -p` with `--json-schema`, `--max-budget-usd`, `--permission-mode dontAsk` | any | run a stage from CI or a script, with a hard cost cap |
| `anthropics/claude-code-action@v1` | review | run the review on every PR push, `--comment` findings |
| Routines (`/schedule`, API and GitHub triggers) | intake, deploy | fire a post-deploy smoke check or triage from a webhook |
| Agent teams (experimental) | build | builder and reviewer as teammates; wait until it leaves experimental |
| Subagent `memory: project` | review | let `verifier` keep notes on repeat failures per repo |
| Plugin marketplace (`.claude-plugin/marketplace.json`) | all | install the factory by name in other machines and repos |

### Limits that shape the design

- The OS sandbox does not run on native Windows. Use WSL2 for sandboxed runs.
- Auto mode already blocks production deploys, migrations, force pushes and
  merging an unapproved PR. The factory keeps those gates in its skills too.
- Nesting depth of subagents conflicts between docs (3) and changelog (5).
  The factory never nests deeper than session, workflow, agent.

### Sources

[AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook), [Code Review customize](https://code.claude.com/docs/en/code-review-customize), [plugins](https://code.claude.com/docs/en/plugins), [plugin evals](https://code.claude.com/docs/en/plugin-evals), [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents), [hooks](https://code.claude.com/docs/en/hooks), [workflows](https://code.claude.com/docs/en/workflows), [worktrees](https://code.claude.com/docs/en/worktrees), [headless](https://code.claude.com/docs/en/headless), [GitHub Actions](https://code.claude.com/docs/en/github-actions), [code review](https://code.claude.com/docs/en/code-review), [permission modes](https://code.claude.com/docs/en/permission-modes), [goal](https://code.claude.com/docs/en/goal), [routines](https://code.claude.com/docs/en/scheduled-tasks), [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
