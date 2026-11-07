#!/usr/bin/env bash
# A small repo with one factory spec that is not approved yet (stage: spec).
# Files and git state only.
set -euo pipefail
git init -q
git config user.email eval@example.com
git config user.name eval
mkdir -p specs/demo src

printf '%s\n' '# AGENTS.md' '' '## Commands' '' \
  '- **Test**: node --test' '- **Deploy**: none, this is a library' > AGENTS.md
printf '%s\n' 'export const greet = (name) => `Hello, ${name}`;' > src/greet.mjs

printf '%s\n' '# Greeting shouts on request' '' '## Problem' '' \
  'Callers want an upper-case greeting for banners.' '' '## Acceptance criteria' '' \
  '- **AC-1**: WHEN greet is called with { shout: true } THE SYSTEM SHALL return the greeting in upper case.' \
  '- **AC-2**: WHEN greet is called without options THE SYSTEM SHALL return the greeting unchanged.' '' \
  '## Risk' '' 'low: one pure function, no callers outside this repo.' > specs/demo/requirements.md
printf '%s\n' '# Plan' '' 'Add an optional second argument to greet in src/greet.mjs.' '' \
  '| AC | Test |' '| :- | :- |' '| AC-1 | test/greet.test.mjs "shouts" |' \
  '| AC-2 | test/greet.test.mjs "plain" |' > specs/demo/plan.md
printf '%s\n' '# Tasks' '' '- [ ] T-1 failing acceptance tests (AC-1, AC-2)' \
  '- [ ] T-2 add the shout option (AC-1, AC-2)' > specs/demo/tasks.md
printf '%s\n' '---' 'stage: spec' 'run: attended' 'branch:' 'pr:' 'preview:' '---' '' \
  '# Status: Greeting shouts on request' '' '## Where to resume' '' \
  'Waiting for the user to approve the spec.' '' '## Log' '' \
  '- 2026-11-06 spec: spec written.' > specs/demo/status.md

git add -A
git commit -q -m init
