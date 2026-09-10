# Runtime benchmark report

| Metadata | Value |
|---|---|
| Generated | 2026-09-09T08:51:32.528Z |
| Source | @hulla/api 2.0.0 · 525aaadd + local 076bc02d |
| Runtime | Bun 1.4.0 |
| Aggregate | 3 compatible repeated runs; 15 samples |
| Current invocation | 3 runs × 5 samples; at least 20 ms per sample; default batches of 3,000 iterations and 1,000 warmup iterations |
| Raw history | benchmarks/results/native-2026-09-09/history.ndjson |

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
| Recommended everyday setup | Static JSON GET with server and client output validation | 2.46 [2.40, 2.55] µs | 0.97 [0.95, 1.00] µs | 2.53× |
| Recommended everyday setup | Small JSON POST with each runtime's request and response validation | 3.94 [3.88, 4.04] µs | 1.35 [1.29, 1.49] µs | 2.92× |
| Recommended everyday setup | Large JSON POST with each runtime's request and response validation | 51.84 [50.92, 52.29] µs | 24.25 [23.55, 24.46] µs | 2.14× |
| Representative application requests | Read one resource through two path parameters | 4.51 [4.37, 4.56] µs | 2.13 [2.09, 2.14] µs | 2.12× |
| Representative application requests | Filtered collection read with a path parameter, scalar and repeated query values, and a header | 9.14 [8.97, 9.77] µs | 3.46 [3.44, 3.50] µs | 2.64× |
| Representative application requests | JSON update with path parameters, query, headers, and validated response | 8.36 [8.20, 8.39] µs | 3.22 [3.17, 3.23] µs | 2.60× |
| Equivalent validation policy | Static JSON GET with server and client output validation | 2.50 [2.49, 2.51] µs | 1.01 [1.00, 1.05] µs | 2.49× |
| Equivalent validation policy | Small JSON POST with each runtime's request and response validation | 3.85 [3.76, 3.90] µs | 1.31 [1.25, 1.43] µs | 2.94× |
| Equivalent validation policy | Large JSON POST with each runtime's request and response validation | 52.05 [51.52, 53.33] µs | 24.62 [24.27, 24.66] µs | 2.11× |
| Focused @hulla/api diagnostics | Dynamic path, query, and header transport with directional validation | 6.68 [6.42, 6.73] µs | 2.56 [2.52, 2.58] µs | 2.61× |
| Focused @hulla/api diagnostics | Bidirectional Date codec across client and server HTTP boundaries | 4.89 [4.70, 4.94] µs | 2.04 [2.02, 2.13] µs | 2.39× |
| Focused @hulla/api diagnostics | Ten NDJSON chunks with server and client schema validation | 18.07 [17.94, 18.35] µs | 11.44 [11.32, 11.50] µs | 1.58× |

## Cross-package overview

Geometric mean of each package’s median-latency ratio to @hulla/api across the listed operations. Lower is faster; `1.00×` is @hulla/api. A cell is omitted unless that package has every operation in the cohort.

| Cohort | Adapter | Operations | Direct | @hulla/api | ts-rest | tRPC | oRPC | Hono |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Recommended everyday setup | Fetch | 3 | 0.40× | 1.00× | 1.03× | 3.99× | 2.21× | 0.80× |
| Representative application requests | Fetch | 3 | 0.40× | 1.00× | 0.91× | 2.96× | 1.51× | 0.96× |
| Equivalent validation policy | Fetch | 3 | 0.45× | 1.00× | 1.14× | 3.57× | 2.29× | 0.92× |

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
| Direct Fetch | 0.65 [0.63, 0.65] µs | 0.62–0.69 µs | 1.00× | 0.26× | — |
| @hulla/api 2.0.0 | 2.46 [2.40, 2.55] µs | 2.28–2.69 µs | 3.78× | 1.00× | — |
| ts-rest 3.52.1 | 2.98 [2.98, 3.12] µs | 2.78–6.80 µs | 4.58× | 1.21× | — |
| tRPC 11.18.0 | 17.68 [17.43, 18.18] µs | 16.51–20.24 µs | 27.16× | 7.19× | — |
| oRPC 1.15.0 | 8.21 [8.15, 8.28] µs | 7.98–8.79 µs | 12.62× | 3.34× | — |
| Hono RPC 4.13.4 | 1.79 [1.76, 1.83] µs | 1.71–2.59 µs | 2.76× | 0.73× | — |

##### Small JSON POST with each runtime's request and response validation

```text
POST /users

{ "name": "Ada" } → validate { "id": "user-1", "name": "Ada" }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.29 [1.27, 1.30] µs | 1.20–1.93 µs | 1.00× | 0.33× | — |
| @hulla/api 2.0.0 | 3.94 [3.88, 4.04] µs | 3.62–4.23 µs | 3.05× | 1.00× | — |
| ts-rest 3.52.1 | 4.19 [4.10, 4.32] µs | 3.76–4.83 µs | 3.24× | 1.06× | — |
| tRPC 11.18.0 | 20.91 [20.85, 21.13] µs | 19.91–23.99 µs | 16.18× | 5.31× | — |
| oRPC 1.15.0 | 9.07 [9.06, 9.22] µs | 8.48–19.75 µs | 7.02× | 2.30× | — |
| Hono RPC 4.13.4 | 3.10 [3.07, 3.14] µs | 2.91–3.82 µs | 2.40× | 0.79× | — |

##### Large JSON POST with each runtime's request and response validation

```text
POST /large

{ "items": [100 items] } → validate { "count": 100, "items": [100 items] }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 39.29 [38.68, 39.78] µs | 37.45–45.53 µs | 1.00× | 0.76× | — |
| @hulla/api 2.0.0 | 51.84 [50.92, 52.29] µs | 49.64–67.24 µs | 1.32× | 1.00× | — |
| ts-rest 3.52.1 | 44.01 [43.17, 45.07] µs | 42.14–56.21 µs | 1.12× | 0.85× | — |
| tRPC 11.18.0 | 86.24 [84.60, 88.50] µs | 80.78–91.49 µs | 2.19× | 1.66× | — |
| oRPC 1.15.0 | 73.10 [72.98, 73.19] µs | 69.46–82.97 µs | 1.86× | 1.41× | — |
| Hono RPC 4.13.4 | 45.72 [45.29, 46.26] µs | 43.48–49.95 µs | 1.16× | 0.88× | — |

#### Representative application requests

Common REST-shaped reads and writes covering path parameters, query values, headers, and JSON bodies. RPC packages carry the equivalent values through their native protocol.

##### Read one resource through two path parameters

```text
GET /organizations/org-engineering/users/user-42
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.67 [1.61, 1.70] µs | 1.55–1.72 µs | 1.00× | 0.37× | — |
| @hulla/api 2.0.0 | 4.51 [4.37, 4.56] µs | 4.24–4.95 µs | 2.71× | 1.00× | — |
| ts-rest 3.52.1 | 4.16 [4.13, 4.20] µs | 4.00–5.00 µs | 2.50× | 0.92× | — |
| tRPC 11.18.0 | 19.67 [19.17, 19.82] µs | 18.13–21.82 µs | 11.80× | 4.36× | — |
| oRPC 1.15.0 | 9.30 [9.21, 9.46] µs | 8.75–16.58 µs | 5.58× | 2.06× | — |
| Hono RPC 4.13.4 | 4.31 [4.27, 4.33] µs | 4.05–5.00 µs | 2.58× | 0.95× | — |

##### Filtered collection read with a path parameter, scalar and repeated query values, and a header

```text
GET /organizations/org-engineering/users?cursor=next-page&limit=25&role=admin&role=member
x-tenant-token: tenant-secret
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 4.23 [4.15, 4.34] µs | 3.82–5.72 µs | 1.00× | 0.46× | — |
| @hulla/api 2.0.0 | 9.14 [8.97, 9.77] µs | 8.30–11.77 µs | 2.16× | 1.00× | — |
| ts-rest 3.52.1 | 8.59 [8.48, 8.76] µs | 8.14–9.24 µs | 2.03× | 0.94× | — |
| tRPC 11.18.0 | 22.71 [22.33, 22.93] µs | 21.10–25.87 µs | 5.37× | 2.48× | — |
| oRPC 1.15.0 | 11.92 [11.59, 12.21] µs | 11.36–14.00 µs | 2.82× | 1.30× | — |
| Hono RPC 4.13.4 | 8.41 [8.35, 8.52] µs | 7.57–9.80 µs | 1.99× | 0.92× | — |

##### JSON update with path parameters, query, headers, and validated response

```text
PATCH /organizations/org-engineering/users/user-42?notify=true
x-tenant-token: tenant-secret

{ "active": true, "displayName": "Ada Lovelace" }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 3.14 [3.03, 3.34] µs | 2.95–4.00 µs | 1.00× | 0.38× | — |
| @hulla/api 2.0.0 | 8.36 [8.20, 8.39] µs | 7.71–9.16 µs | 2.66× | 1.00× | — |
| ts-rest 3.52.1 | 7.16 [6.93, 7.38] µs | 6.49–8.09 µs | 2.28× | 0.86× | — |
| tRPC 11.18.0 | 20.05 [19.83, 20.32] µs | 19.00–22.42 µs | 6.39× | 2.40× | — |
| oRPC 1.15.0 | 10.78 [10.61, 10.81] µs | 9.93–14.84 µs | 3.44× | 1.29× | — |
| Hono RPC 4.13.4 | 8.41 [8.01, 8.43] µs | 7.61–9.41 µs | 2.68× | 1.01× | — |

#### Equivalent validation policy

Server input, server output, and client output are validated; no manually added client input validation. HTTP/RPC protocol differences remain explicit.

##### Static JSON GET with server and client output validation

```text
GET /health

validate { "ok": true }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.68 [0.68, 0.71] µs | 0.64–1.17 µs | 1.00× | 0.27× | — |
| @hulla/api 2.0.0 | 2.50 [2.49, 2.51] µs | 2.31–3.61 µs | 3.67× | 1.00× | — |
| ts-rest 3.52.1 | 3.20 [3.12, 3.37] µs | 2.87–6.30 µs | 4.69× | 1.28× | — |
| tRPC 11.18.0 | 15.09 [14.90, 15.17] µs | 14.25–17.60 µs | 22.13× | 6.04× | — |
| oRPC 1.15.0 | 8.16 [7.90, 8.21] µs | 7.36–8.94 µs | 11.97× | 3.27× | — |
| Hono RPC 4.13.4 | 1.86 [1.79, 1.87] µs | 1.72–3.17 µs | 2.73× | 0.74× | — |

##### Small JSON POST with each runtime's request and response validation

```text
POST /users

{ "name": "Ada" } → validate { "id": "user-1", "name": "Ada" }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.36 [1.35, 1.37] µs | 1.26–1.61 µs | 1.00× | 0.35× | — |
| @hulla/api 2.0.0 | 3.85 [3.76, 3.90] µs | 3.63–4.29 µs | 2.82× | 1.00× | — |
| ts-rest 3.52.1 | 4.39 [4.24, 4.40] µs | 4.10–7.96 µs | 3.22× | 1.14× | — |
| tRPC 11.18.0 | 18.60 [18.25, 18.83] µs | 17.95–19.99 µs | 13.65× | 4.84× | — |
| oRPC 1.15.0 | 8.79 [8.68, 8.95] µs | 8.46–9.39 µs | 6.45× | 2.29× | — |
| Hono RPC 4.13.4 | 3.34 [3.27, 3.45] µs | 3.00–3.63 µs | 2.45× | 0.87× | — |

##### Large JSON POST with each runtime's request and response validation

```text
POST /large

{ "items": [100 items] } → validate { "count": 100, "items": [100 items] }
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 47.87 [46.44, 48.14] µs | 44.51–50.31 µs | 1.00× | 0.92× | — |
| @hulla/api 2.0.0 | 52.05 [51.52, 53.33] µs | 49.02–53.80 µs | 1.09× | 1.00× | — |
| ts-rest 3.52.1 | 52.38 [52.11, 53.23] µs | 49.80–77.57 µs | 1.09× | 1.01× | — |
| tRPC 11.18.0 | 81.02 [79.31, 81.86] µs | 77.34–95.08 µs | 1.69× | 1.56× | — |
| oRPC 1.15.0 | 83.21 [81.30, 85.03] µs | 77.61–88.40 µs | 1.74× | 1.60× | — |
| Hono RPC 4.13.4 | 63.62 [63.11, 63.95] µs | 58.83–85.08 µs | 1.33× | 1.22× | — |

##### Loaded-module application construction plus the first validated request

```text
build contract/router + server adapter + client
await client.health()
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.41 [0.40, 0.42] µs | 0.38–0.78 µs | 1.00× | 0.04× | — |
| @hulla/api 2.0.0 | 10.19 [9.79, 10.55] µs | 9.47–11.54 µs | 24.76× | 1.00× | — |
| ts-rest 3.52.1 | 5.93 [5.64, 6.24] µs | 5.47–8.37 µs | 14.42× | 0.58× | — |
| tRPC 11.18.0 | 22.09 [21.90, 22.92] µs | 21.13–27.32 µs | 53.71× | 2.17× | — |
| oRPC 1.15.0 | 10.36 [10.16, 10.37] µs | 9.22–11.10 µs | 25.18× | 1.02× | — |
| Hono RPC 4.13.4 | 4.56 [4.30, 4.57] µs | 3.88–4.86 µs | 11.09× | 0.45× | — |

#### Focused @hulla/api diagnostics

Feature-specific measurements show the cost of transport encoding, middleware, validation errors, codecs and streams. Each row names its execution path; HTTP-only fixtures do not imply an in-process measurement.

##### Server adapter dispatch with a host-parsed JSON body

```text
adapter.dispatch({ method: "POST", path: "/execute", body: { value: 21 } }) // body already parsed by host
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.23 [0.22, 0.23] µs | 0.22–0.26 µs | 1.00× | — | — |
| @hulla/api 2.0.0 - Adapter | 0.72 [0.70, 0.74] µs | 0.69–2.24 µs | 3.13× | — | — |
| @hulla/api 2.0.0 - Fetch | 2.53 [2.44, 2.58] µs | 2.32–8.79 µs | 10.97× | — | — |

##### Static route dispatch through a 256-route server

```text
adapter.dispatch({ method: "GET", path: "/static/255" }) // 256 registered routes
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.17 [0.17, 0.17] µs | 0.16–0.19 µs | 1.00× | 0.28× | — |
| @hulla/api 2.0.0 - Adapter | 0.61 [0.61, 0.62] µs | 0.60–0.67 µs | 3.54× | 1.00× | — |

##### Parameterized route dispatch through a 256-route server

```text
adapter.dispatch({ method: "GET", path: "/dynamic/255/item%2F42" }) // 256 registered routes
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.45 [0.44, 0.46] µs | 0.42–0.51 µs | 1.00× | 0.35× | — |
| @hulla/api 2.0.0 - Adapter | 1.29 [1.27, 1.33] µs | 1.22–1.46 µs | 2.86× | 1.00× | — |

##### Server implementation construction plus Fetch handler creation

```text
const handler = adapter.mount(server.compose(...fragments))
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch - raw route handler | 0.03 [0.03, 0.03] µs | 0.02–0.03 µs | 1.00× | — | — |
| @hulla/api 2.0.0 - Composed fragments | 4.52 [4.27, 4.60] µs | 4.07–5.66 µs | 177.36× | — | — |
| @hulla/api 2.0.0 - Four standalone fragments | 4.20 [3.87, 4.37] µs | 3.83–6.67 µs | 164.90× | — | — |
| @hulla/api 2.0.0 - Root implementation | 2.90 [2.86, 2.94] µs | 2.71–3.08 µs | 114.05× | — | — |
| @hulla/api 2.0.0 - Scoped root implementation | 3.03 [2.99, 3.03] µs | 2.86–5.20 µs | 118.84× | — | — |
| @hulla/api 2.0.0 - Standalone fragment | 1.03 [0.99, 1.05] µs | 0.93–1.18 µs | 40.51× | — | — |

##### Hot dispatch through complete implementations and implementation fragments

```text
await handler(new Request("https://bench.local/implementation/3")) // reuse a prebuilt implementation
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch - raw route handler | 0.09 [0.09, 0.10] µs | 0.09–0.12 µs | 1.00× | — | — |
| @hulla/api 2.0.0 - Composed fragments | 1.12 [1.12, 1.13] µs | 1.08–1.37 µs | 11.90× | — | — |
| @hulla/api 2.0.0 - Root implementation | 1.17 [1.09, 1.23] µs | 1.04–1.58 µs | 12.40× | — | — |
| @hulla/api 2.0.0 - Standalone fragment | 1.18 [1.15, 1.22] µs | 1.05–1.30 µs | 12.54× | — | — |

##### Dynamic path, query, and header transport with directional validation

```text
GET /items/item%2F42?limit=10
x-token: secret

validate path, query, and header in both directions
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 2.15 [2.10, 2.20] µs | 2.03–2.35 µs | 1.00× | 0.32× | — |
| @hulla/api 2.0.0 | 6.68 [6.42, 6.73] µs | 6.16–10.90 µs | 3.10× | 1.00× | — |

##### Client and server context plus one middleware layer

```text
GET /protected

client middleware → transport → server context + middleware → handler
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 0.65 [0.63, 0.68] µs | 0.62–0.78 µs | 1.00× | 0.22× | — |
| @hulla/api 2.0.0 | 2.93 [2.86, 2.94] µs | 2.79–3.36 µs | 4.51× | 1.00× | — |

##### Invalid server request validation and protocol error serialization

```text
POST /failure

{ "count": -1 } → serialized request-validation error
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 3.36 [3.32, 3.43] µs | 3.17–3.96 µs | 1.00× | 0.70× | — |
| @hulla/api 2.0.0 | 4.78 [4.78, 4.85] µs | 4.58–5.05 µs | 1.42× | 1.00× | — |

##### Bidirectional Date codec across client and server HTTP boundaries

```text
POST /codec

Date → ISO string over HTTP → Date
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 1.60 [1.57, 1.62] µs | 1.55–1.72 µs | 1.00× | 0.33× | — |
| @hulla/api 2.0.0 | 4.89 [4.70, 4.94] µs | 4.56–8.52 µs | 3.05× | 1.00× | — |

##### Ten NDJSON chunks with server and client schema validation

```text
GET /events

server yields 10 values → NDJSON stream → client validates 10 values
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| Direct Fetch | 5.14 [5.11, 5.31] µs | 4.94–5.54 µs | 1.00× | 0.28× | — |
| @hulla/api 2.0.0 | 18.07 [17.94, 18.35] µs | 17.26–25.74 µs | 3.51× | 1.00× | — |

### No host adapter

#### Recommended everyday setup

Each package uses its simplest practical validated/recommended path. Runtime guarantees differ, so these results show idiomatic cost rather than equal-capability performance.

##### Static JSON GET with server and client output validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 0.97 [0.95, 1.00] µs | 0.89–1.46 µs | — | 1.00× | — |

##### Small JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 1.35 [1.29, 1.49] µs | 1.19–1.56 µs | — | 1.00× | — |

##### Large JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 24.25 [23.55, 24.46] µs | 22.83–25.69 µs | — | 1.00× | — |

#### Representative application requests

Common REST-shaped reads and writes covering path parameters, query values, headers, and JSON bodies. RPC packages carry the equivalent values through their native protocol.

##### Read one resource through two path parameters

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 2.13 [2.09, 2.14] µs | 1.95–5.28 µs | — | 1.00× | — |

##### Filtered collection read with a path parameter, scalar and repeated query values, and a header

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 3.46 [3.44, 3.50] µs | 3.13–4.05 µs | — | 1.00× | — |

##### JSON update with path parameters, query, headers, and validated response

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 3.22 [3.17, 3.23] µs | 2.90–3.88 µs | — | 1.00× | — |

#### Equivalent validation policy

Server input, server output, and client output are validated; no manually added client input validation. HTTP/RPC protocol differences remain explicit.

##### Static JSON GET with server and client output validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 1.01 [1.00, 1.05] µs | 0.91–1.15 µs | — | 1.00× | — |

##### Small JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 1.31 [1.25, 1.43] µs | 1.20–1.56 µs | — | 1.00× | — |

##### Large JSON POST with each runtime's request and response validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 24.62 [24.27, 24.66] µs | 22.53–28.43 µs | — | 1.00× | — |

#### Focused @hulla/api diagnostics

Feature-specific measurements show the cost of transport encoding, middleware, validation errors, codecs and streams. Each row names its execution path; HTTP-only fixtures do not imply an in-process measurement.

##### Dynamic path, query, and header transport with directional validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 2.56 [2.52, 2.58] µs | 2.37–4.90 µs | — | 1.00× | — |

##### Bidirectional Date codec across client and server HTTP boundaries

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 2.04 [2.02, 2.13] µs | 1.98–2.29 µs | — | 1.00× | — |

##### Ten NDJSON chunks with server and client schema validation

```text
Typed client → in-process transport → server handler → typed result (no HTTP serialization)
```

| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |
|---|---:|---:|---:|---:|---|
| @hulla/api 2.0.0 - in-process | 11.44 [11.32, 11.50] µs | 10.92–11.87 µs | — | 1.00× | — |

## Bundle footprint

Production consumer bundles are minified for Bun with Zod externalized because it is a user-supplied schema library. Gzip uses level 9.

### Executable package comparison

Each row builds a representative one-route schema/contract, client, server execution path, and in-memory Fetch transport using that package’s normal guarantees. These are the comparable package results.

| Package | Imports | Minified | vs @hulla/api | Gzip | vs @hulla/api |
|---|---|---:|---:|---:|---:|
| @hulla/api 2.0.0 | @hulla/api + /client + /server + /fetch | 44.97 KiB | 1.00× | 14.04 KiB | 1.00× |
| tRPC 11.18.0 | @trpc/client + @trpc/server | 65.33 KiB | 1.45× | 19.35 KiB | 1.38× |
| oRPC 1.15.0 | @orpc/client + @orpc/server | 37.05 KiB | 0.82× | 11.87 KiB | 0.85× |
| ts-rest 3.52.1 | @ts-rest/core + @ts-rest/serverless/fetch | 17.58 KiB | 0.39× | 6.09 KiB | 0.43× |
| Hono RPC 4.13.4 | hono + hono/client | 22.99 KiB | 0.51× | 9.24 KiB | 0.66× |

### @hulla/api tree-shaking checks

Each row is an independent consumer entry point, not an additive component breakdown. “Retained” is relative to the complete @hulla/api Fetch client-and-server scenario above.

| Retained usage | Imports | Minified | Minified share | Gzip | Gzip share |
|---|---|---:|---:|---:|---:|
| Full Fetch client + server | @hulla/api + /client + /server + /fetch | 44.97 KiB | 100.0% | 14.04 KiB | 100.0% |
| Contract declarations | @hulla/api | 8.74 KiB | 19.4% | 3.11 KiB | 22.2% |
| Transport-neutral client | @hulla/api + /client | 20.65 KiB | 45.9% | 6.97 KiB | 49.7% |
| Transport-neutral server | @hulla/api + /server | 14.51 KiB | 32.3% | 5.01 KiB | 35.7% |
| Transport-neutral client + server | @hulla/api + /client + /server | 25.79 KiB | 57.4% | 8.59 KiB | 61.2% |
| Fetch client transport | @hulla/api/fetch (fetchTransport) | 3.47 KiB | 7.7% | 1.55 KiB | 11.1% |
| Fetch server adapter | @hulla/api/fetch (fetchAdapter) | 19.44 KiB | 43.2% | 6.58 KiB | 46.8% |
| Core adapter dispatcher | @hulla/api/adapters (createAdapterHandler) | 13.90 KiB | 30.9% | 4.92 KiB | 35.0% |
| MessagePort client transport | @hulla/api-message-port (messagePortTransport) | 7.36 KiB | 16.4% | 2.63 KiB | 18.7% |
| MessagePort server adapter | @hulla/api-message-port (messagePortAdapter) | 22.10 KiB | 49.1% | 7.24 KiB | 51.6% |
| Express server adapter | @hulla/api-express (expressAdapter) | 18.23 KiB | 40.5% | 6.17 KiB | 44.0% |
| Node HTTP server adapter | @hulla/api-node/http (nodeHttpAdapter) | 20.39 KiB | 45.3% | 6.96 KiB | 49.6% |
| Fastify server adapter | @hulla/api-fastify (fastifyAdapter) | 16.61 KiB | 36.9% | 5.65 KiB | 40.2% |
| Hono server adapter | @hulla/api-hono (honoAdapter) | 22.20 KiB | 49.4% | 7.62 KiB | 54.2% |
| H3 server adapter | @hulla/api-h3 (h3Adapter) | 17.26 KiB | 38.4% | 5.89 KiB | 41.9% |
| Cloudflare Workers adapter | @hulla/api-cloudflare (cloudflareAdapter) | 19.75 KiB | 43.9% | 6.67 KiB | 47.5% |
| Cloudflare Pages Functions adapter | @hulla/api-cloudflare/pages (cloudflarePagesAdapter) | 19.66 KiB | 43.7% | 6.64 KiB | 47.3% |
| Google Cloud Run functions adapter | @hulla/api-google-cloud-functions (googleCloudFunctionsAdapter) | 21.74 KiB | 48.3% | 7.34 KiB | 52.3% |
| Netlify Functions adapter | @hulla/api-netlify-functions (netlifyFunctionsAdapter) | 19.70 KiB | 43.8% | 6.65 KiB | 47.3% |
| Next.js server adapter | @hulla/api-next/server (nextAdapter) | 20.15 KiB | 44.8% | 6.80 KiB | 48.4% |
| TanStack Start server adapter | @hulla/api-tanstack-start (tanStackStartAdapter) | 20.30 KiB | 45.1% | 6.87 KiB | 48.9% |
| React Router v7 server adapter | @hulla/api-react-router (reactRouterAdapter) | 20.44 KiB | 45.5% | 6.90 KiB | 49.1% |
| SolidStart server adapter | @hulla/api-solid-start (solidStartAdapter) | 20.31 KiB | 45.2% | 6.86 KiB | 48.9% |
| SvelteKit server adapter | @hulla/api-sveltekit/server (svelteKitAdapter) | 20.30 KiB | 45.1% | 6.87 KiB | 48.9% |
| SvelteKit remote transport | @hulla/api-sveltekit/remote (svelteKitRemoteTransport) | 14.77 KiB | 32.8% | 5.23 KiB | 37.2% |
| Nuxt server adapter | @hulla/api-nuxt/server (nuxtAdapter) | 20.29 KiB | 45.1% | 6.87 KiB | 49.0% |
| Nuxt request-aware client transport | @hulla/api-nuxt/client (nuxtFetchTransport) | 3.35 KiB | 7.5% | 1.49 KiB | 10.6% |
| Astro server adapter | @hulla/api-astro (astroAdapter) | 19.78 KiB | 44.0% | 6.68 KiB | 47.6% |
| Astro in-process transport | @hulla/api-astro (astroInProcessTransport) | 14.68 KiB | 32.6% | 5.18 KiB | 36.9% |
| ts-rest 3.52.1 - stable core | @ts-rest/core@3.52.1 | 5.62 KiB | 12.5% | 2.19 KiB | 15.6% |
| ts-rest 3.52.1 - Zod 4 RC core | @ts-rest/core@3.53.0-rc.1 | 60.91 KiB | 135.4% | 15.00 KiB | 106.9% |
