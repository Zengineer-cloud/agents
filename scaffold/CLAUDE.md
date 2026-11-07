@AGENTS.md

## Claude Code specifics

- **Checks run automatically.** After each edit, `.claude/hooks/checks.mjs` runs the
  format/lint command configured for that file type. When you finish a turn in which
  you edited files, it runs the verify commands (tests, typecheck). Both lists live
  in `.claude/hooks/checks.json`. If a check reports problems, fix them; don't work
  around the hook.
- **Edit files with Edit or Write.** The format hook and the diff view only see those
  tools. Don't patch source with inline `python`, `node -e`, or `sed` scripts; for a
  large mechanical change, write the script to a file first and run it.
- **Commits**: plain conventional messages. No `Co-Authored-By` trailers and no
  "Generated with" footers.
- **Permissions** live in `.claude/settings.json`. Secret files are denied outright.
  Pushing, `git reset --hard`, `git clean`, merging a PR, and editing CI workflows
  always ask the user first. If a rule stops you, say so and wait; don't look for
  another route to the same result.
- **Planning**: `/zenn` runs the spec-first workflow described in AGENTS.md. When
  the `factory` plugin is loaded, `/factory` runs the full spec, build, review and
  ship pipeline on the same `specs/` folders.
- **Review**: `/code-review` and `/security-review` are built in. Use them before
  merging significant changes. `REVIEW.md` holds the review rules. The managed Code
  Review on GitHub reads it, local `/code-review` does not, so apply its "Do not
  report" and "Always check" lists to local review results yourself.
