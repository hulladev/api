# Final core cleanup — 2026-09-09

The current core uses typed HTTP contracts, ordinary server-boundary schemas, explicit bidirectional codecs, and one request lifecycle. This pass removes standalone procedures rather than creating another package, removes the async-schema marker/registry, simplifies client stream decoding and server handler collection, and expands cross-validator authoring coverage.

## Verified implementation

- No integration consumed standalone procedures. Applications use ordinary functions or selected in-process clients when they need the contract lifecycle.
- Standard Schema validators and codec callbacks can return promises directly. Public HTTP calls remain promises; no async marker is required.
- Type tests cover Zod, Valibot, custom async schemas, invalid request/response wire representations, optional headers, and nested selections.
- Client throw-mode errors discard data absent from their declaration, matching return-mode behavior.
- Core source: 6,796 → 6,516 lines (280 fewer). Full repository checks pass, including 271 core tests, integrations, packed consumers, runtime probes, and bundle checks.
- Full executable bundle: 46,058 → 45,800 minified bytes; 14,371 → 14,296 gzip bytes. The client fixture changes from 21,286/7,171 to 21,043/7,116 minified/gzip bytes. These are small reductions, not a bundle-size breakthrough.

## Runtime measurements

[Fetch and in-process report](./fetch.md), [raw snapshot](./fetch.json), and [history](./history.ndjson) contain three fresh processes with five samples each. Final measurements ran after repository checks completed. Earlier exploratory rows remain in history under a different workload fingerprint; the final report uses three compatible runs. No historical speedup is claimed across the response-policy change.

| Default operation | Fetch median | In-process median |
| --- | ---: | ---: |
| Static JSON GET | 2.49 µs | 0.89 µs |
| Small JSON POST | 3.95 µs | 1.26 µs |
| Large JSON POST | 44.32 µs | 17.03 µs |

For these three default cases, geometric-mean latency ratios relative to core are Hono 0.86× and ts-rest 1.13×. These are particular fixtures on Bun, not universal product rankings. Ordinary core output validation is server-only; minimal Hono omits output validation. Equivalent-validation and representative application fixtures explicitly add client output checks outside core. The application-profile results must not be presented as the cost of ordinary default core usage.

The generated Fetch report's adapter-cohort link refers to the wider benchmark pipeline; this focused run did not collect native-framework adapter cohorts.

## CPU and allocation evidence

[CPU profile](./cpu-profile.md): a short Bun sample of 150,000 mixed application calls. Native JSON work accounts for 9.7% self time, native Request construction 6.5%, object copying 3.7%, and core setOwn 3.4%. Request-field traversal has 2.7% self time and 31.6% inclusive time; inclusive time includes validation and downstream work and must not be attributed entirely to the traversal helper.

[Allocation summary](./allocation-summary.json), [compressed raw profile](./allocation-profile.json.gz), and [machine-local reproduction script](./allocation-probe.mjs): Node 22.18.0, 20,000 ordinary-schema mixed Fetch calls after warmup. V8 allocation sampling uses a 32 KiB interval and explicitly includes objects collected by minor and major GC. Estimated sampled allocation totals are about 714 MB across the run (roughly 35.7 KB/call), with about 48% attributed to Node internals, 31% to core JavaScript, and 21% other/unattributed. Native external allocations are not fully represented. This is allocation churn, not retained memory or evidence of a leak; it is a different runtime/workload from the Bun timing table.

A separate Bun end-of-run heap snapshot contained 3.9 MB of heap data but is not an allocation profile and is not used to substantiate the allocation claim. No optimization was introduced solely to improve a short profile. Native HTTP objects, JSON processing, and per-request lifecycle allocations are better candidates for subsequent controlled experiments than specialized executors or cached execution plans.

## Large-contract authoring

The diagnostics cover flat and nested contracts with 10, 100, and 1,000 routes. The 1,000-route inferred client export reaches TypeScript TS7056 during declaration serialization even though ordinary checking succeeds. The runner records this failure explicitly and separately verifies the supported annotation:

```ts
export const client: ClientFor<typeof contract> = createClient(contract, { transport })
```

This preserves endpoint types. It is a documented workaround for large library exports, not a claim that inferred declaration emission has been fixed. See the client authoring guide for this pattern. See the completed diagnostics below.


## Completed load and compiler diagnostics

[Readable diagnostics](./diagnostics.md) and [compressed raw observations](./diagnostics.json.gz) retain all three fresh processes, payload scaling, route scaling, socket load, IPC, lifecycle, cold start, and compiler results.

| Routes | Shape | Median compiler process time | Declaration bytes | Client annotation required |
| --- | --- | ---: | ---: | --- |
| 10 | flat | 72.9 ms | 23,840 | no |
| 10 | nested | 73.9 ms | 26,029 | no |
| 100 | flat | 92.8 ms | 220,670 | no |
| 100 | nested | 112.8 ms | 239,059 | no |
| 1000 | flat | 355.1 ms | 1,463,543 | yes |
| 1000 | nested | 881.8 ms | 1,583,825 | yes |

Compiler timings include process startup and use the installed TypeScript 7 compiler. The large declaration files remain a limitation; annotation avoids TS7056 but does not make the whole public contract small. No compiler speedup over the pre-cleanup revision is claimed.

All socket runs reported zero request failures. For core at concurrency 64, p99 latency was approximately 2.20–3.07 ms across processes. At 5,000 offered requests/s, p99 ranged from approximately 1.39–14.74 ms; the direct control also varied substantially. One-second offered-load runs on this shared machine do not establish production capacity or a reliable tail-latency ranking. Heap deltas and RSS are retained per process rather than averaged into an allocation claim.

## Follow-up priorities

The cleanup is complete and the checks pass. The remaining evidence supports focused experiments on request-lifecycle allocations and native parsing/serialization costs, plus smaller public declaration emission for large exported contracts. Neither warrants adding multiple executors, implicit coercion policies, or another general-purpose execution API. The 1,000-route inferred-export limit is explicitly unresolved at the inference level; the documented annotation is verified.
