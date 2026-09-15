# Runtime benchmark report

| Metadata | Value |
|---|---|
| Generated | 2026-09-09T10:09:09.054Z |
| Source | @hulla/api 2.0.0 · 525aaadd + local d70c54ed |
| Runtime | Bun 1.4.0 |
| Aggregate | 3 compatible repeated runs; 15 samples |
| Current invocation | 3 runs × 5 samples; at least 20 ms per sample; default batches of 3,000 iterations and 1,000 warmup iterations |
| Raw history | benchmarks/results/final-cleanup-2026-09-09/history.ndjson |

## Contents

- [How to read the report](#how-to-read-the-report)
- [Fetch and in-process coverage](#fetch-and-in-process-coverage)
- [Cross-package overview](#cross-package-overview)
- [Fetch adapter results](#fetch-adapter)
- [Independent adapter cohorts](adapters-latest.md)
- [Bundle footprint](#bundle-footprint)

## How to read the report

- `Median [95% CI]` is median batch-average operation cost, not individual-request latency. Sequential ops/sec is its reciprocal, not loaded throughput.
- `vs direct` and `vs @hulla/api` compare medians only within the same operation and host adapter.
- Aggregate rows use geometric means and require every operation in that cohort; missing coverage is shown as an em dash.
- Rows labeled `@hulla/api` in Fetch tables use Fetch; in-process results are paired in the transport table and listed separately below.
- Native-protocol cohorts compare equivalent work through each package’s own protocol, not identical URL shapes or validation guarantees.

## Fetch and in-process coverage

The same @hulla/api contract, handlers, validation and result checks run through both transports for every everyday scenario. Fetch includes Request/Response creation, HTTP encoding and JSON serialization in memory; it does not use a network socket. In-process passes values directly. This table compares transport costs, not competing packages. HTTP host adapters and raw HTTP body readers have separate transport-specific measurements.

| Profile | Use case | Fetch median [95% CI] | In-process median [95% CI] | Fetch / in-process |
|---|---|---:|---:|---:|
| Recommended everyday setup | Static JSON GET with profile-specific output validation | 2.49 [2.42, 2.54] µs | 0.89 [0.87, 1.01] µs | 2.79× |
| Recommended everyday setup | Small JSON POST with each runtime's request and response validation | 3.95 [3.90, 4.21] µs | 1.26 [1.21, 1.35] µs | 3.14× |
| Recommended everyday setup | Large JSON POST with each runtime's request and response validation | 44.32 [43.80, 44.67] µs | 17.03 [16.44, 17.26] µs | 2.60× |
| Representative application requests | Read one resource through two path parameters | 4.60 [4.51, 4.63] µs | 2.11 [2.06, 2.17] µs | 2.17× |
| Representative application requests | Filtered collection read with a path parameter, scalar and repeated query values, and a header | 9.37 [8.92, 11.49] µs | 3.54 [3.53, 3.57] µs | 2.65× |
| Representative application requests | JSON update with path parameters, query, headers, and validated response | 8.62 [8.31, 8.76] µs | 3.22 [3.19, 3.58] µs | 2.67× |
| Equivalent validation policy | Static JSON GET with profile-specific output validation | 2.50 [2.43, 2.51] µs | 0.96 [0.91, 1.06] µs | 2.60× |
| Equivalent validation policy | Small JSON POST with each runtime's request and response validation | 3.87 [3.81, 3.94] µs | 1.34 [1.32, 1.41] µs | 2.89× |
| Equivalent validation policy | Large JSON POST with each runtime's request and response validation | 53.10 [52.66, 53.42] µs | 25.07 [24.29, 26.36] µs | 2.12× |
| Focused @hulla/api diagnostics | Dynamic path, query, and header transport with directional validation | 6.82 [6.41, 6.86] µs | 2.57 [2.49, 2.58] µs | 2.66× |
| Focused @hulla/api diagnostics | Bidirectional Date codec across client and server HTTP boundaries | 5.09 [4.76, 5.50] µs | 2.08 [1.98, 2.10] µs | 2.45× |
| Focused @hulla/api diagnostics | Ten NDJSON chunks with server schema validation | 16.35 [16.03, 16.46] µs | 9.39 [9.05, 9.55] µs | 1.74× |

## Cross-package overview

Geometric mean of each package’s median-latency ratio to @hulla/api across the listed operations. Lower is faster; `1.00×` is @hulla/api. A cell is omitted unless that package has every operation in the cohort.

| Cohort | Adapter | Operations | Direct | @hulla/api | ts-rest | tRPC | oRPC | Hono |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Recommended everyday setup | Fetch | 3 | 0.44× | 1.00× | 1.13× | 4.32× | 2.40× | 0.86× |
| Representative application requests | Fetch | 3 | 0.40× | 1.00× | 0.94× | 2.95× | 1.55× | 0.98× |
| Equivalent validation policy | Fetch | 3 | 0.46× | 1.00× | 1.16× | 3.69× | 2.37× | 0.94× |

## Measured operation comparisons

Every measured operation is listed below in its host environment. Latencies are medians with deterministic 95% run-level bootstrap intervals; lower is faster. Ratios compare medians within the same operation and adapter. The previous-change column reports the exact change and interval, not a qualitative summary.

### Fetch adapter

#### Recommended everyday setup

Each package uses its simplest practical validated/recommended path. Runtime guarantees differ, so these results show idiomatic cost rather than equal-capability performance.

##### Static JSON GET with profile-specific output validation

```text
GET /health

validate { "ok": true }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.67 [0.66, 0.69] µs | 0.62–0.96 µs | 1.00× | 0.27× | — |
| @hulla/api 2.0.0 | 2.49 [2.42, 2.54] µs | 2.36–8.43 µs | 3.69× | 1.00× | — |
| ts-rest 3.52.1 | 3.13 [3.01, 3.23] µs | 2.86–3.84 µs | 4.64× | 1.26× | — |
| tRPC 11.18.0 | 18.10 [17.60, 21.01] µs | 17.19–26.35 µs | 26.86× | 7.28× | — |
| oRPC 1.15.0 | 8.37 [8.16, 8.58] µs | 8.01–9.47 µs | 12.42× | 3.37× | — |
| Hono RPC 4.13.4 | 1.87 [1.83, 1.87] µs | 1.71–2.27 µs | 2.77× | 0.75× | — |

##### Small JSON POST with each runtime's request and response validation

```text
POST /users

{ "name": "Ada" } → validate { "id": "user-1", "name": "Ada" }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.32 [1.30, 1.34] µs | 1.24–11.57 µs | 1.00× | 0.33× | — |
| @hulla/api 2.0.0 | 3.95 [3.90, 4.21] µs | 3.60–7.48 µs | 3.00× | 1.00× | — |
| ts-rest 3.52.1 | 4.37 [4.35, 4.52] µs | 4.03–7.09 µs | 3.32× | 1.11× | — |
| tRPC 11.18.0 | 21.48 [21.04, 21.63] µs | 20.66–38.68 µs | 16.33× | 5.44× | — |
| oRPC 1.15.0 | 9.31 [9.05, 9.37] µs | 8.90–14.97 µs | 7.08× | 2.36× | — |
| Hono RPC 4.13.4 | 3.18 [3.15, 3.29] µs | 2.94–7.10 µs | 2.42× | 0.81× | — |

##### Large JSON POST with each runtime's request and response validation

```text
POST /large

{ "items": [100 items] } → validate { "count": 100, "items": [100 items] }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 41.90 [40.02, 45.13] µs | 38.90–62.38 µs | 1.00× | 0.95× | — |
| @hulla/api 2.0.0 | 44.32 [43.80, 44.67] µs | 41.90–75.52 µs | 1.06× | 1.00× | — |
| ts-rest 3.52.1 | 45.47 [43.66, 46.47] µs | 42.90–47.40 µs | 1.09× | 1.03× | — |
| tRPC 11.18.0 | 90.28 [85.33, 91.16] µs | 83.00–105.61 µs | 2.15× | 2.04× | — |
| oRPC 1.15.0 | 76.88 [75.61, 79.60] µs | 71.47–193.49 µs | 1.83× | 1.73× | — |
| Hono RPC 4.13.4 | 46.48 [46.24, 46.51] µs | 44.37–65.01 µs | 1.11× | 1.05× | — |

#### Representative application requests

Common REST-shaped reads and writes covering path parameters, query values, headers, and JSON bodies. RPC packages carry the equivalent values through their native protocol.

##### Read one resource through two path parameters

```text
GET /organizations/org-engineering/users/user-42
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.71 [1.71, 1.81] µs | 1.62–2.32 µs | 1.00× | 0.37× | — |
| @hulla/api 2.0.0 | 4.60 [4.51, 4.63] µs | 4.33–7.17 µs | 2.68× | 1.00× | — |
| ts-rest 3.52.1 | 4.35 [4.33, 4.40] µs | 4.21–18.57 µs | 2.54× | 0.95× | — |
| tRPC 11.18.0 | 20.24 [19.92, 20.91] µs | 18.30–24.00 µs | 11.82× | 4.40× | — |
| oRPC 1.15.0 | 9.60 [9.50, 9.61] µs | 9.14–11.90 µs | 5.61× | 2.09× | — |
| Hono RPC 4.13.4 | 4.48 [4.35, 4.77] µs | 4.09–7.91 µs | 2.62× | 0.98× | — |

##### Filtered collection read with a path parameter, scalar and repeated query values, and a header

```text
GET /organizations/org-engineering/users?cursor=next-page&limit=25&role=admin&role=member
x-tenant-token: tenant-secret
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 4.36 [4.29, 4.43] µs | 3.96–17.61 µs | 1.00× | 0.47× | — |
| @hulla/api 2.0.0 | 9.37 [8.92, 11.49] µs | 8.43–15.50 µs | 2.15× | 1.00× | — |
| ts-rest 3.52.1 | 9.23 [8.81, 9.45] µs | 8.48–52.60 µs | 2.12× | 0.99× | — |
| tRPC 11.18.0 | 22.76 [22.64, 24.63] µs | 21.81–132.45 µs | 5.23× | 2.43× | — |
| oRPC 1.15.0 | 12.75 [12.04, 13.23] µs | 11.47–14.70 µs | 2.93× | 1.36× | — |
| Hono RPC 4.13.4 | 8.77 [8.44, 9.31] µs | 7.99–32.52 µs | 2.01× | 0.94× | — |

##### JSON update with path parameters, query, headers, and validated response

```text
PATCH /organizations/org-engineering/users/user-42?notify=true
x-tenant-token: tenant-secret

{ "active": true, "displayName": "Ada Lovelace" }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 3.30 [3.22, 3.38] µs | 2.96–4.31 µs | 1.00× | 0.38× | — |
| @hulla/api 2.0.0 | 8.62 [8.31, 8.76] µs | 8.03–18.21 µs | 2.61× | 1.00× | — |
| ts-rest 3.52.1 | 7.59 [7.41, 7.65] µs | 6.86–8.66 µs | 2.30× | 0.88× | — |
| tRPC 11.18.0 | 20.60 [20.36, 21.16] µs | 19.36–54.54 µs | 6.25× | 2.39× | — |
| oRPC 1.15.0 | 11.23 [10.91, 11.68] µs | 10.66–14.66 µs | 3.41× | 1.30× | — |
| Hono RPC 4.13.4 | 8.92 [8.78, 9.46] µs | 7.88–15.17 µs | 2.70× | 1.04× | — |

#### Equivalent validation policy

Server input, server output, and client output are validated; no manually added client input validation. HTTP/RPC protocol differences remain explicit.

##### Static JSON GET with profile-specific output validation

```text
GET /health

validate { "ok": true }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.75 [0.69, 0.75] µs | 0.62–1.13 µs | 1.00× | 0.30× | — |
| @hulla/api 2.0.0 | 2.50 [2.43, 2.51] µs | 2.26–3.97 µs | 3.35× | 1.00× | — |
| ts-rest 3.52.1 | 3.37 [3.24, 3.42] µs | 2.98–9.58 µs | 4.51× | 1.35× | — |
| tRPC 11.18.0 | 16.02 [15.85, 17.44] µs | 14.95–49.94 µs | 21.44× | 6.40× | — |
| oRPC 1.15.0 | 8.47 [8.11, 8.85] µs | 7.99–13.27 µs | 11.33× | 3.38× | — |
| Hono RPC 4.13.4 | 1.88 [1.85, 1.89] µs | 1.81–2.46 µs | 2.52× | 0.75× | — |

##### Small JSON POST with each runtime's request and response validation

```text
POST /users

{ "name": "Ada" } → validate { "id": "user-1", "name": "Ada" }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.37 [1.32, 1.38] µs | 1.28–1.58 µs | 1.00× | 0.35× | — |
| @hulla/api 2.0.0 | 3.87 [3.81, 3.94] µs | 3.69–20.51 µs | 2.82× | 1.00× | — |
| ts-rest 3.52.1 | 4.39 [4.38, 4.49] µs | 4.19–8.14 µs | 3.20× | 1.13× | — |
| tRPC 11.18.0 | 19.10 [18.58, 19.22] µs | 18.24–25.16 µs | 13.92× | 4.93× | — |
| oRPC 1.15.0 | 9.38 [9.27, 9.73] µs | 8.61–10.76 µs | 6.84× | 2.42× | — |
| Hono RPC 4.13.4 | 3.48 [3.46, 3.49] µs | 3.19–4.89 µs | 2.54× | 0.90× | — |

##### Large JSON POST with each runtime's request and response validation

```text
POST /large

{ "items": [100 items] } → validate { "count": 100, "items": [100 items] }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 49.09 [48.11, 49.51] µs | 46.41–65.18 µs | 1.00× | 0.92× | — |
| @hulla/api 2.0.0 | 53.10 [52.66, 53.42] µs | 49.15–87.67 µs | 1.08× | 1.00× | — |
| ts-rest 3.52.1 | 54.62 [54.62, 58.99] µs | 50.77–73.28 µs | 1.11× | 1.03× | — |
| tRPC 11.18.0 | 84.24 [83.75, 92.26] µs | 78.91–92.54 µs | 1.72× | 1.59× | — |
| oRPC 1.15.0 | 86.00 [84.64, 95.25] µs | 79.05–130.85 µs | 1.75× | 1.62× | — |
| Hono RPC 4.13.4 | 64.70 [63.70, 71.10] µs | 59.84–118.32 µs | 1.32× | 1.22× | — |

##### Loaded-module application construction plus the first validated request

```text
build contract/router + server adapter + client
await client.health()
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.45 [0.43, 0.51] µs | 0.39–0.85 µs | 1.00× | 0.04× | — |
| @hulla/api 2.0.0 | 10.81 [10.42, 11.28] µs | 9.84–13.81 µs | 23.93× | 1.00× | — |
| ts-rest 3.52.1 | 6.48 [6.04, 6.77] µs | 5.52–8.20 µs | 14.35× | 0.60× | — |
| tRPC 11.18.0 | 23.33 [22.90, 24.52] µs | 21.17–34.65 µs | 51.62× | 2.16× | — |
| oRPC 1.15.0 | 10.54 [10.48, 10.77] µs | 9.45–12.69 µs | 23.33× | 0.97× | — |
| Hono RPC 4.13.4 | 4.52 [4.50, 4.69] µs | 4.01–6.12 µs | 10.01× | 0.42× | — |

#### Focused @hulla/api diagnostics

Feature-specific measurements show the cost of transport encoding, middleware, validation errors, codecs and streams. Each row names its execution path; HTTP-only fixtures do not imply an in-process measurement.

##### Server adapter dispatch with a host-parsed JSON body

```text
adapter.dispatch({ method: "POST", path: "/execute", body: { value: 21 } }) // body already parsed by host
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.24 [0.23, 0.25] µs | 0.23–0.37 µs | 1.00× | — | — |
| @hulla/api 2.0.0 - Adapter | 0.74 [0.71, 0.76] µs | 0.69–0.80 µs | 3.01× | — | — |
| @hulla/api 2.0.0 - Fetch | 2.56 [2.52, 2.57] µs | 2.38–6.09 µs | 10.43× | — | — |

##### Static route dispatch through a 256-route server

```text
adapter.dispatch({ method: "GET", path: "/static/255" }) // 256 registered routes
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.19 [0.18, 0.20] µs | 0.17–0.25 µs | 1.00× | 0.30× | — |
| @hulla/api 2.0.0 - Adapter | 0.62 [0.60, 0.64] µs | 0.58–1.32 µs | 3.35× | 1.00× | — |

##### Parameterized route dispatch through a 256-route server

```text
adapter.dispatch({ method: "GET", path: "/dynamic/255/item%2F42" }) // 256 registered routes
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.47 [0.46, 0.49] µs | 0.42–0.76 µs | 1.00× | 0.37× | — |
| @hulla/api 2.0.0 - Adapter | 1.29 [1.29, 1.30] µs | 1.25–2.05 µs | 2.71× | 1.00× | — |

##### Server implementation construction plus Fetch handler creation

```text
const handler = adapter.mount(server.compose(...fragments))
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch - raw route handler | 0.03 [0.03, 0.04] µs | 0.02–0.05 µs | 1.00× | — | — |
| @hulla/api 2.0.0 - Composed fragments | 4.56 [4.55, 4.71] µs | 4.27–7.04 µs | 150.59× | — | — |
| @hulla/api 2.0.0 - Four standalone fragments | 4.30 [4.24, 4.37] µs | 4.03–6.94 µs | 141.76× | — | — |
| @hulla/api 2.0.0 - Root implementation | 3.02 [2.89, 3.20] µs | 2.83–6.86 µs | 99.67× | — | — |
| @hulla/api 2.0.0 - Scoped root implementation | 3.17 [3.16, 3.37] µs | 2.94–3.75 µs | 104.60× | — | — |
| @hulla/api 2.0.0 - Standalone fragment | 1.07 [1.04, 1.09] µs | 0.98–19.13 µs | 35.29× | — | — |

##### Hot dispatch through complete implementations and implementation fragments

```text
await handler(new Request("https://bench.local/implementation/3")) // reuse a prebuilt implementation
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch - raw route handler | 0.10 [0.10, 0.10] µs | 0.09–0.21 µs | 1.00× | — | — |
| @hulla/api 2.0.0 - Composed fragments | 1.16 [1.11, 1.20] µs | 1.09–1.36 µs | 11.69× | — | — |
| @hulla/api 2.0.0 - Root implementation | 1.18 [1.17, 1.23] µs | 1.05–1.36 µs | 11.98× | — | — |
| @hulla/api 2.0.0 - Standalone fragment | 1.18 [1.17, 1.22] µs | 1.10–1.37 µs | 11.90× | — | — |

##### Dynamic path, query, and header transport with directional validation

```text
GET /items/item%2F42?limit=10
x-token: secret

validate path, query, and header in both directions
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 2.26 [2.20, 2.39] µs | 2.09–5.29 µs | 1.00× | 0.33× | — |
| @hulla/api 2.0.0 | 6.82 [6.41, 6.86] µs | 6.28–19.42 µs | 3.02× | 1.00× | — |

##### Client and server context plus one middleware layer

```text
GET /protected

client middleware → transport → server context + middleware → handler
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.71 [0.71, 0.77] µs | 0.62–4.75 µs | 1.00× | 0.24× | — |
| @hulla/api 2.0.0 | 3.00 [2.90, 3.07] µs | 2.79–3.50 µs | 4.22× | 1.00× | — |

##### Invalid server request validation and protocol error serialization

```text
POST /failure

{ "count": -1 } → serialized request-validation error
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 3.51 [3.47, 3.53] µs | 3.34–29.24 µs | 1.00× | 0.66× | — |
| @hulla/api 2.0.0 | 5.28 [5.16, 5.37] µs | 4.82–14.73 µs | 1.51× | 1.00× | — |

##### Bidirectional Date codec across client and server HTTP boundaries

```text
POST /codec

Date → ISO string over HTTP → Date
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.68 [1.65, 1.69] µs | 1.55–2.56 µs | 1.00× | 0.33× | — |
| @hulla/api 2.0.0 | 5.09 [4.76, 5.50] µs | 4.54–8.34 µs | 3.03× | 1.00× | — |

##### Ten NDJSON chunks with server schema validation

```text
GET /events

server yields 10 values → NDJSON stream → client validates 10 values
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 5.38 [5.33, 5.75] µs | 5.14–15.99 µs | 1.00× | 0.33× | — |
| @hulla/api 2.0.0 | 16.35 [16.03, 16.46] µs | 15.15–18.43 µs | 3.04× | 1.00× | — |

### No host adapter

#### Recommended everyday setup

Each package uses its simplest practical validated/recommended path. Runtime guarantees differ, so these results show idiomatic cost rather than equal-capability performance.

##### Static JSON GET with profile-specific output validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 0.89 [0.87, 1.01] µs | 0.82–1.01 µs | — | 1.00× | — |

##### Small JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 1.26 [1.21, 1.35] µs | 1.14–1.44 µs | — | 1.00× | — |

##### Large JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 17.03 [16.44, 17.26] µs | 16.12–18.72 µs | — | 1.00× | — |

#### Representative application requests

Common REST-shaped reads and writes covering path parameters, query values, headers, and JSON bodies. RPC packages carry the equivalent values through their native protocol.

##### Read one resource through two path parameters

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 2.11 [2.06, 2.17] µs | 1.97–2.35 µs | — | 1.00× | — |

##### Filtered collection read with a path parameter, scalar and repeated query values, and a header

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 3.54 [3.53, 3.57] µs | 3.13–7.51 µs | — | 1.00× | — |

##### JSON update with path parameters, query, headers, and validated response

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 3.22 [3.19, 3.58] µs | 3.07–4.02 µs | — | 1.00× | — |

#### Equivalent validation policy

Server input, server output, and client output are validated; no manually added client input validation. HTTP/RPC protocol differences remain explicit.

##### Static JSON GET with profile-specific output validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 0.96 [0.91, 1.06] µs | 0.86–1.17 µs | — | 1.00× | — |

##### Small JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 1.34 [1.32, 1.41] µs | 1.22–2.44 µs | — | 1.00× | — |

##### Large JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 25.07 [24.29, 26.36] µs | 22.98–52.85 µs | — | 1.00× | — |

#### Focused @hulla/api diagnostics

Feature-specific measurements show the cost of transport encoding, middleware, validation errors, codecs and streams. Each row names its execution path; HTTP-only fixtures do not imply an in-process measurement.

##### Dynamic path, query, and header transport with directional validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 2.57 [2.49, 2.58] µs | 2.32–6.76 µs | — | 1.00× | — |

##### Bidirectional Date codec across client and server HTTP boundaries

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 2.08 [1.98, 2.10] µs | 1.89–7.63 µs | — | 1.00× | — |

##### Ten NDJSON chunks with server schema validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 9.39 [9.05, 9.55] µs | 8.28–13.76 µs | — | 1.00× | — |

## Bundle footprint

Production consumer bundles are minified for Bun with Zod externalized because it is a user-supplied schema library. Gzip uses level 9.

### Executable package comparison

Each row builds a representative one-route schema/contract, client, server execution path, and in-memory Fetch transport using that package’s normal guarantees. These are the comparable package results.

| Package | Imports | Minified | vs @hulla/api | Gzip | vs @hulla/api |
|---|---|---:|---:|---:|---:|
| @hulla/api 2.0.0 | @hulla/api + /client + /server + /fetch | 44.73 KiB | 1.00× | 13.96 KiB | 1.00× |
| tRPC 11.18.0 | @trpc/client + @trpc/server | 65.33 KiB | 1.46× | 19.35 KiB | 1.39× |
| oRPC 1.15.0 | @orpc/client + @orpc/server | 37.05 KiB | 0.83× | 11.87 KiB | 0.85× |
| ts-rest 3.52.1 | @ts-rest/core + @ts-rest/serverless/fetch | 17.58 KiB | 0.39× | 6.09 KiB | 0.44× |
| Hono RPC 4.13.4 | hono + hono/client | 22.99 KiB | 0.51× | 9.24 KiB | 0.66× |

### @hulla/api tree-shaking checks

Each row is an independent consumer entry point, not an additive component breakdown. “Retained” is relative to the complete @hulla/api Fetch client-and-server scenario above.

| Retained usage | Imports | Minified | Minified share | Gzip | Gzip share |
|---|---|---:|---:|---:|---:|
| Full Fetch client + server | @hulla/api + /client + /server + /fetch | 44.73 KiB | 100.0% | 13.96 KiB | 100.0% |
| Contract declarations | @hulla/api | 8.74 KiB | 19.5% | 3.11 KiB | 22.3% |
| Transport-neutral client | @hulla/api + /client | 20.55 KiB | 45.9% | 6.95 KiB | 49.8% |
| Transport-neutral server | @hulla/api + /server | 14.50 KiB | 32.4% | 5.01 KiB | 35.9% |
| Transport-neutral client + server | @hulla/api + /client + /server | 25.68 KiB | 57.4% | 8.56 KiB | 61.3% |
| Fetch client transport | @hulla/api/fetch (fetchTransport) | 3.47 KiB | 7.8% | 1.55 KiB | 11.1% |
| Fetch server adapter | @hulla/api/fetch (fetchAdapter) | 19.12 KiB | 42.7% | 6.51 KiB | 46.6% |
| Core adapter dispatcher | @hulla/api/adapters (createAdapterHandler) | 13.58 KiB | 30.4% | 4.85 KiB | 34.7% |
| MessagePort client transport | @hulla/api-message-port (messagePortTransport) | 7.36 KiB | 16.5% | 2.63 KiB | 18.8% |
| MessagePort server adapter | @hulla/api-message-port (messagePortAdapter) | 21.78 KiB | 48.7% | 7.17 KiB | 51.3% |
| Express server adapter | @hulla/api-express (expressAdapter) | 17.91 KiB | 40.0% | 6.09 KiB | 43.6% |
| Node HTTP server adapter | @hulla/api-node/http (nodeHttpAdapter) | 20.07 KiB | 44.9% | 6.88 KiB | 49.3% |
| Fastify server adapter | @hulla/api-fastify (fastifyAdapter) | 16.29 KiB | 36.4% | 5.57 KiB | 39.9% |
| Hono server adapter | @hulla/api-hono (honoAdapter) | 21.88 KiB | 48.9% | 7.55 KiB | 54.1% |
| H3 server adapter | @hulla/api-h3 (h3Adapter) | 16.94 KiB | 37.9% | 5.81 KiB | 41.6% |
| Cloudflare Workers adapter | @hulla/api-cloudflare (cloudflareAdapter) | 19.43 KiB | 43.4% | 6.60 KiB | 47.3% |
| Cloudflare Pages Functions adapter | @hulla/api-cloudflare/pages (cloudflarePagesAdapter) | 19.34 KiB | 43.2% | 6.57 KiB | 47.0% |
| Google Cloud Run functions adapter | @hulla/api-google-cloud-functions (googleCloudFunctionsAdapter) | 21.42 KiB | 47.9% | 7.27 KiB | 52.0% |
| Netlify Functions adapter | @hulla/api-netlify-functions (netlifyFunctionsAdapter) | 19.38 KiB | 43.3% | 6.57 KiB | 47.1% |
| Next.js server adapter | @hulla/api-next/server (nextAdapter) | 19.83 KiB | 44.3% | 6.73 KiB | 48.2% |
| TanStack Start server adapter | @hulla/api-tanstack-start (tanStackStartAdapter) | 19.98 KiB | 44.7% | 6.80 KiB | 48.7% |
| React Router v7 server adapter | @hulla/api-react-router (reactRouterAdapter) | 20.12 KiB | 45.0% | 6.83 KiB | 48.9% |
| SolidStart server adapter | @hulla/api-solid-start (solidStartAdapter) | 19.99 KiB | 44.7% | 6.80 KiB | 48.7% |
| SvelteKit server adapter | @hulla/api-sveltekit/server (svelteKitAdapter) | 19.98 KiB | 44.7% | 6.80 KiB | 48.7% |
| SvelteKit remote transport | @hulla/api-sveltekit/remote (svelteKitRemoteTransport) | 14.45 KiB | 32.3% | 5.16 KiB | 36.9% |
| Nuxt server adapter | @hulla/api-nuxt/server (nuxtAdapter) | 19.97 KiB | 44.7% | 6.81 KiB | 48.7% |
| Nuxt request-aware client transport | @hulla/api-nuxt/client (nuxtFetchTransport) | 3.35 KiB | 7.5% | 1.49 KiB | 10.7% |
| Astro server adapter | @hulla/api-astro (astroAdapter) | 19.46 KiB | 43.5% | 6.62 KiB | 47.4% |
| Astro in-process transport | @hulla/api-astro (astroInProcessTransport) | 14.36 KiB | 32.1% | 5.10 KiB | 36.6% |
| ts-rest 3.52.1 - stable core | @ts-rest/core@3.52.1 | 5.62 KiB | 12.6% | 2.19 KiB | 15.7% |
| ts-rest 3.52.1 - Zod 4 RC core | @ts-rest/core@3.53.0-rc.1 | 60.91 KiB | 136.2% | 15.00 KiB | 107.5% |
