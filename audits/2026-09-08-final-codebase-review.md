# Final codebase review — 2026-09-08

## Resolution — 2026-09-08

All seven findings below have been fixed in the working tree, with 13 additional regression cases. Nuxt now shares the core Fetch response wrapper; Node and Koa share request-header normalization and body reading; H3's forwarding wrapper is removed; TanStack Query and SWR share integration-tree traversal. The original review below is retained as historical evidence, with locations referring to the reviewed revision.

Validation after the fixes: the complete `bun run check` passed, including formatting, lint, documentation checks, Knip, TypeScript, workspace tests and framework build tests, production builds, export checks, isolated packed-package consumers, runtime-host probes, and bundle-size checks. Tests requiring local HTTP/WebSocket sockets were run with loopback access after the sandboxed attempt encountered `listen EPERM`. Existing skipped tests remain skipped. No performance benchmark claim is made.

Reviewed revision: `d0795f7`, initially clean working tree. Review only; no production code changed. Focused on active packages: core execution and response ownership, Fetch/IPC/WebSocket clients, native HTTP adapters, AWS/Azure response conversion, Nuxt/Next clients, query integrations, and OpenAPI generation. Archived `legacy/` was excluded. This is a targeted final pass, not exhaustive certification of every host integration or a performance benchmark.

## Reproduced findings

### 1. P2 — AWS base64 JSON requests are rejected

Location: `packages/aws-lambda/src/index.ts:85`.

The JSON branch parses `event.body` directly, although the text, bytes, and multipart branches honor `isBase64Encoded`. An event containing base64-encoded `{"name":"Ada"}` with JSON content type returns 400 `invalid-request-body`; the handler is never reached.

Decode the event's bytes before JSON parsing when `isBase64Encoded` is true. Add a valid base64 JSON request regression, including non-ASCII text.

### 2. P2 — Nuxt leaves rejected response bodies open

Location: `packages/nuxt/src/client.ts:96–118`.

Nuxt's duplicated Fetch response wrapper has no `dispose` implementation and ignores the cancellable-read option. Core calls `dispose` when status, content type, or response validation fails, but that cannot release this transport's response. With an open stream and a mismatched content type, the client rejects and the underlying stream's cancellation callback remains uncalled. The equivalent core Fetch transport cancels it.

Share core's Fetch response ownership implementation with Nuxt, including tracked readers for asynchronous header-validation failures during body reads. Adding cancellation only for unlocked bodies would leave the concurrent-read case unresolved.

### 3. P2 — Nuxt loses repeated Set-Cookie headers

Location: `packages/nuxt/src/client.ts:65–66`.

`Object.fromEntries(response.headers.entries())` cannot preserve repeated cookies. On Bun, a native response with `a=1; Path=/` and `b=2; Path=/` produces only `b=2; Path=/` in transport headers. SSR callers forwarding the typed result's headers can lose session or refresh cookies.

Use the existing `fromFetchHeaders` helper, which preserves `getSetCookie()` as an array. This is another concrete reason to share the Fetch response wrapper.

### 4. P2 — MessagePort silently converts stream failures to EOF

Locations: `packages/message-port/src/client.ts:114` and `:190–194`.

`fail(error)` rejects current waiters but retains only `#finished`; `next()` then reports normal completion. If the request is aborted or the transport closes between consumer pulls, there is no pending waiter to receive the error. Reproduced by receiving a stream response, aborting its signal before the first pull, and calling `next()`: it resolves to `{ done: true, value: undefined }`.

Retain failure state and its reason, and reject subsequent `next()` calls. The WebSocket `RemoteStream` already implements this distinction. Test abort and remote close between pulls, not only while a pull is pending.

### 5. P2 — OpenAPI null-only schemas accept arbitrary JSON

Location: `packages/openapi/src/import.ts:256–264`.

The generator removes `null` before selecting its base type. For `{ type: 'null' }`, the selection becomes undefined and falls back to `z.json()`, producing `z.json().nullable()`. The generated schema accepts `{ unexpected: true }`. A nullable union expressed with a separate null branch is consequently broadened as well. The later `case 'null'` at line 289 is unreachable under this selection logic.

Handle an explicitly null-only type before filtering, while retaining the distinct behavior of schemas with no declared type. Execute generated schemas against valid and invalid values in regression tests; compilation alone cannot catch this.

### 6. P2 — AWS response conversion bypasses onError

Location: `packages/aws-lambda/src/index.ts:241`.

`lambdaResponse()` runs outside the dispatcher's error boundary. Native conversion failures reject the Lambda handler without invoking its configured observer or returning its fallback. Reproduced with an invalid stream chunk: the call rejects with `Stream chunk must be Uint8Array`, and `onError` is invoked zero times. JSON serialization and raw-response validation also occur in this unguarded conversion.

Add a transport-phase boundary around conversion, following the existing Fetch/Node policy: invoke the observer once, permit a replacement before returning a response, and prevent recursive observer failure.

### 7. P2 — AWS stream collection skips producer cleanup

Location: `packages/aws-lambda/src/index.ts:105–110`.

The manually advanced iterator has no `finally` cleanup. When a yielded value fails the Uint8Array check, the collector throws without calling `return()`. Reproduced with an async generator yielding an invalid chunk inside `try/finally`: the Lambda call rejects, but the generator's `finally` never runs. Resources owned by the producer can remain open.

Use structured iteration with early-exit cleanup or an explicit guarded `return()` in `finally`, preserving the primary failure. This is independent of observing the conversion error in finding 6.

## Focused simplifications

- Share the core Fetch response wrapper with Nuxt. This removes duplicated decoding and ownership logic and directly addresses findings 2 and 3. Preserve Nuxt's request-scoped send behavior and relative URLs.
- Move the identical Node/Koa request-header normalization and buffered body reader into `@hulla/api/adapters/node`: `packages/node-http/src/index.ts:67,76` and `packages/koa/src/index.ts:47,56`. Keep the shared byte limit and `destroyOnReturn: false` behavior; host error wording can be parameterized if needed.
- Remove H3's forwarding async `readBody` wrapper (`packages/h3/src/index.ts:59`) and invoke `readFetchBody` directly. It adds no H3-specific behavior. No measurable performance gain is claimed.
- TanStack Query and SWR duplicate tree traversal, reserved-name validation, and key construction (`packages/tanstack-query/src/query.ts:97`, `packages/swr/src/swr.ts:72`). A small integration-tree helper could centralize these rules while leaving each library's query/mutation semantics in its own package. Lower priority than the lifecycle fixes.

Knip reports no dead-code issues. The unreachable OpenAPI null branch is a logical dead branch that its symbol-level analysis does not detect. No performance bottleneck was established by measurement during this review; the simplifications above are primarily maintenance improvements.

## Verification

- `bun run analyze:dead-code`: passed.
- `bun run lint`: passed.
- `bun run typecheck`: passed; 45 Turbo tasks were cache hits, followed by the root scripts TypeScript check.
- `bun run test`: passed; all 63 Turbo tasks were cache hits, including prerequisite build tasks.
- Fresh core suite: 213 passed.
- Fresh AWS suite: 3 passed.
- Fresh Nuxt client suite: 7 passed.
- Fresh MessagePort suite: 68 passed, 5 skipped.
- Fresh OpenAPI suite: 8 passed.
- Standalone Bun reproductions confirmed every finding above. The Nuxt cancellation reproduction included core Fetch as a passing control.

The green existing suites do not cover these failing combinations. Full framework builds, live cloud deployments, runtime compatibility checks, and performance benchmarks were not rerun.
