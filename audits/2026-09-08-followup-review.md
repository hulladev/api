# Follow-up review — 2026-09-08

## Resolution — 2026-09-08

All four findings below are fixed in the working tree. Stream iterators now explicitly release transport ownership before returning, including before the first pull and during pending reads; synchronous iterables also remain closed after return. Empty decoding disposes unread responses. OpenAPI text-schema generation resolves references in their transport context, including nested references and response headers, with a recursive-reference guard. MessagePort setup waits observe request abort without cancelling shared initialization or sending cancelled requests later.

Eight additional test cases cover opaque/formatted stream cancellation, empty 200/204 responses, synchronous stream behavior, abort during shared endpoint setup, and actual HTTP execution of generated inline/referenced parameter schemas. Final validation: the complete `bun run check` passed after the last code adjustment, including tests, TypeScript, builds, lint, dead-code analysis, package consumers, runtime probes, and bundle-size checks. The original findings and pre-fix evidence are retained below.

Reviewed the working tree after the seven fixes from the preceding review. Existing edits were preserved; this pass changes no production code. Four additional P2 findings were reproduced on Bun 1.4.0.

## 1. Referenced OpenAPI parameters lose text decoding

Location: `packages/openapi/src/import.ts:237`; component creation at `:332`.

References always reuse the component schema, which is generated for JSON, regardless of the parameter's text transport. An inline integer query schema produces a coercing validator and accepts `/items?limit=3` (200, body `3`). Replacing that schema with a reference to the identical component produces `LimitSchema = z.number().int().min(1)` and returns 400: expected number, received string. This affects reusable numeric/boolean parameter schemas and related reference compositions.

Resolve references in the transport context or generate separate text-context component variants. Add an end-to-end generated-contract test comparing equivalent inline and referenced query/path/header definitions.

## 2. Returning a stream before its first pull does not cancel it

Locations: `packages/core/src/fetch/client.ts:98–120,172`; the formatted-stream wrapper in `packages/core/src/client/response.ts` also adds a lazy generator boundary.

Response disposal is implemented in an async generator's `finally`. Calling `return()` before its first `next()` never enters that generator, so its `finally` does not execute. Reproduced with a formatted NDJSON Fetch response: await the client call, obtain the iterator, immediately call `return()`, and the native body's cancellation callback is never invoked. The caller has no body ownership left in use, but the connection remains open. The shared wrapper means Nuxt inherits the same issue.

Expose a stream iterator whose `return()` explicitly releases the transport even before iteration starts. Formatted wrappers must forward this cancellation through each lazy layer. Test both before-first-pull and after-first-pull cancellation, including pending reads.

## 3. Successful empty decoding leaves unexpected bodies unread

Location: `packages/core/src/client/response.ts:159–160`.

The empty decoder returns undefined without reading or disposing the transport response. With `200: response.empty()` and a remote 200 response containing an open body, the call succeeds but the body's cancellation callback never runs. Unlike raw/stream results, the returned value exposes no body for the caller to release. This matters when an upstream server or proxy violates the declared empty-body contract.

Dispose unread transport bodies on successful empty decoding; retain body ownership only for results that actually expose it. Test a 200 response with an unexpected body as well as a genuinely bodyless status.

## 4. MessagePort abort cannot interrupt endpoint setup

Location: `packages/message-port/src/client.ts:338–342`.

The transport checks abort before and after `await ready`, but installs no abort listener during that wait. A custom endpoint is explicitly allowed to subscribe asynchronously. If subscription hangs, aborting the request leaves its promise pending indefinitely. Reproduced with an unresolved subscription promise: the call remains pending after abort, and rejects only after subscription is manually resolved. The WebSocket transport already handles the analogous connecting state.

Make the setup wait abortable while leaving shared endpoint initialization alive for other requests. Verify prompt rejection without resolving setup, and verify the aborted request is not sent if setup later completes.

## Verification

- Standalone reproductions confirmed all four findings, including inline-versus-reference HTTP response comparison and native body cancellation callbacks.
- Fresh core tests: 213 passed.
- Fresh OpenAPI tests: 9 passed.
- Fresh MessagePort tests: 70 passed, 5 skipped.
- `git diff --check` passed.

This pass focused on response ownership, asynchronous setup, and generated-schema semantics. The existing tests pass but do not cover these combinations. The full validation command from the preceding implementation pass was not rerun because production code was unchanged.
