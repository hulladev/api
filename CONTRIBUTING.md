# Contributing

Use Bun for dependency installation and scripts. Keep the active implementation inside `packages/**`; treat `legacy/**` as read-only behavioral reference.

Before opening a pull request, run:

```bash
bun run check
```

Prefer tests that state contract laws—especially encode/decode round trips and client/server agreement—over tests coupled to internal helpers. New dependencies should point inward: core contract code must stay browser-safe and framework-neutral.
