# Bun, Deno and Vercel

These hosts use the existing `fetchAdapter()` from `@hulla/api/fetch`; no additional adapter package is needed.
The runnable fixtures are in [`examples/runtime-hosts`](../examples/runtime-hosts).

- Bun: run `bun examples/runtime-hosts/bun.ts` after building core. Pass the mounted handler to `Bun.serve({ fetch: handler })`.
- Deno: run `deno run --config examples/runtime-hosts/deno.json --allow-net --allow-env=PORT examples/runtime-hosts/deno.ts`
  after building core. The workspace import map points at built core; an installed application can map to the published
  npm package. Pass the mounted handler to `Deno.serve(handler)`.
- Vercel: use the runtime-hosts directory as the project root. Its `api/index.ts` exports `{ fetch: handler }` and
  `vercel.json` rewrites API paths to that function. Install core in the deployment project and keep the shared server
  module within its root. This is a standalone Web Handler fixture, independent of Next.js.

The shared implementation demonstrates request context, bytes, repeated cookies and response streams. `PORT` selects the
local listen port. Host deployment configuration, authentication and native platform limits remain application-owned;
the Fetch adapter does not impose a default body limit. Optional `maxBodyBytes` is available when deliberately wanted.

`bun run check:runtimes` builds and tests a native Bun HTTP server and invokes the built Vercel Web Handler locally.
`npm exec --yes --package=deno@2.9.6 -- bun run check:runtimes --deno` also tests a real Deno HTTP server. These checks
verify bodies above 1 MiB, byte fidelity, cookies, streaming, context and 404/405 behavior. The Vercel check is local
artifact evidence, not a deployed-cloud test. CI runs all three fixtures.
