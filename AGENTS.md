# Worktree safety

- Treat pre-existing or concurrently appearing changes that are unrelated to the current task as work from another agent or the user.
- Never automatically delete, revert, overwrite, reset, clean, or otherwise modify those unrelated changes.
- Preserve unrelated changes and keep the current task's edits narrowly scoped.
- Ask the user how to proceed only when those changes would conflict with the edits required for the current task or cause CI to fail. Explain the specific conflict or failure before asking.
