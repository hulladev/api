# Rejected parameter-materialization experiments — 8 September 2026

The previous goal turn rejected a writer-only optimization and added safety coverage. This turn profiles the dynamic Fetch path and tests two independent ways to reduce parameter overhead. Both candidates were removed; three parameter-decoding regression cases remain. The original parameter encoder improvements from earlier passes are preserved.

## Evidence and candidates

A five-second Node CPU profile of the built dynamic Fetch adapter identifies `setOwn` among the hottest Hulla frames, alongside query decoding and execution-step mapping. Native Fetch/JSON work still dominates. A CPU profile does not measure allocated bytes or prove that changing its hottest helper improves complete requests.

1. Bulk parameter records: replace per-key property descriptors with `Object.fromEntries` for isolated schema groups and merged decoded values. Both forms preserve own properties for prototype-named keys. Three fresh pairs on Bun/Node showed mixed, modest movements; Bun in-process mixed update regressed about 6%, while Node dynamic Fetch was essentially unchanged. The candidate was rejected.
2. Single-declaration compilation: retain original safe property creation but compile a direct decoder when only one parameter declaration exists, removing unnecessary group arrays/wrapper objects. Input isolation and output filtering remain. Main Bun cases improve roughly 3–7%, but Node measurements move with unrelated controls. Follow-up parameter-count measurements do not establish a robust cross-runtime gain. The candidate was rejected rather than retaining a special case based on favorable cells.

## Broader measurement and adverse evidence

The main comparison covers dynamic/static Fetch adapters with direct/Hono controls, REST path/query/body combinations, in-process calls, and codec paths. Each candidate uses three fresh process pairs per runtime, seven shuffled batches of at least 40 ms, 1,000 warmups and 2,000 initial iterations. Before/after order alternates. Public built exports and external dependencies are frozen per variant. Summary values are median process medians, not request latency percentiles.

The second candidate was additionally tested with 1/8/32 path parameters, each in a single declaration and nested declarations. These Fetch calls decode non-ASCII and escaped path values and verify result counts. The initial sequential Node run produced implausible apparent gains around 83%: later cases became roughly six times slower in some before processes, but the same slowdown also appeared in an after process and unchanged nested cases. Those measurements are archived as anomalous observations, not performance wins. The cause was not established.

Each cardinality case was then rerun in its own fresh process, three pairs per runtime, alternating variant order. Bun single-declaration rows improved about 11% at 1/8 parameters and 2% at 32, while unchanged nested rows moved 3–8% slower. Node rows ranged from roughly 7% faster to 10% slower; unchanged nested controls were also inconsistent. That evidence is insufficient to promise reliable production improvement. No experiment changes are retained, so none of these timings should be attributed to the final implementation.

## Retained tests and restoration

New cases verify synchronous/asynchronous nested groups with `__proto__` and `constructor` names, ordinary output prototypes, removal of undeclared output properties, fresh isolated schema inputs, and a single asynchronous declaration returning transformed values. They test contract semantics rather than the discarded fast path.

The candidate source was compared with its frozen after snapshot before restoring only `packages/core/src/contract/parameters.ts` from the original before snapshot. This retains all earlier architecture work and unrelated changes. After restoration, workspace typechecks, all 63 test tasks, builds, public exports and dead-code analysis passed. Core has 254 passing tests. Semantic preflight passed 63 policy operations and 36 focused operations. Targeted lint/format and whitespace checks passed. The restored parameter source matches the before snapshot byte for byte.

[Complete process samples, runtime versions, anomalous runs, reruns and hashes](2026-09-08-parameter-experiments.json) accompany compressed source/build snapshots, executable runners and the CPU profile in ignored `benchmarks/results/parameter-experiments-2026-09-08/`. The broader performance goal remains active. The next architectural investigation should avoid assuming that replacing a helper or specializing a tiny case necessarily improves the whole request path.
