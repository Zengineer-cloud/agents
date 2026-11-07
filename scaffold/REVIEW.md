# Review instructions

<!-- Rules that change what a code review reports. Claude Code's managed Code Review
     reads this file on GitHub PRs, from the base branch, never from the PR itself.
     The factory review stage reads it too. Local /code-review reads CLAUDE.md, not
     this file. Project facts and conventions belong in AGENTS.md. -->

## What Important means here

Reserve Important for findings that would break behavior, leak data or secrets,
or block a rollback. Style, naming, and refactoring suggestions are Nit at most.

- <!-- this repo's own Important cases, e.g. "queries not scoped to the caller's tenant" -->

## Check against the spec

When the PR links a spec under `specs/<slug>/`, check the diff against its
acceptance criteria (AC-n) and `plan.md`. Report an AC the diff does not meet,
behavior that no AC or plan item asks for, and any test that was skipped,
deleted, or weakened to make it pass.

## Cap the nits

Report at most five Nits per review.

## Do not report

- Anything CI or the checks hook already enforces: formatting, lint, type errors.
- Generated files and lock files. <!-- add paths, e.g. `src/gen/` -->

## Always check

- <!-- invariants of this repo, e.g. "every new API route has an integration test" -->
