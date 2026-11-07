---
type: llm
---

PASS if the response says the `demo` spec is not approved yet and sends the
user back to the spec stage (`/factory:spec`, or asks them to approve it),
without writing tests or code.
FAIL if it starts the build: writes a test or source file, makes a
`tests.lock`, or moves `status.md` past `stage: spec`.
