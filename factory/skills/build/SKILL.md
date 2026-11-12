---
name: build
description: Factory stage 2. Builds an approved spec on its own branch, tests first, one task per commit, and ends with an independent verifier check. Use when the user says to build an approved spec, or /factory routes here. Refuses specs that are not approved.
argument-hint: "<spec slug>"
---

# Factory stage 2: build

Goal: a branch where every acceptance criterion has a passing test that an
independent agent has checked.

## Before you start

1. Read `specs/<slug>/status.md`. If `stage` is `spec`, stop and offer
   `/factory:spec`: nothing gets built without approval.
2. Read requirements.md, plan.md and tasks.md. Do not re-plan. If the plan
   cannot work, stop, explain why, and propose a spec change.
3. If the spec asserts exact bytes, offsets or golden files, make sure
   `.gitattributes` marks those fixtures `-text` before the first commit that
   adds them, so a clone with `core.autocrlf=true` keeps them byte-exact.
   Do not rely on a local git config.
4. Make sure the working tree is clean, then create `feat/<slug>` from the
   base branch (or switch to it if it exists). Commit the spec as the first
   commit: `docs(spec): <slug>`.
5. Set `stage: build`, `branch:` in status.md.

## The loop

1. **Tests first (T-1).** Dispatch the `factory:test-author` agent with the spec path.
   Check its table: every automated AC has a test that fails for the right
   reason. List the test files, one repo-relative path per line, in
   `specs/<slug>/tests.lock`. Commit both: `test(<slug>): acceptance tests`.
   From here on the plugin's test-lock hook asks the user before any edit to
   those files. If a test is wrong, fix the spec first, say why, and log it.
2. **One task at a time.** Implement the next unchecked task. Keep the change
   to what the task names. Run the checks from AGENTS.md (the checks hook also
   runs them when your turn ends). Commit with a conventional message, check
   the box in tasks.md, and update "Where to resume".
3. **Parallel tasks.** Tasks marked [P] may run as subagents with
   `isolation: worktree`, one per task, when there are three or more. Merge
   their branches back one at a time and run the checks after each merge.
4. **Stuck.** Two failed attempts at one task: stop. Write into status.md
   what you tried and the one assumption both attempts shared. Test that
   assumption directly (one run or read that comes out differently if it is
   false) and log the result. Then ask the user. Do not start a third fix
   that rests on an untested assumption.

## Verify

1. When every task is checked, dispatch the `factory:verifier` agent with the spec
   path and the base branch. Do not verify your own work.
2. FAIL: fix each blocking item, commit, and run the verifier again. After
   two FAIL rounds on the same item, stop and ask the user.
3. PASS: paste the verifier report into the status.md Log (checks and AC
   lines only), set `stage: review`, and offer `/factory:review`.

## Rules

- Never weaken, skip or delete an acceptance test to make it pass.
- Write the least code that meets the task's ACs, for every valid input and
  not only the tested ones. No options, fallbacks or abstractions the plan
  does not name. Follow Conventions, Tests and Language notes in AGENTS.md.
- Do not silence a checker or hide a failure to get to green. Fix the cause,
  or stop and say what blocks you.
- No new dependencies unless the plan names them; the user still approves
  each install.
- Do not touch `.claude/`, CI workflows, or files the plan does not list
  without asking.
- Do not push in this stage. Pushing belongs to ship.
- With `run: unattended` in status.md, follow "Run unattended" in the factory
  skill: never ask, park instead, and go on to review after PASS.
- Keep commits small and green: each one passes the checks.
