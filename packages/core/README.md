# @hulla/api

Shared HTTP contracts with typed client and server bindings. Framework adapters and query integrations are separate packages.

Inspect the published entrypoints without assuming a `node_modules` layout:

```sh
npm view @hulla/api exports --json
```

For an existing project, the optional `hulla` CLI checks the installed integration:

```sh
bunx hulla api --check
bunx hulla doctor --help
```

Start with [contract authoring](https://hulla.dev/docs/api/core/contracts), then [clients](https://hulla.dev/docs/api/core/clients) or [server authoring](https://hulla.dev/docs/api/core/servers).
The [repository guides](https://github.com/hulladev/api/tree/master/docs) provide a Markdown fallback and host-specific setup.
