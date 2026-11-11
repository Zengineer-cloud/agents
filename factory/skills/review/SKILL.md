---
name: review
description: Factory stage 3. Reviews a built feature branch against its spec with independent reviewers, refutes weak findings, fixes the confirmed ones, and asks the user to accept. Use when /factory routes here or the user asks to review a factory branch before shipping.
argument-hint: "<spec slug>"
---

# Factory stage 3: review

Goal: every real defect found and fixed before a person reads the PR, with no
noise from findings that do not hold up.

## Steps

1. Read `specs/<slug>/status.md`. The stage should be `review` and the last
   verifier verdict PASS. If not, offer `/factory:build`.
2. **Scale to risk.** Read **Risk** in requirements.md.
   - **low**: `/code-review medium` plus the `factory:verifier`. Skip the workflow.
     `/code-review` does not read REVIEW.md: drop findings its "Do not report"
     list names, and check its "Always check" items yourself.
   - **medium**: the workflow below.
   - **high**: the workflow, `/security-review`, and tell the user which files
     they should read themselves before accepting.
3. **Run the review.** Use the plugin's workflow when the Workflow tool is
   available (this skill authorizes that one run). It runs five read-only
   lenses (spec, correctness, security, tests, simplicity), then one skeptic
   per finding. A skeptic may run one test or a temp script to settle its
   finding, and writes nothing in the repo. Tell the user it uses 5 + N
   agents, N being the number of distinct findings.

   ```
   Workflow({ name: "factory:factory-review",
              args: { spec: "specs/<slug>", base: "<base branch>" } })
   ```

   If the name is unknown, pass
   `scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/review.js"` instead.
   Without the Workflow tool, run `/code-review high` and `/security-review`,
   then dispatch the `factory:verifier` agent for the spec and test lenses.
4. **Report coverage.** List any `deadLenses` as "not reviewed" and any
   `unverified` findings as "not judged". Never call a review clean when a
   lens did not run. Show each verdict's `proven` level (ran, traced, argued).
   Before you fix or drop a blocker or major finding that is only `argued`,
   run its failing case yourself, or tell the user it is unproven.
5. **Fix.** Fix every confirmed blocker and major finding, one commit each,
   with the finding in the message. Ask the user before fixing a finding that
   needs a spec change. List minor findings and let the user pick.
6. **Re-verify.** After fixes, dispatch the `factory:verifier` again. It must PASS.
7. **Ask the user** to accept the review: show the confirmed findings and what
   was done about each, the refuted ones in one line each, and the verifier
   verdict. On a yes, log it, set `stage: ship`, and offer `/factory:ship`.

## Rules

- With `run: unattended` in status.md, follow "Run unattended" in the factory
  skill: never ask, park instead, and accept the review only as it allows.
- The review agents write nothing in the repo. Only this session edits code.
- A finding that contradicts the spec is a spec question, not a code fix.
  Ask the user.
- If the same kind of finding shows up in two features, propose a fix under
  Lessons in status.md: a check for checks.json first, a rule for REVIEW.md
  or AGENTS.md only when no check can catch it.
