---
type: llm
weight: 1
---

All of these hold:

1. The response ends with exactly one question to the user about what they
   expect from the export feature. It is not a list of several questions.
2. The question comes with a recommended answer.
3. No `requirements.md`, `plan.md` or `tasks.md` was written, and no
   implementation code or test file was written.
4. If `specs/<slug>/status.md` exists, it says `stage: grill`.
