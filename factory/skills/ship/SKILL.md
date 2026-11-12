---
name: ship
description: Factory stages 4 and 5. Pushes a reviewed feature branch, opens a PR that links the spec, waits for CI and a preview deploy, hands merge and production deploy to the user, then records lessons. Use when /factory routes here or the user asks to ship a reviewed factory branch.
argument-hint: "<spec slug>"
---

# Factory stages 4 and 5: ship and learn

Goal: the feature live, proven by a smoke check, with the lessons written down.
A person merges and a person approves production.

## Ship

1. Read `specs/<slug>/status.md`. The stage should be `ship`, with an accepted
   review. If not, offer `/factory:review`.
2. Read the **Deploy** lines in plan.md and the deploy commands in AGENTS.md.
   If neither names one, ask the user how this repo deploys and add it to
   AGENTS.md so the next feature knows.
3. **Push.** Ask once: "Push `feat/<slug>` and open a PR?" Then push and open
   the PR with `gh pr create`. The PR body holds:
   - one-paragraph summary and a link to `specs/<slug>/requirements.md`;
   - the AC list as a checklist, each with its test name;
   - the verifier verdict and the review result (confirmed, fixed, refuted);
   - risks and rollback, copied from plan.md;
   - follow the repo's commit and PR rules (no co-author trailers here).
   Record `pr:` in status.md.
4. **CI.** Read the PR's checks. On a failure, read the log, fix on the
   branch, push, and repeat. Two failures on the same check: stop and ask.
   Do not poll on a timer; in the desktop app, offer Auto-fix for the PR.
5. **Preview.** If the host builds a preview per PR (Vercel, Cloudflare
   Pages), find the URL in the PR checks. Otherwise run the plan's preview
   command. Run the smoke check against it, and record `preview:`.
6. **Hand over.** Tell the user the PR is ready to merge: PR link, CI state,
   preview URL, smoke result. The user merges. Do not run `gh pr merge`.
7. **Production.** After the merge, if production does not deploy from the
   main branch on its own, show the exact production command and run it only
   when the user says so in this chat. Then run the smoke check against
   production and report it.
8. Set `stage: done` and log the PR, the deploy and the smoke result.

## Learn

1. Read the status.md Log and the review results. Write two to five
   **Lessons**: what slowed the run, what an agent got wrong, what a check
   would have caught.
2. Turn each lesson into one proposed change. Take the first level that can
   catch the mistake, because nothing fails when an agent skips a line of text:
   - a change that removes the mistake: one source of truth, a stricter type,
     a deleted old way that agents copy;
   - a command in `.claude/hooks/checks.json`, or a test, that fails on it;
   - a line in REVIEW.md (a finding review should always or never report);
   - a line in AGENTS.md, only for a judgment call no check can make;
   - an edit to a factory skill or agent (in the agents repo).
3. Show the proposals and apply only the ones the user accepts. For a new
   check or test, show that it fails on the real mistake before it is added.

## Rules

- Deploying to production, merging, and changing DNS, secrets or billing are
  the user's actions. Prepare them; do not take them.
- WARNING: a rollback can lose data. Before a schema or data migration ships,
  confirm the plan's rollback step with the user.
- If the smoke check fails in production, say so first, then offer the
  rollback from plan.md.
