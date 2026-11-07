---
name: spec
description: Factory stage 1. Turns what the user explains into a written, testable spec in specs/<slug>/ (requirements with EARS acceptance criteria, plan, tasks, status), has the spec-critic agent check it, and asks the user to approve. Use when the user describes a feature to build, or asks for a spec or plan.
argument-hint: "<what you want built>"
---

# Factory stage 1: spec

Goal: a spec good enough that an agent with no memory of this chat builds the
right thing. Code waits until the user approves it.

## Steps

1. **Pick a slug** (short, kebab-case) and make `specs/<slug>/`. Copy the four
   templates from `${CLAUDE_SKILL_DIR}/templates/` into it. If the folder
   exists, read it and continue instead.
2. **Learn the ground.** Read AGENTS.md and the code the feature touches. Send
   a broad search to an Explore subagent; keep only its conclusions.
3. **Interview.** Ask the questions that change what gets built: who uses it,
   inputs and outputs, edge cases, failure behavior, limits, non-goals, how it
   ships. Ask in one grouped message (AskUserQuestion when choices are clear).
   Skip what the request or the code already answers. Do one more round only
   if the answers open new questions.
4. **Write requirements.md.** Problem, goals, non-goals, then acceptance
   criteria in EARS form, one behavior each:
   - `WHEN <trigger> THE SYSTEM SHALL <response>.`
   - `IF <unwanted condition> THEN THE SYSTEM SHALL <response>.`
   - `WHILE <state> THE SYSTEM SHALL <response>.`
   Every AC must be checkable. "Fast" becomes "under 200 ms at p95 for 100
   items". Number them AC-1, AC-2 and never renumber. Fill Boundaries
   (always, ask first, never) and Risk. Mark each gap you cannot close as
   `[NEEDS CLARIFICATION: question]` instead of guessing.
5. **Write plan.md.** Design, interfaces and data shapes, files, the test
   strategy table (every AC maps to a test or a named manual step), risks and
   rollback, and the deploy lines (preview, production, smoke check). Decide
   here; do not leave design to the build.
6. **Write tasks.md.** Ordered, one commit each, AC ids on each task. T-1 is
   always "failing acceptance tests". Mark [P] only when a task shares no files
   and no results with other open tasks.
7. **Critique.** Dispatch the `factory:spec-critic` agent with the folder path. Fix
   every blocking item. Note the optional ones you skipped and why.
8. **Ask for approval.** Show the user: the ACs, the approach in five lines or
   less, the task list, open questions, and the critic's verdict. Ask for a
   yes, or for changes.
9. **On approval**: set `stage: approved` in status.md, log the date and the
   user's approval, and offer `/factory:build` or an unattended run of build
   and review ("Run unattended" in `/factory`). On changes: edit and repeat
   from step 7.

## Sizing

- Spec small features small: three to six ACs, one screen of plan.
- If the work needs more than about ten tasks or two weeks, split it into
  features with their own slugs, and say which one goes first.
- For a quick fix, say the factory is overkill and offer to just do it.

## Rules

- The user's words define intent. Do not add features they did not ask for;
  put ideas under Non-goals or Open questions instead.
- No `[NEEDS CLARIFICATION]` marker and no open question may remain at
  approval, unless the user says "decide for me". Log that under Decisions.
- The user reviews the plan, not just the ACs: it is cheaper to fix a wrong
  design here than a wrong diff later.
- No code, no tests, no branch in this stage. Specs are committed with the
  feature branch at build time.
