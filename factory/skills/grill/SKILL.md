---
name: grill
description: Factory stage 0. Interviews the user about what they expect from a feature, one question at a time, each with a recommended answer, until every decision that shapes it is settled. Writes the answers to specs/<slug>/expectations.md. Use when the user says "grill me", asks to be interviewed before a spec, or /factory routes a new feature here. Writes no spec and no code.
argument-hint: "<idea | spec slug>"
---

# Factory stage 0: grill

Goal: no surprise at the spec gate. Every expectation the user holds is
written down, in their words, before anyone writes a spec.

## Steps

1. **Pick a slug** (short, kebab-case) and make `specs/<slug>/`. Copy
   `${CLAUDE_PLUGIN_ROOT}/skills/spec/templates/status.md` into it and set
   `stage: grill`. If `expectations.md` exists, read it and continue from its
   Open list.
2. **Learn the ground.** Read AGENTS.md and the code the idea touches. Never
   ask what the request or the code already answers.
3. **Map the decisions.** List the decisions the feature needs, in dependency
   order: a decision that changes later questions goes first. Tell the user
   about how many questions to expect.
4. **Ask one question at a time.** Give your recommended answer and its reason
   in one line with each question. Use AskUserQuestion when the choices are
   clear, recommended choice first. Wait for the answer before the next one.
5. **Push on weak answers** (see below). Add a branch to the map when an
   answer opens one.
6. **Save as you go.** After every few answers, write them to
   `expectations.md`, so the interview survives the end of the session.
7. **Close.** When no decision is open, or the user says stop, read the
   expectations back in ten lines or less and ask if they are right. On a
   yes: log it in status.md, set `stage: spec`, and offer `/factory:spec`.

## Branches to walk

Skip a branch the feature does not have.

- **Outcome**: who uses it, what they can do afterwards that they cannot do
  now, and the demo the user would accept as done.
- **Main flow**: step by step, then each way a step fails.
- **Inputs and outputs**: shapes, limits, empty and oversized cases.
- **Frontend**: screens and their empty, loading and error states, devices
  and widths, keyboard and screen reader use, how it must look.
- **Backend**: the API or data contract, auth, existing data and migration,
  load, timeouts, and what a retry or a double submit does.
- **Proof**: which tests and checks the user must see pass before they trust
  it, and what they will check by hand.
- **Limits**: non-goals, what must not change, allowed dependencies,
  deadline, and how bad a failure would be.
- **Ship**: rollout, rollback, and who must know.

## Push on weak answers

- A vague word ("fast", "simple", "secure"): ask for a number or an example.
- "It depends": ask on what, then ask about each case.
- An answer that contradicts an earlier one: quote both and ask which wins.
- "You decide": record your recommendation and mark it `Claude decided`.
- An answer that sounds like a solution: ask what problem it solves.

## expectations.md

```
# Expectations: <feature title>

## Settled
- E-1 <topic>: <the answer, in the user's words> (user | accepted | Claude decided)

## Out
- <what the user ruled out>

## Open
- <question not asked or not answered yet>
```

## Rules

- One question per message. Never send a list of questions.
- Record what the user said, not what you would build. Your ideas go in as
  questions with a recommendation.
- Size the interview to the feature: five questions can be enough for a small
  one. For a quick fix, say the interview is overkill and skip it.
- About every ten questions, say what is left and let the user stop. What
  stays unanswered goes under Open; the spec stage must close it.
- No requirements, plan, code, tests or branch in this stage.
- Never run this stage in an unattended run: it needs the user.
