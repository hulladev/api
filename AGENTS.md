# Worktree safety

- Treat pre-existing or concurrently appearing changes that are unrelated to the current task as work from another agent or the user.
- Never automatically delete, revert, overwrite, reset, clean, or otherwise modify those unrelated changes.
- Preserve unrelated changes and keep the current task's edits narrowly scoped.
- Ask the user how to proceed only when those changes would conflict with the edits required for the current task or cause CI to fail. Explain the specific conflict or failure before asking.

# TypeScript conventions

- Use `type` aliases instead of `interface` declarations for object shapes and public API types.
- Use `interface` only when declaration merging or module augmentation is required and a `type` alias cannot express the intended behavior.

## Test quality and footprint

- Retain a test only when it protects intended package behavior, a meaningful public contract, or a plausible bug with an observable consequence. Identify that risk before adding coverage; a file changing is not sufficient reason to add a test.
- Prefer the cheapest effective test through the real API. Exact return values are useful when they express a contract, such as parsing, serialization, or error handling; merely recording current output, constants, trivial getters, or fixture values is not.
- Give each failure mode one primary test. Extend an existing scenario instead of repeating setup, generation, builds, or process startup. Keep coverage at additional layers only for distinct integration or runtime risks.
- Assert behavior with independent expectations. Avoid implementation-mirroring tests, source-text or class-name checks standing in for behavior, self-generated expected fixtures, and assertions that only prove a mock does what it was configured to do. Compile-time tests must actually check types.
- Temporary tests and scratch checks are welcome during investigation. Remove them, their fixtures, and any supporting setup before handoff unless they meet the same criteria as permanent regression coverage.
- For bug fixes, prefer a focused regression that fails with the bug and passes with the fix. Name the behavior and failure condition clearly; explain the risk in the change summary when it is not obvious.
- When cleaning tests, identify the redundant coverage or missing behavioral intent. Preserve distinct failure paths and public type contracts; test count and runtime alone do not justify deletion.
- Run checks appropriate to the changed behavior and report their results. Do not add permanent tests, dependencies, or CI work merely to validate a reversible edit or increase coverage numbers.
