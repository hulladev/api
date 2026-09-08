# Koa

Install `@hulla/api`, `@hulla/api-koa`, `koa` and `@types/koa`. The adapter targets Koa 3.

```ts
import Koa from 'koa'
import { koaAdapter } from '@hulla/api-koa'
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

const app = new Koa<{ actor: string }>()
const adapter = koaAdapter<{ actor: string }>()
const implementation = defineServer(contract, {
  context: adapter.context(({ ctx, state }) => ({ actor: state.actor, ip: ctx.ip })),
}).implement(handlers)

app.use(async (ctx, next) => {
  ctx.state.actor = 'example-user'
  await next()
})
app.use(adapter.mount(implementation))
app.listen(3000)
```

`mount()` returns terminal Koa middleware for a complete implementation or fragment. It uses the core catch-all router:
static-path precedence, 404/405 responses, and HEAD dispatch to GET with body suppression. It does not call downstream
middleware for unmatched paths. Use application routing to scope separate fragments; retain full contract paths when
mounting them. Upstream Koa middleware can inspect the result and set response headers after `await next()`.

Native `ctx` and typed `state` are available in context factories and `onError`. Context bound to another adapter is
rejected. Options passed to `mount()` override the adapter defaults.

Without a preceding parser, the adapter reads JSON, text, bytes and multipart from the native request. Set
`maxBodyBytes` to limit these reads; there is no default cap. A preceding parser's `ctx.request.body` is reused and its
own limits apply. Parsed multipart must already be a `FormData` value. Query parameters use flat repeated-key semantics.

Responses use the shared Fetch representation serializer and are handed to Koa as Node readable streams. Koa retains
response commitment, upstream middleware composition, stream backpressure and disconnect cleanup. Cookies remain
separate header values. Native raw responses must be Fetch `Response` objects with matching declared status.

`onError` receives contract/runtime failures and serialization failures. Before serialization completes its result can
replace the response. Late producer errors are observational: Koa owns stream error handling and connection termination.
A request signal aborts on disconnect; producers must observe it cooperatively. Native lifetime listeners remain until
the response finishes or closes, including after the middleware returns.

Validation: `bun run --cwd packages/koa test` runs the shared suite on a real Koa HTTP server plus native state,
upstream middleware, parser ownership, body-limit, HEAD and routing checks. `bun run check:packages --package=koa`
checks the published consumer with native typed state and an HTTP roundtrip.

Host reference: [Koa documentation](https://koajs.com/).
