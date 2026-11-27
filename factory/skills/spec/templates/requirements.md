# <!-- feature title -->

## Problem

<!-- Who has the problem, what happens today, why it matters. Two to four sentences. -->

## Goals

- <!-- outcome the user can observe -->

## Non-goals

- <!-- what this work will not do, so nobody builds it by accident -->

## Acceptance criteria

<!-- One line per behavior, EARS style. Each one must be checkable by a test or a
     named manual step. IDs are stable: never renumber, mark dropped ones ~~struck~~.
     Under each AC, "Rejects" names a plausible wrong build that its test must fail:
     one that a reasonable agent could ship from the same words. Example: for
     "existing users stay signed in after the login migration", it rejects "moves
     login to the new API and signs everyone out". -->

- **AC-1**: WHEN <!-- trigger --> THE SYSTEM SHALL <!-- response -->.
  Rejects: <!-- plausible wrong result the test must fail -->
- **AC-2**: IF <!-- unwanted condition --> THEN THE SYSTEM SHALL <!-- response -->.
  Rejects: <!-- plausible wrong result the test must fail -->

## Constraints

- <!-- stack, performance, compatibility, budget, deadline -->

## Boundaries

- **Always**: <!-- e.g. validate input at the API edge -->
- **Ask first**: <!-- e.g. schema changes, new dependencies -->
- **Never**: <!-- e.g. touch billing code, commit secrets -->

## Risk

<!-- low | medium | high, and one line why. Low = docs, copy, or an isolated
     change. High = auth, money, data loss, public API, or a large blast radius.
     It sets how hard review looks and who approves the merge: low may
     auto-merge on green checks, medium needs one human review, high needs two. -->

## Open questions

<!-- Mark gaps inline anywhere in this file as [NEEDS CLARIFICATION: question].
     The spec is not ready while any marker remains. -->

- <!-- anything the user must answer before the plan is final; empty before approval -->
