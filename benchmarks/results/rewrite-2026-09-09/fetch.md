# Runtime benchmark report

| Metadata | Value |
|---|---|
| Generated | 2026-09-09T08:20:34.036Z |
| Source | @hulla/api 2.0.0 · 525aaadd + local 360b6fe5 |
| Runtime | Bun 1.4.0 |
| Aggregate | 3 compatible repeated runs; 15 samples |
| Current invocation | 3 runs × 5 samples; at least 20 ms per sample; default batches of 3,000 iterations and 1,000 warmup iterations |
| Raw history | benchmarks/results/rewrite-2026-09-09/history.ndjson |

## Contents

- [How to read the report](#how-to-read-the-report)
- [Fetch and in-process coverage](#fetch-and-in-process-coverage)
- [Cross-package overview](#cross-package-overview)
- [Fetch adapter results](#fetch-adapter)
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
| Recommended everyday setup | Static JSON GET with server and client output validation | 2.41 [2.31, 2.43] µs | 0.94 [0.93, 0.96] µs | 2.56× |
| Recommended everyday setup | Small JSON POST with each runtime's request and response validation | 3.96 [3.89, 4.17] µs | 1.28 [1.26, 1.33] µs | 3.08× |
| Recommended everyday setup | Large JSON POST with each runtime's request and response validation | 50.28 [50.26, 50.55] µs | 23.25 [22.91, 23.45] µs | 2.16× |
| Representative application requests | Read one resource through two path parameters | 4.63 [4.55, 4.76] µs | 2.18 [2.16, 2.21] µs | 2.12× |
| Representative application requests | Filtered collection read with a path parameter, scalar and repeated query values, and a header | 8.87 [8.67, 9.00] µs | 3.49 [3.41, 3.56] µs | 2.54× |
| Representative application requests | JSON update with path parameters, query, headers, and validated response | 8.39 [8.33, 8.60] µs | 3.37 [3.30, 3.37] µs | 2.49× |
| Equivalent validation policy | Static JSON GET with server and client output validation | 2.39 [2.33, 2.42] µs | 0.97 [0.97, 0.99] µs | 2.46× |
| Equivalent validation policy | Small JSON POST with each runtime's request and response validation | 3.83 [3.66, 3.88] µs | 1.26 [1.23, 1.27] µs | 3.05× |
| Equivalent validation policy | Large JSON POST with each runtime's request and response validation | 50.23 [49.66, 51.09] µs | 24.14 [23.50, 36.40] µs | 2.08× |
| Focused @hulla/api diagnostics | Dynamic path, query, and header transport with directional validation | 6.50 [6.48, 6.65] µs | 2.51 [2.47, 2.55] µs | 2.59× |
| Focused @hulla/api diagnostics | Bidirectional Date codec across client and server HTTP boundaries | 4.68 [4.60, 4.68] µs | 2.00 [1.94, 2.04] µs | 2.33× |
| Focused @hulla/api diagnostics | Ten NDJSON chunks with server and client schema validation | 17.95 [17.78, 17.96] µs | 11.08 [10.98, 11.21] µs | 1.62× |

## Cross-package overview

Geometric mean of each package’s median-latency ratio to @hulla/api across the listed operations. Lower is faster; `1.00×` is @hulla/api. A cell is omitted unless that package has every operation in the cohort.

| Cohort | Adapter | Operations | Direct | @hulla/api | ts-rest | tRPC | oRPC | Hono |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Recommended everyday setup | Fetch | 3 | 0.40× | 1.00× | 1.02× | 3.97× | 2.20× | 0.78× |
| Representative application requests | Fetch | 3 | 0.39× | 1.00× | 0.89× | 2.89× | 1.48× | 0.93× |
| Equivalent validation policy | Fetch | 3 | 0.44× | 1.00× | 1.12× | 3.62× | 2.29× | 0.93× |

## Measured operation comparisons

Every measured operation is listed below in its host environment. Latencies are medians with deterministic 95% run-level bootstrap intervals; lower is faster. Ratios compare medians within the same operation and adapter. The previous-change column reports the exact change and interval, not a qualitative summary.

### Fetch adapter

#### Recommended everyday setup

Each package uses its simplest practical validated/recommended path. Runtime guarantees differ, so these results show idiomatic cost rather than equal-capability performance.

##### Static JSON GET with server and client output validation

```text
GET /health

validate { "ok": true }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.64 [0.63, 0.65] µs | 0.59–0.69 µs | 1.00× | 0.26× | — |
| @hulla/api 2.0.0 | 2.41 [2.31, 2.43] µs | 2.20–2.53 µs | 3.79× | 1.00× | — |
| ts-rest 3.52.1 | 2.92 [2.88, 3.08] µs | 2.72–3.83 µs | 4.59× | 1.21× | — |
| tRPC 11.18.0 | 17.69 [17.44, 18.13] µs | 16.80–20.59 µs | 27.82× | 7.34× | — |
| oRPC 1.15.0 | 8.10 [8.05, 8.22] µs | 7.54–8.96 µs | 12.74× | 3.36× | — |
| Hono RPC 4.13.4 | 1.72 [1.70, 1.76] µs | 1.67–1.91 µs | 2.71× | 0.72× | — |

##### Small JSON POST with each runtime's request and response validation

```text
POST /users

{ "name": "Ada" } → validate { "id": "user-1", "name": "Ada" }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.25 [1.25, 1.27] µs | 1.22–1.34 µs | 1.00× | 0.32× | — |
| @hulla/api 2.0.0 | 3.96 [3.89, 4.17] µs | 3.70–4.97 µs | 3.15× | 1.00× | — |
| ts-rest 3.52.1 | 4.07 [3.98, 4.25] µs | 3.86–4.54 µs | 3.24× | 1.03× | — |
| tRPC 11.18.0 | 20.17 [19.80, 21.22] µs | 19.03–22.49 µs | 16.08× | 5.10× | — |
| oRPC 1.15.0 | 8.85 [8.68, 9.13] µs | 8.13–9.30 µs | 7.06× | 2.24× | — |
| Hono RPC 4.13.4 | 3.01 [2.99, 3.08] µs | 2.83–3.96 µs | 2.40× | 0.76× | — |

##### Large JSON POST with each runtime's request and response validation

```text
POST /large

{ "items": [100 items] } → validate { "count": 100, "items": [100 items] }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 38.83 [37.99, 39.21] µs | 36.94–44.53 µs | 1.00× | 0.77× | — |
| @hulla/api 2.0.0 | 50.28 [50.26, 50.55] µs | 48.58–53.27 µs | 1.29× | 1.00× | — |
| ts-rest 3.52.1 | 43.13 [42.63, 43.89] µs | 41.78–46.24 µs | 1.11× | 0.86× | — |
| tRPC 11.18.0 | 84.22 [80.78, 85.79] µs | 79.17–103.49 µs | 2.17× | 1.68× | — |
| oRPC 1.15.0 | 71.15 [70.37, 71.91] µs | 68.86–81.54 µs | 1.83× | 1.42× | — |
| Hono RPC 4.13.4 | 44.30 [43.98, 45.69] µs | 42.02–46.75 µs | 1.14× | 0.88× | — |

#### Representative application requests

Common REST-shaped reads and writes covering path parameters, query values, headers, and JSON bodies. RPC packages carry the equivalent values through their native protocol.

##### Read one resource through two path parameters

```text
GET /organizations/org-engineering/users/user-42
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.63 [1.62, 1.66] µs | 1.45–4.82 µs | 1.00× | 0.35× | — |
| @hulla/api 2.0.0 | 4.63 [4.55, 4.76] µs | 4.37–5.48 µs | 2.84× | 1.00× | — |
| ts-rest 3.52.1 | 4.16 [4.14, 4.17] µs | 3.90–5.80 µs | 2.55× | 0.90× | — |
| tRPC 11.18.0 | 19.04 [18.72, 19.23] µs | 18.47–19.99 µs | 11.68× | 4.11× | — |
| oRPC 1.15.0 | 9.17 [9.13, 9.20] µs | 8.65–10.60 µs | 5.62× | 1.98× | — |
| Hono RPC 4.13.4 | 4.28 [4.25, 4.33] µs | 4.07–4.53 µs | 2.62× | 0.92× | — |

##### Filtered collection read with a path parameter, scalar and repeated query values, and a header

```text
GET /organizations/org-engineering/users?cursor=next-page&limit=25&role=admin&role=member
x-tenant-token: tenant-secret
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 4.00 [3.97, 4.25] µs | 3.72–4.86 µs | 1.00× | 0.45× | — |
| @hulla/api 2.0.0 | 8.87 [8.67, 9.00] µs | 8.56–9.52 µs | 2.22× | 1.00× | — |
| ts-rest 3.52.1 | 8.39 [8.21, 8.57] µs | 8.00–8.85 µs | 2.10× | 0.95× | — |
| tRPC 11.18.0 | 21.81 [21.29, 21.84] µs | 20.49–43.19 µs | 5.45× | 2.46× | — |
| oRPC 1.15.0 | 11.62 [11.38, 12.30] µs | 11.15–13.30 µs | 2.90× | 1.31× | — |
| Hono RPC 4.13.4 | 7.99 [7.91, 8.04] µs | 7.42–9.29 µs | 2.00× | 0.90× | — |

##### JSON update with path parameters, query, headers, and validated response

```text
PATCH /organizations/org-engineering/users/user-42?notify=true
x-tenant-token: tenant-secret

{ "active": true, "displayName": "Ada Lovelace" }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 3.11 [3.04, 3.14] µs | 2.88–3.26 µs | 1.00× | 0.37× | — |
| @hulla/api 2.0.0 | 8.39 [8.33, 8.60] µs | 7.99–9.19 µs | 2.70× | 1.00× | — |
| ts-rest 3.52.1 | 6.91 [6.57, 7.07] µs | 6.47–8.74 µs | 2.23× | 0.82× | — |
| tRPC 11.18.0 | 19.94 [19.77, 20.13] µs | 19.34–32.19 µs | 6.42× | 2.38× | — |
| oRPC 1.15.0 | 10.45 [10.22, 10.45] µs | 10.04–10.72 µs | 3.37× | 1.25× | — |
| Hono RPC 4.13.4 | 8.21 [8.14, 8.27] µs | 7.45–9.13 µs | 2.64× | 0.98× | — |

#### Equivalent validation policy

Server input, server output, and client output are validated; no manually added client input validation. HTTP/RPC protocol differences remain explicit.

##### Static JSON GET with server and client output validation

```text
GET /health

validate { "ok": true }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.66 [0.64, 0.75] µs | 0.62–0.88 µs | 1.00× | 0.28× | — |
| @hulla/api 2.0.0 | 2.39 [2.33, 2.42] µs | 2.14–2.57 µs | 3.64× | 1.00× | — |
| ts-rest 3.52.1 | 3.02 [2.95, 3.07] µs | 2.75–3.58 µs | 4.59× | 1.26× | — |
| tRPC 11.18.0 | 15.05 [14.56, 15.15] µs | 14.28–17.58 µs | 22.86× | 6.29× | — |
| oRPC 1.15.0 | 7.89 [7.70, 8.04] µs | 7.57–8.82 µs | 11.99× | 3.30× | — |
| Hono RPC 4.13.4 | 1.83 [1.79, 1.88] µs | 1.69–2.01 µs | 2.78× | 0.77× | — |

##### Small JSON POST with each runtime's request and response validation

```text
POST /users

{ "name": "Ada" } → validate { "id": "user-1", "name": "Ada" }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.32 [1.30, 1.34] µs | 1.24–1.41 µs | 1.00× | 0.34× | — |
| @hulla/api 2.0.0 | 3.83 [3.66, 3.88] µs | 3.59–4.71 µs | 2.91× | 1.00× | — |
| ts-rest 3.52.1 | 4.22 [4.15, 4.28] µs | 3.98–4.70 µs | 3.21× | 1.10× | — |
| tRPC 11.18.0 | 18.11 [18.06, 19.77] µs | 17.38–20.61 µs | 13.75× | 4.72× | — |
| oRPC 1.15.0 | 8.69 [8.30, 8.73] µs | 8.16–9.52 µs | 6.60× | 2.27× | — |
| Hono RPC 4.13.4 | 3.25 [3.17, 3.27] µs | 3.00–5.52 µs | 2.47× | 0.85× | — |

##### Large JSON POST with each runtime's request and response validation

```text
POST /large

{ "items": [100 items] } → validate { "count": 100, "items": [100 items] }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 46.27 [46.02, 46.68] µs | 44.58–64.63 µs | 1.00× | 0.92× | — |
| @hulla/api 2.0.0 | 50.23 [49.66, 51.09] µs | 46.75–52.01 µs | 1.09× | 1.00× | — |
| ts-rest 3.52.1 | 50.55 [50.48, 51.73] µs | 48.98–55.47 µs | 1.09× | 1.01× | — |
| tRPC 11.18.0 | 80.09 [77.99, 83.15] µs | 74.59–94.03 µs | 1.73× | 1.59× | — |
| oRPC 1.15.0 | 81.01 [80.51, 84.13] µs | 75.10–85.32 µs | 1.75× | 1.61× | — |
| Hono RPC 4.13.4 | 61.54 [61.06, 62.07] µs | 57.73–87.43 µs | 1.33× | 1.23× | — |

##### Loaded-module application construction plus the first validated request

```text
build contract/router + server adapter + client
await client.health()
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.42 [0.41, 0.42] µs | 0.38–0.49 µs | 1.00× | 0.04× | — |
| @hulla/api 2.0.0 | 9.83 [9.82, 10.00] µs | 9.51–12.44 µs | 23.54× | 1.00× | — |
| ts-rest 3.52.1 | 5.77 [5.55, 5.81] µs | 5.39–6.74 µs | 13.82× | 0.59× | — |
| tRPC 11.18.0 | 21.48 [20.97, 22.11] µs | 20.64–24.11 µs | 51.48× | 2.19× | — |
| oRPC 1.15.0 | 10.02 [9.76, 10.04] µs | 9.47–16.04 µs | 24.01× | 1.02× | — |
| Hono RPC 4.13.4 | 4.37 [4.24, 4.51] µs | 3.87–4.94 µs | 10.46× | 0.44× | — |

#### Focused @hulla/api diagnostics

Feature-specific measurements show the cost of transport encoding, middleware, validation errors, codecs and streams. Each row names its execution path; HTTP-only fixtures do not imply an in-process measurement.

##### Server adapter dispatch with a host-parsed JSON body

```text
adapter.dispatch({ method: "POST", path: "/execute", body: { value: 21 } }) // body already parsed by host
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.23 [0.23, 0.23] µs | 0.22–0.27 µs | 1.00× | — | — |
| @hulla/api 2.0.0 - Adapter | 0.74 [0.74, 0.75] µs | 0.69–0.78 µs | 3.22× | — | — |
| @hulla/api 2.0.0 - Fetch | 2.45 [2.39, 2.51] µs | 2.29–2.69 µs | 10.60× | — | — |

##### Static route dispatch through a 256-route server

```text
adapter.dispatch({ method: "GET", path: "/static/255" }) // 256 registered routes
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.18 [0.18, 0.18] µs | 0.17–0.22 µs | 1.00× | 0.29× | — |
| @hulla/api 2.0.0 - Adapter | 0.63 [0.61, 0.64] µs | 0.58–0.66 µs | 3.48× | 1.00× | — |

##### Parameterized route dispatch through a 256-route server

```text
adapter.dispatch({ method: "GET", path: "/dynamic/255/item%2F42" }) // 256 registered routes
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.45 [0.44, 0.45] µs | 0.41–0.49 µs | 1.00× | 0.35× | — |
| @hulla/api 2.0.0 - Adapter | 1.28 [1.25, 1.29] µs | 1.21–2.20 µs | 2.84× | 1.00× | — |

##### Server implementation construction plus Fetch handler creation

```text
const handler = adapter.mount(server.compose(...fragments))
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch - raw route handler | 0.03 [0.02, 0.03] µs | 0.02–0.06 µs | 1.00× | — | — |
| @hulla/api 2.0.0 - Composed fragments | 4.33 [4.32, 4.36] µs | 4.10–4.62 µs | 168.24× | — | — |
| @hulla/api 2.0.0 - Four standalone fragments | 3.90 [3.88, 3.99] µs | 3.77–4.08 µs | 151.64× | — | — |
| @hulla/api 2.0.0 - Root implementation | 2.88 [2.85, 2.94] µs | 2.73–3.63 µs | 111.91× | — | — |
| @hulla/api 2.0.0 - Scoped root implementation | 2.90 [2.89, 3.08] µs | 2.79–3.50 µs | 112.81× | — | — |
| @hulla/api 2.0.0 - Standalone fragment | 0.98 [0.97, 0.99] µs | 0.90–1.07 µs | 38.00× | — | — |

##### Hot dispatch through complete implementations and implementation fragments

```text
await handler(new Request("https://bench.local/implementation/3")) // reuse a prebuilt implementation
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch - raw route handler | 0.09 [0.09, 0.10] µs | 0.09–0.10 µs | 1.00× | — | — |
| @hulla/api 2.0.0 - Composed fragments | 1.13 [1.11, 1.19] µs | 1.07–1.29 µs | 11.97× | — | — |
| @hulla/api 2.0.0 - Root implementation | 1.16 [1.12, 1.17] µs | 1.05–1.48 µs | 12.37× | — | — |
| @hulla/api 2.0.0 - Standalone fragment | 1.15 [1.15, 1.17] µs | 1.07–1.25 µs | 12.25× | — | — |

##### Dynamic path, query, and header transport with directional validation

```text
GET /items/item%2F42?limit=10
x-token: secret

validate path, query, and header in both directions
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 2.10 [2.09, 2.11] µs | 2.05–2.35 µs | 1.00× | 0.32× | — |
| @hulla/api 2.0.0 | 6.50 [6.48, 6.65] µs | 6.25–6.96 µs | 3.10× | 1.00× | — |

##### Client and server context plus one middleware layer

```text
GET /protected

client middleware → transport → server context + middleware → handler
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.64 [0.64, 0.69] µs | 0.59–1.33 µs | 1.00× | 0.21× | — |
| @hulla/api 2.0.0 | 3.07 [2.95, 3.08] µs | 2.89–3.43 µs | 4.76× | 1.00× | — |

##### Invalid server request validation and protocol error serialization

```text
POST /failure

{ "count": -1 } → serialized request-validation error
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 3.34 [3.22, 3.36] µs | 3.11–3.53 µs | 1.00× | 0.71× | — |
| @hulla/api 2.0.0 | 4.69 [4.65, 4.98] µs | 4.44–5.24 µs | 1.41× | 1.00× | — |

##### Bidirectional Date codec across client and server HTTP boundaries

```text
POST /codec

Date → ISO string over HTTP → Date
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.62 [1.60, 1.69] µs | 1.52–1.69 µs | 1.00× | 0.35× | — |
| @hulla/api 2.0.0 | 4.68 [4.60, 4.68] µs | 4.37–4.88 µs | 2.89× | 1.00× | — |

##### Ten NDJSON chunks with server and client schema validation

```text
GET /events

server yields 10 values → NDJSON stream → client validates 10 values
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 5.07 [4.99, 5.21] µs | 4.88–5.47 µs | 1.00× | 0.28× | — |
| @hulla/api 2.0.0 | 17.95 [17.78, 17.96] µs | 16.66–20.03 µs | 3.54× | 1.00× | — |

### No host adapter

#### Recommended everyday setup

Each package uses its simplest practical validated/recommended path. Runtime guarantees differ, so these results show idiomatic cost rather than equal-capability performance.

##### Static JSON GET with server and client output validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 0.94 [0.93, 0.96] µs | 0.88–1.10 µs | — | 1.00× | — |

##### Small JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 1.28 [1.26, 1.33] µs | 1.15–1.90 µs | — | 1.00× | — |

##### Large JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 23.25 [22.91, 23.45] µs | 22.56–24.39 µs | — | 1.00× | — |

#### Representative application requests

Common REST-shaped reads and writes covering path parameters, query values, headers, and JSON bodies. RPC packages carry the equivalent values through their native protocol.

##### Read one resource through two path parameters

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 2.18 [2.16, 2.21] µs | 2.05–3.33 µs | — | 1.00× | — |

##### Filtered collection read with a path parameter, scalar and repeated query values, and a header

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 3.49 [3.41, 3.56] µs | 3.23–3.85 µs | — | 1.00× | — |

##### JSON update with path parameters, query, headers, and validated response

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 3.37 [3.30, 3.37] µs | 3.18–5.77 µs | — | 1.00× | — |

#### Equivalent validation policy

Server input, server output, and client output are validated; no manually added client input validation. HTTP/RPC protocol differences remain explicit.

##### Static JSON GET with server and client output validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 0.97 [0.97, 0.99] µs | 0.85–1.08 µs | — | 1.00× | — |

##### Small JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 1.26 [1.23, 1.27] µs | 1.14–1.80 µs | — | 1.00× | — |

##### Large JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 24.14 [23.50, 36.40] µs | 22.06–42.53 µs | — | 1.00× | — |

#### Focused @hulla/api diagnostics

Feature-specific measurements show the cost of transport encoding, middleware, validation errors, codecs and streams. Each row names its execution path; HTTP-only fixtures do not imply an in-process measurement.

##### Dynamic path, query, and header transport with directional validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 2.51 [2.47, 2.55] µs | 2.30–3.74 µs | — | 1.00× | — |

##### Bidirectional Date codec across client and server HTTP boundaries

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 2.00 [1.94, 2.04] µs | 1.85–2.10 µs | — | 1.00× | — |

##### Ten NDJSON chunks with server and client schema validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 11.08 [10.98, 11.21] µs | 10.62–11.49 µs | — | 1.00× | — |

## Bundle footprint

Production consumer bundles are minified for Bun with Zod externalized because it is a user-supplied schema library. Gzip uses level 9.

### Executable package comparison

Each row builds a representative one-route schema/contract, client, server execution path, and in-memory Fetch transport using that package’s normal guarantees. These are the comparable package results.

| Package | Imports | Minified | vs @hulla/api | Gzip | vs @hulla/api |
|---|---|---:|---:|---:|---:|
| @hulla/api 2.0.0 | @hulla/api + /client + /server + /fetch | 45.58 KiB | 1.00× | 14.18 KiB | 1.00× |
| tRPC 11.18.0 | @trpc/client + @trpc/server | 65.33 KiB | 1.43× | 19.35 KiB | 1.36× |
| oRPC 1.15.0 | @orpc/client + @orpc/server | 37.05 KiB | 0.81× | 11.87 KiB | 0.84× |
| ts-rest 3.52.1 | @ts-rest/core + @ts-rest/serverless/fetch | 17.58 KiB | 0.39× | 6.09 KiB | 0.43× |
| Hono RPC 4.13.4 | hono + hono/client | 22.99 KiB | 0.50× | 9.24 KiB | 0.65× |

### @hulla/api tree-shaking checks

Each row is an independent consumer entry point, not an additive component breakdown. “Retained” is relative to the complete @hulla/api Fetch client-and-server scenario above.

| Retained usage | Imports | Minified | Minified share | Gzip | Gzip share |
|---|---|---:|---:|---:|---:|
| Full Fetch client + server | @hulla/api + /client + /server + /fetch | 45.58 KiB | 100.0% | 14.18 KiB | 100.0% |
| Contract declarations | @hulla/api | 9.02 KiB | 19.8% | 3.22 KiB | 22.7% |
| Transport-neutral client | @hulla/api + /client | 21.30 KiB | 46.7% | 7.14 KiB | 50.3% |
| Transport-neutral server | @hulla/api + /server | 14.79 KiB | 32.5% | 5.11 KiB | 36.1% |
| Transport-neutral client + server | @hulla/api + /client + /server | 26.44 KiB | 58.0% | 8.74 KiB | 61.6% |
| Fetch client transport | @hulla/api/fetch (fetchTransport) | 3.47 KiB | 7.6% | 1.55 KiB | 10.9% |
| Fetch server adapter | @hulla/api/fetch (fetchAdapter) | 19.36 KiB | 42.5% | 6.55 KiB | 46.2% |
| Core adapter dispatcher | @hulla/api/adapters (createAdapterHandler) | 13.82 KiB | 30.3% | 4.88 KiB | 34.4% |
| MessagePort client transport | @hulla/api-message-port (messagePortTransport) | 7.36 KiB | 16.2% | 2.63 KiB | 18.5% |
| MessagePort server adapter | @hulla/api-message-port (messagePortAdapter) | 22.02 KiB | 48.3% | 7.20 KiB | 50.8% |
| Express server adapter | @hulla/api-express (expressAdapter) | 18.15 KiB | 39.8% | 6.14 KiB | 43.3% |
| Node HTTP server adapter | @hulla/api-node/http (nodeHttpAdapter) | 20.30 KiB | 44.6% | 6.93 KiB | 48.9% |
| Fastify server adapter | @hulla/api-fastify (fastifyAdapter) | 16.53 KiB | 36.3% | 5.61 KiB | 39.6% |
| Hono server adapter | @hulla/api-hono (honoAdapter) | 22.12 KiB | 48.5% | 7.59 KiB | 53.6% |
| H3 server adapter | @hulla/api-h3 (h3Adapter) | 17.18 KiB | 37.7% | 5.86 KiB | 41.3% |
| Cloudflare Workers adapter | @hulla/api-cloudflare (cloudflareAdapter) | 19.67 KiB | 43.2% | 6.64 KiB | 46.8% |
| Cloudflare Pages Functions adapter | @hulla/api-cloudflare/pages (cloudflarePagesAdapter) | 19.58 KiB | 43.0% | 6.61 KiB | 46.6% |
| Google Cloud Run functions adapter | @hulla/api-google-cloud-functions (googleCloudFunctionsAdapter) | 21.66 KiB | 47.5% | 7.31 KiB | 51.5% |
| Netlify Functions adapter | @hulla/api-netlify-functions (netlifyFunctionsAdapter) | 19.62 KiB | 43.0% | 6.62 KiB | 46.6% |
| Next.js server adapter | @hulla/api-next/server (nextAdapter) | 20.07 KiB | 44.0% | 6.77 KiB | 47.7% |
| TanStack Start server adapter | @hulla/api-tanstack-start (tanStackStartAdapter) | 20.22 KiB | 44.4% | 6.83 KiB | 48.2% |
| React Router v7 server adapter | @hulla/api-react-router (reactRouterAdapter) | 20.36 KiB | 44.7% | 6.87 KiB | 48.4% |
| SolidStart server adapter | @hulla/api-solid-start (solidStartAdapter) | 20.22 KiB | 44.4% | 6.83 KiB | 48.2% |
| SvelteKit server adapter | @hulla/api-sveltekit/server (svelteKitAdapter) | 20.21 KiB | 44.4% | 6.83 KiB | 48.2% |
| SvelteKit remote transport | @hulla/api-sveltekit/remote (svelteKitRemoteTransport) | 14.68 KiB | 32.2% | 5.19 KiB | 36.6% |
| Nuxt server adapter | @hulla/api-nuxt/server (nuxtAdapter) | 20.21 KiB | 44.3% | 6.84 KiB | 48.2% |
| Nuxt request-aware client transport | @hulla/api-nuxt/client (nuxtFetchTransport) | 3.35 KiB | 7.4% | 1.49 KiB | 10.5% |
| Astro server adapter | @hulla/api-astro (astroAdapter) | 19.69 KiB | 43.2% | 6.65 KiB | 46.9% |
| Astro in-process transport | @hulla/api-astro (astroInProcessTransport) | 14.59 KiB | 32.0% | 5.14 KiB | 36.3% |
| ts-rest 3.52.1 - stable core | @ts-rest/core@3.52.1 | 5.62 KiB | 12.3% | 2.19 KiB | 15.4% |
| ts-rest 3.52.1 - Zod 4 RC core | @ts-rest/core@3.53.0-rc.1 | 60.91 KiB | 133.6% | 15.00 KiB | 105.8% |
