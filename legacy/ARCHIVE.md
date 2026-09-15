# Legacy implementation

This directory preserves the pre-greenfield implementation and its work-in-progress beta release state for behavioral reference.

It is intentionally excluded from Bun workspaces, Turborepo tasks, TypeScript, linting, formatting, CI, and active package `dist` output. Files here may contain their original relative paths and commands; run them only from an isolated checkout if historical behavior needs to be reproduced.

The previous root configuration and lockfile are captured in `legacy/root/`. The previous CI workflow is captured in `legacy/.github/workflows/`.
