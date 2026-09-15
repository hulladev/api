# CPU Profile

| Duration | Samples | Interval | Functions |
|----------|---------|----------|----------|
| 1.07s | 771 | 1.0ms | 198 |

**Top 10:** `json` 9.1%, `Request` 7.7%, `next` 5.4%, `copyDataProperties` 4.9%, `read` 4.9%, `anonymous` 4.9%, `URLSearchParams` 4.6%, `fromEntries` 3.3%, `setOwn` 3.3%, `entries` 3.0%

## Hot Functions (Self Time)

| Self% | Self | Total% | Total | Function | Location |
|------:|-----:|-------:|------:|----------|----------|
| 9.1% | 98.5ms | 9.1% | 98.5ms | `json` | `[native code]` |
| 7.7% | 83.7ms | 7.7% | 83.7ms | `Request` | `[native code]` |
| 5.4% | 58.2ms | 5.4% | 58.2ms | `next` | `[native code]` |
| 4.9% | 53.3ms | 4.9% | 53.3ms | `copyDataProperties` | `[native code]` |
| 4.9% | 53.1ms | 32.3% | 348.1ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:33` |
| 4.9% | 53.1ms | 7.1% | 77.2ms | `anonymous` | `[native code]` |
| 4.6% | 50.2ms | 4.6% | 50.2ms | `URLSearchParams` | `[native code]` |
| 3.3% | 35.6ms | 8.8% | 95.4ms | `fromEntries` | `[native code]` |
| 3.3% | 35.6ms | 3.3% | 35.6ms | `setOwn` | `/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js:14` |
| 3.0% | 33.2ms | 3.0% | 33.2ms | `entries` | `[native code]` |
| 2.3% | 25.7ms | 2.3% | 25.7ms | `pathSegments` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:245` |
| 2.2% | 24.5ms | 2.2% | 24.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:22` |
| 2.0% | 21.8ms | 2.0% | 21.8ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:210` |
| 1.6% | 17.3ms | 9.1% | 98.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:33` |
| 1.3% | 14.8ms | 1.3% | 14.8ms | `encodeURIComponent` | `[native code]` |
| 1.3% | 14.3ms | 2.7% | 29.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:39` |
| 1.2% | 13.1ms | 1.2% | 13.1ms | `matchingNode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:268` |
| 1.2% | 12.9ms | 5.7% | 61.4ms | `requestHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:166` |
| 1.1% | 12.8ms | 1.9% | 21.0ms | `group` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:8` |
| 1.1% | 12.8ms | 1.1% | 12.8ms | `stringify` | `[native code]` |
| 1.1% | 12.7ms | 1.1% | 12.7ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:70` |
| 1.0% | 11.6ms | 1.0% | 11.6ms | `toString` | `[native code]` |
| 1.0% | 11.1ms | 1.0% | 11.1ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:34` |
| 0.9% | 9.8ms | 0.9% | 9.8ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:214` |
| 0.8% | 8.9ms | 0.8% | 8.9ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 0.7% | 8.5ms | 0.7% | 8.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` |
| 0.7% | 8.5ms | 0.7% | 8.5ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:38` |
| 0.7% | 7.9ms | 0.7% | 7.9ms | `call` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.7% | 7.8ms | 0.7% | 7.8ms | `cloneObject` | `[native code]` |
| 0.7% | 7.8ms | 6.9% | 74.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:991` |
| 0.6% | 7.2ms | 0.6% | 7.2ms | `_parseAsync` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` |
| 0.6% | 6.5ms | 2.8% | 30.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:228` |
| 0.4% | 5.1ms | 0.4% | 5.1ms | `asyncFunctionDrive` | `[native code]` |
| 0.4% | 5.1ms | 1.3% | 14.0ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:212` |
| 0.4% | 4.9ms | 0.4% | 4.9ms | `values` | `[native code]` |
| 0.4% | 4.8ms | 55.9% | 601.9ms | `async transportAndDecode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:117` |
| 0.4% | 4.6ms | 0.4% | 4.6ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:56` |
| 0.4% | 4.5ms | 0.4% | 4.5ms | `mapExecutionStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:8` |
| 0.4% | 4.3ms | 14.7% | 158.8ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:109` |
| 0.3% | 4.2ms | 0.8% | 9.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:17` |
| 0.3% | 4.0ms | 2.0% | 21.7ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:399` |
| 0.3% | 4.0ms | 1.5% | 16.7ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:166` |
| 0.3% | 4.0ms | 26.1% | 281.3ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:379` |
| 0.3% | 3.9ms | 0.3% | 3.9ms | `throwIfAborted` | `[native code]` |
| 0.3% | 3.9ms | 0.5% | 6.1ms | `encodedQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:188` |
| 0.3% | 3.7ms | 0.3% | 3.7ms | `validate` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:122` |
| 0.3% | 3.7ms | 0.3% | 3.7ms | `mimeEssence` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:150` |
| 0.3% | 3.7ms | 73.0% | 785.5ms | `(module)` | `/private/tmp/native-profile.ts:2` |
| 0.3% | 3.7ms | 0.3% | 3.7ms | `append` | `[native code]` |
| 0.3% | 3.7ms | 71.6% | 771.0ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:108` |
| 0.3% | 3.7ms | 0.3% | 3.7ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:28` |
| 0.3% | 3.6ms | 0.3% | 3.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:51` |
| 0.3% | 3.5ms | 4.1% | 44.5ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:206` |
| 0.3% | 3.4ms | 0.3% | 3.4ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:375` |
| 0.3% | 3.3ms | 2.9% | 31.5ms | `selectRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:312` |
| 0.3% | 3.3ms | 7.1% | 77.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:49` |
| 0.3% | 3.3ms | 0.3% | 3.3ms | `appendBaseUrl` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:18` |
| 0.2% | 2.9ms | 4.1% | 45.1ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:49` |
| 0.2% | 2.8ms | 0.2% | 2.8ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:157` |
| 0.2% | 2.7ms | 0.2% | 2.7ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:34` |
| 0.2% | 2.7ms | 0.2% | 2.7ms | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:441` |
| 0.2% | 2.7ms | 1.2% | 13.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:104` |
| 0.2% | 2.7ms | 0.2% | 2.7ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:207` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:990` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js` |
| 0.2% | 2.6ms | 8.9% | 96.7ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:76` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:976` |
| 0.2% | 2.5ms | 1.2% | 12.9ms | `captureParameters` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:276` |
| 0.2% | 2.5ms | 0.4% | 4.7ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:103` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.2% | 2.4ms | 0.2% | 2.4ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:116` |
| 0.2% | 2.4ms | 0.2% | 2.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 0.2% | 2.4ms | 0.2% | 2.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:19` |
| 0.2% | 2.4ms | 0.2% | 2.4ms | `pathSegments` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:244` |
| 0.2% | 2.3ms | 0.2% | 2.3ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:31` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `requestQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:172` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `selectCandidates` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:302` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:30` |
| 0.2% | 2.2ms | 0.5% | 6.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:54` |
| 0.1% | 1.5ms | 0.1% | 1.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:38` |
| 0.1% | 1.5ms | 0.1% | 1.5ms | `wireHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `isPromiseLike` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:5` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:71` |
| 0.1% | 1.4ms | 1.9% | 20.7ms | `matchingNode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:269` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:121` |
| 0.1% | 1.4ms | 72.6% | 781.8ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:153` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.1% | 1.4ms | 1.3% | 14.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:87` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js` |
| 0.1% | 1.4ms | 3.3% | 35.7ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:120` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:1666` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:122` |
| 0.1% | 1.4ms | 41.5% | 446.6ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:204` |
| 0.1% | 1.3ms | 72.5% | 780.3ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:154` |
| 0.1% | 1.3ms | 7.9% | 85.1ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:61` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `finalize` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:209` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:114` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:158` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `setOwn` | `/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:82` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `finalize` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:219` |
| 0.1% | 1.2ms | 27.0% | 290.4ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:374` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:220` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:122` |
| 0.1% | 1.2ms | 0.5% | 6.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:26` |
| 0.1% | 1.2ms | 5.1% | 55.3ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:16` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:397` |
| 0.1% | 1.2ms | 0.3% | 3.8ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:86` |
| 0.1% | 1.2ms | 0.3% | 4.1ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:212` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `slice` | `[native code]` |
| 0.1% | 1.2ms | 2.6% | 28.9ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:131` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:21` |
| 0.1% | 1.1ms | 55.3% | 595.6ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:118` |
| 0.1% | 1.1ms | 0.4% | 5.1ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:378` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:15` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:167` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:161` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:213` |
| 0.1% | 1.1ms | 1.2% | 13.9ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:22` |
| 0.1% | 1.1ms | 0.3% | 3.6ms | `mergedHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:36` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `finish` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:122` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:21` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:160` |
| 0.1% | 1.1ms | 10.0% | 107.7ms | `validateWithValue` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:138` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:32` |
| 0.1% | 1.1ms | 33.4% | 359.7ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:223` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `writeFetchResponseStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:148` |
| 0.1% | 1.0ms | 1.7% | 18.9ms | `readFetchBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:68` |
| 0.1% | 1.0ms | 0.1% | 1.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:40` |
| 0.1% | 1.0ms | 0.1% | 1.0ms | `toFetchResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:127` |
| 0.0% | 1.0ms | 6.7% | 72.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:154` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:217` |
| 0.0% | 1.0ms | 4.3% | 46.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:226` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `createContract` | `/Users/samuel/Coding/hulla/api/packages/core/dist/index.js` |
| 0.0% | 1.0ms | 3.3% | 35.5ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:405` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:29` |
| 0.0% | 908us | 3.3% | 36.4ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:113` |

## Call Tree (Total Time)

| Total% | Total | Self% | Self | Function | Location |
|-------:|------:|------:|-----:|----------|----------|
| 73.0% | 785.5ms | 0.3% | 3.7ms | `(module)` | `/private/tmp/native-profile.ts:2` |
| 72.6% | 781.8ms | 0.1% | 1.4ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:153` |
| 72.5% | 780.3ms | 0.1% | 1.3ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:154` |
| 71.6% | 771.0ms | 0.3% | 3.7ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:108` |
| 66.0% | 710.8ms | 0.0% | 0us | `call` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:192` |
| 55.9% | 601.9ms | 0.4% | 4.8ms | `async transportAndDecode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:117` |
| 55.3% | 595.6ms | 0.1% | 1.1ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:118` |
| 50.3% | 541.3ms | 0.0% | 0us | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:129` |
| 41.5% | 446.6ms | 0.1% | 1.4ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:204` |
| 41.5% | 446.6ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:149` |
| 33.4% | 359.7ms | 0.1% | 1.1ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:223` |
| 32.3% | 348.1ms | 4.9% | 53.1ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:33` |
| 27.0% | 290.4ms | 0.0% | 0us | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:449` |
| 27.0% | 290.4ms | 0.1% | 1.2ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:374` |
| 26.1% | 281.3ms | 0.3% | 4.0ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:379` |
| 14.7% | 158.8ms | 0.4% | 4.3ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:109` |
| 13.7% | 147.8ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:147` |
| 10.0% | 107.7ms | 0.1% | 1.1ms | `validateWithValue` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:138` |
| 9.5% | 102.8ms | 0.0% | 0us | `validate` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:121` |
| 9.1% | 98.5ms | 9.1% | 98.5ms | `json` | `[native code]` |
| 9.1% | 98.0ms | 1.6% | 17.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:33` |
| 8.9% | 96.7ms | 0.2% | 2.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:76` |
| 8.8% | 95.4ms | 3.3% | 35.6ms | `fromEntries` | `[native code]` |
| 8.2% | 88.4ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:136` |
| 7.9% | 85.1ms | 0.1% | 1.3ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:61` |
| 7.7% | 83.7ms | 7.7% | 83.7ms | `Request` | `[native code]` |
| 7.1% | 77.2ms | 4.9% | 53.1ms | `anonymous` | `[native code]` |
| 7.1% | 77.1ms | 0.3% | 3.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:49` |
| 6.9% | 74.3ms | 0.7% | 7.8ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:991` |
| 6.7% | 72.5ms | 0.0% | 1.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:154` |
| 6.0% | 65.0ms | 0.0% | 0us | `writeFetchResponseStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:163` |
| 6.0% | 64.8ms | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:227` |
| 5.7% | 61.4ms | 0.0% | 0us | `wireHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:95` |
| 5.7% | 61.4ms | 1.2% | 12.9ms | `requestHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:166` |
| 5.7% | 61.3ms | 0.0% | 0us | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:444` |
| 5.4% | 58.2ms | 5.4% | 58.2ms | `next` | `[native code]` |
| 5.1% | 55.3ms | 0.1% | 1.2ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:16` |
| 4.9% | 53.3ms | 4.9% | 53.3ms | `copyDataProperties` | `[native code]` |
| 4.8% | 52.0ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:134` |
| 4.6% | 50.2ms | 4.6% | 50.2ms | `URLSearchParams` | `[native code]` |
| 4.3% | 46.4ms | 0.0% | 1.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:226` |
| 4.1% | 45.1ms | 0.2% | 2.9ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:49` |
| 4.1% | 44.9ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:135` |
| 4.1% | 44.5ms | 0.3% | 3.5ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:206` |
| 3.6% | 38.7ms | 0.0% | 0us | `requestQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:175` |
| 3.3% | 36.4ms | 0.0% | 908us | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:113` |
| 3.3% | 35.7ms | 0.1% | 1.4ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:120` |
| 3.3% | 35.6ms | 3.3% | 35.6ms | `setOwn` | `/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js:14` |
| 3.3% | 35.5ms | 0.0% | 1.0ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:405` |
| 3.3% | 35.5ms | 0.0% | 0us | `fromFetchHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:57` |
| 3.0% | 33.2ms | 3.0% | 33.2ms | `entries` | `[native code]` |
| 2.9% | 31.5ms | 0.3% | 3.3ms | `selectRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:312` |
| 2.8% | 30.6ms | 0.6% | 6.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:228` |
| 2.8% | 30.6ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:85` |
| 2.7% | 29.1ms | 1.3% | 14.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:39` |
| 2.6% | 28.9ms | 0.1% | 1.2ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:131` |
| 2.6% | 28.1ms | 0.0% | 0us | `decodePathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:248` |
| 2.3% | 25.7ms | 2.3% | 25.7ms | `pathSegments` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:245` |
| 2.2% | 24.5ms | 2.2% | 24.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:22` |
| 2.0% | 21.8ms | 2.0% | 21.8ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:210` |
| 2.0% | 21.7ms | 0.3% | 4.0ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:399` |
| 2.0% | 21.7ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:102` |
| 1.9% | 21.0ms | 1.1% | 12.8ms | `group` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:8` |
| 1.9% | 20.7ms | 0.1% | 1.4ms | `matchingNode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:269` |
| 1.7% | 19.2ms | 0.0% | 0us | `update` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:81` |
| 1.7% | 19.2ms | 0.0% | 0us | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:402` |
| 1.7% | 18.9ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:118` |
| 1.7% | 18.9ms | 0.1% | 1.0ms | `readFetchBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:68` |
| 1.6% | 17.8ms | 0.0% | 0us | `readBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:221` |
| 1.5% | 16.7ms | 0.3% | 4.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:166` |
| 1.3% | 14.8ms | 1.3% | 14.8ms | `encodeURIComponent` | `[native code]` |
| 1.3% | 14.5ms | 0.0% | 0us | `selectRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:313` |
| 1.3% | 14.3ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:87` |
| 1.3% | 14.0ms | 0.4% | 5.1ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:212` |
| 1.2% | 13.9ms | 0.1% | 1.1ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:22` |
| 1.2% | 13.4ms | 0.2% | 2.7ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:104` |
| 1.2% | 13.1ms | 1.2% | 13.1ms | `matchingNode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:268` |
| 1.2% | 12.9ms | 0.0% | 0us | `selectCandidates` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:304` |
| 1.2% | 12.9ms | 0.2% | 2.5ms | `captureParameters` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:276` |
| 1.1% | 12.8ms | 1.1% | 12.8ms | `stringify` | `[native code]` |
| 1.1% | 12.8ms | 0.0% | 0us | `requestBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:36` |
| 1.1% | 12.8ms | 0.0% | 0us | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:48` |
| 1.1% | 12.7ms | 1.1% | 12.7ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:70` |
| 1.1% | 12.3ms | 0.0% | 0us | `textWireEntries` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:118` |
| 1.0% | 11.6ms | 1.0% | 11.6ms | `toString` | `[native code]` |
| 1.0% | 11.6ms | 0.0% | 0us | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:28` |
| 1.0% | 11.6ms | 0.0% | 0us | `selectRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:314` |
| 1.0% | 11.1ms | 1.0% | 11.1ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:34` |
| 0.9% | 9.8ms | 0.9% | 9.8ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:214` |
| 0.8% | 9.5ms | 0.3% | 4.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:17` |
| 0.8% | 9.4ms | 0.0% | 0us | `node:util` | `node:util:2` |
| 0.8% | 8.9ms | 0.8% | 8.9ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 0.7% | 8.5ms | 0.7% | 8.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` |
| 0.7% | 8.5ms | 0.7% | 8.5ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:38` |
| 0.7% | 8.4ms | 0.0% | 0us | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:23` |
| 0.7% | 8.0ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:70` |
| 0.7% | 7.9ms | 0.7% | 7.9ms | `call` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.7% | 7.8ms | 0.7% | 7.8ms | `cloneObject` | `[native code]` |
| 0.6% | 7.2ms | 0.0% | 0us | `(module)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:30` |
| 0.6% | 7.2ms | 0.6% | 7.2ms | `_parseAsync` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` |
| 0.6% | 6.8ms | 0.0% | 0us | `mergedHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:43` |
| 0.6% | 6.5ms | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:218` |
| 0.5% | 6.4ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:26` |
| 0.5% | 6.2ms | 0.2% | 2.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:54` |
| 0.5% | 6.1ms | 0.3% | 3.9ms | `encodedQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:188` |
| 0.5% | 5.3ms | 0.0% | 0us | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:218` |
| 0.4% | 5.1ms | 0.4% | 5.1ms | `asyncFunctionDrive` | `[native code]` |
| 0.4% | 5.1ms | 0.1% | 1.1ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:378` |
| 0.4% | 4.9ms | 0.4% | 4.9ms | `values` | `[native code]` |
| 0.4% | 4.9ms | 0.0% | 0us | `toFetchHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:50` |
| 0.4% | 4.9ms | 0.0% | 0us | `toFetchResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:136` |
| 0.4% | 4.7ms | 0.2% | 2.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:103` |
| 0.4% | 4.6ms | 0.4% | 4.6ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:56` |
| 0.4% | 4.5ms | 0.4% | 4.5ms | `mapExecutionStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:8` |
| 0.3% | 4.1ms | 0.1% | 1.2ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:212` |
| 0.3% | 3.9ms | 0.3% | 3.9ms | `throwIfAborted` | `[native code]` |
| 0.3% | 3.8ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:86` |
| 0.3% | 3.7ms | 0.3% | 3.7ms | `validate` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:122` |
| 0.3% | 3.7ms | 0.3% | 3.7ms | `mimeEssence` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:150` |
| 0.3% | 3.7ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:112` |
| 0.3% | 3.7ms | 0.3% | 3.7ms | `append` | `[native code]` |
| 0.3% | 3.7ms | 0.0% | 0us | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:26` |
| 0.3% | 3.7ms | 0.3% | 3.7ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:28` |
| 0.3% | 3.6ms | 0.3% | 3.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:51` |
| 0.3% | 3.6ms | 0.1% | 1.1ms | `mergedHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:36` |
| 0.3% | 3.5ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:89` |
| 0.3% | 3.4ms | 0.3% | 3.4ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:375` |
| 0.3% | 3.3ms | 0.3% | 3.3ms | `appendBaseUrl` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:18` |
| 0.2% | 2.8ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:90` |
| 0.2% | 2.8ms | 0.2% | 2.8ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:157` |
| 0.2% | 2.7ms | 0.0% | 0us | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:395` |
| 0.2% | 2.7ms | 0.2% | 2.7ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:34` |
| 0.2% | 2.7ms | 0.2% | 2.7ms | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:441` |
| 0.2% | 2.7ms | 0.2% | 2.7ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:207` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:990` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:976` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.2% | 2.4ms | 0.2% | 2.4ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:116` |
| 0.2% | 2.4ms | 0.2% | 2.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 0.2% | 2.4ms | 0.0% | 0us | `mergedHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:41` |
| 0.2% | 2.4ms | 0.2% | 2.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:19` |
| 0.2% | 2.4ms | 0.2% | 2.4ms | `pathSegments` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:244` |
| 0.2% | 2.3ms | 0.2% | 2.3ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:31` |
| 0.2% | 2.3ms | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:216` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `requestQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:172` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `selectCandidates` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:302` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:30` |
| 0.1% | 1.5ms | 0.1% | 1.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:38` |
| 0.1% | 1.5ms | 0.1% | 1.5ms | `wireHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` |
| 0.1% | 1.4ms | 0.0% | 0us | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:110` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `isPromiseLike` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:5` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:71` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:121` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:1666` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:122` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:114` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `finalize` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:209` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:158` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `setOwn` | `/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:82` |
| 0.1% | 1.3ms | 0.0% | 0us | `internal:promisify` | `internal:promisify:53` |
| 0.1% | 1.3ms | 0.0% | 0us | `_array` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/api.js:712` |
| 0.1% | 1.3ms | 0.0% | 0us | `(module)` | `/Users/samuel/Coding/hulla/api/benchmarks/fixtures/scenario.ts:409` |
| 0.1% | 1.3ms | 0.0% | 0us | `ZodArray` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:41` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js` |
| 0.1% | 1.3ms | 0.0% | 0us | `init` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:22` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `finalize` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:219` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:220` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:122` |
| 0.1% | 1.2ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:236` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:397` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `slice` | `[native code]` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:21` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:15` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:167` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:213` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:161` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `finish` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:122` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:21` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:160` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:32` |
| 0.1% | 1.1ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:88` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `writeFetchResponseStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:148` |
| 0.1% | 1.0ms | 0.1% | 1.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:40` |
| 0.1% | 1.0ms | 0.1% | 1.0ms | `toFetchResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:127` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:217` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `createContract` | `/Users/samuel/Coding/hulla/api/packages/core/dist/index.js` |
| 0.0% | 1.0ms | 0.0% | 0us | `(module)` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:34` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:29` |
| 0.0% | 917us | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:211` |
| 0.0% | 884us | 0.0% | 0us | `encodedQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:199` |

## Function Details

### `json`
`[native code]` | Self: 9.1% (98.5ms) | Total: 9.1% (98.5ms) | Samples: 71

**Called by:**
- `writeFetchResponseStep` (41)
- `(anonymous)` (16)
- `readFetchBody` (14)

### `Request`
`[native code]` | Self: 7.7% (83.7ms) | Total: 7.7% (83.7ms) | Samples: 63

**Called by:**
- `nativeRequest` (63)

### `next`
`[native code]` | Self: 5.4% (58.2ms) | Total: 5.4% (58.2ms) | Samples: 45

**Called by:**
- `fromEntries` (41)
- `queryInput` (4)

### `copyDataProperties`
`[native code]` | Self: 4.9% (53.3ms) | Total: 4.9% (53.3ms) | Samples: 37

**Called by:**
- `async executeRuntimeRoute` (13)
- `update` (10)
- `(anonymous)` (3)
- `(anonymous)` (2)
- `async (anonymous)` (2)
- `async (anonymous)` (2)
- `async executeRuntimeRoute` (2)
- `(anonymous)` (1)
- `async (anonymous)` (1)
- `(anonymous)` (1)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:33` | Self: 4.9% (53.1ms) | Total: 32.3% (348.1ms) | Samples: 37

**Called by:**
- `async executeRuntimeRoute` (191)
- `(anonymous)` (62)

**Calls:**
- `(anonymous)` (63)
- `(anonymous)` (39)
- `(anonymous)` (34)
- `(anonymous)` (16)
- `(anonymous)` (15)
- `textWireEntries` (9)
- `(anonymous)` (5)
- `(anonymous)` (5)
- `(anonymous)` (5)
- `encodedQuery` (4)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `validateWithValue` (1)
- `(anonymous)` (1)
- `encodedQuery` (1)

### `anonymous`
`[native code]` | Self: 4.9% (53.1ms) | Total: 7.1% (77.2ms) | Samples: 33

**Called by:**
- `(anonymous)` (48)
- `node:util` (2)
- `internal:promisify` (1)

**Calls:**
- `runChecks` (8)
- `runChecks` (7)
- `(anonymous)` (1)
- `internal:promisify` (1)
- `(anonymous)` (1)

### `URLSearchParams`
`[native code]` | Self: 4.6% (50.2ms) | Total: 4.6% (50.2ms) | Samples: 32

**Called by:**
- `requestQuery` (24)
- `queryString` (8)

### `fromEntries`
`[native code]` | Self: 3.3% (35.6ms) | Total: 8.8% (95.4ms) | Samples: 25

**Called by:**
- `requestHeaders` (35)
- `fromFetchHeaders` (25)
- `(anonymous)` (4)
- `queryInput` (4)
- `encodedQuery` (1)

**Calls:**
- `next` (41)
- `entries` (3)

### `setOwn`
`/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js:14` | Self: 3.3% (35.6ms) | Total: 3.3% (35.6ms) | Samples: 28

**Called by:**
- `captureParameters` (8)
- `group` (6)
- `mergedHeaders` (6)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `mergedHeaders` (2)

### `entries`
`[native code]` | Self: 3.0% (33.2ms) | Total: 3.0% (33.2ms) | Samples: 23

**Called by:**
- `textWireEntries` (9)
- `queryString` (7)
- `fromEntries` (3)
- `queryInput` (2)
- `encodedQuery` (2)

### `pathSegments`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:245` | Self: 2.3% (25.7ms) | Total: 2.3% (25.7ms) | Samples: 19

**Called by:**
- `decodePathname` (19)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:22` | Self: 2.2% (24.5ms) | Total: 2.2% (24.5ms) | Samples: 16

**Called by:**
- `read` (16)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:210` | Self: 2.0% (21.8ms) | Total: 2.0% (21.8ms) | Samples: 17

**Called by:**
- `async (anonymous)` (17)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:33` | Self: 1.6% (17.3ms) | Total: 9.1% (98.0ms) | Samples: 13

**Called by:**
- `validate` (72)

**Calls:**
- `(anonymous)` (54)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (1)

### `encodeURIComponent`
`[native code]` | Self: 1.3% (14.8ms) | Total: 1.3% (14.8ms) | Samples: 10

**Called by:**
- `(anonymous)` (10)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:39` | Self: 1.3% (14.3ms) | Total: 2.7% (29.1ms) | Samples: 9

**Called by:**
- `(anonymous)` (19)

**Calls:**
- `encodeURIComponent` (10)

### `matchingNode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:268` | Self: 1.2% (13.1ms) | Total: 1.2% (13.1ms) | Samples: 10

**Called by:**
- `matchingNode` (8)
- `selectRoute` (2)

### `requestHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:166` | Self: 1.2% (12.9ms) | Total: 5.7% (61.4ms) | Samples: 10

**Called by:**
- `wireHeaders` (45)

**Calls:**
- `fromEntries` (35)

### `group`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:8` | Self: 1.1% (12.8ms) | Total: 1.9% (21.0ms) | Samples: 10

**Called by:**
- `(anonymous)` (16)

**Calls:**
- `setOwn` (6)

### `stringify`
`[native code]` | Self: 1.1% (12.8ms) | Total: 1.1% (12.8ms) | Samples: 9

**Called by:**
- `requestBody` (9)

### `fetchTransportResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:70` | Self: 1.1% (12.7ms) | Total: 1.1% (12.7ms) | Samples: 8

### `toString`
`[native code]` | Self: 1.0% (11.6ms) | Total: 1.0% (11.6ms) | Samples: 8

**Called by:**
- `queryString` (8)

### `runChecks`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:34` | Self: 1.0% (11.1ms) | Total: 1.0% (11.1ms) | Samples: 8

**Called by:**
- `anonymous` (8)

### `queryInput`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:214` | Self: 0.9% (9.8ms) | Total: 0.9% (9.8ms) | Samples: 7

**Called by:**
- `(anonymous)` (7)

### `runChecks`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` | Self: 0.8% (8.9ms) | Total: 0.8% (8.9ms) | Samples: 7

**Called by:**
- `anonymous` (7)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` | Self: 0.7% (8.5ms) | Total: 0.7% (8.5ms) | Samples: 6

**Called by:**
- `(anonymous)` (3)
- `read` (2)
- `async executeRuntimeRoute` (1)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:38` | Self: 0.7% (8.5ms) | Total: 0.7% (8.5ms) | Samples: 6

**Called by:**
- `async executeRuntimeRoute` (6)

### `call`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` | Self: 0.7% (7.9ms) | Total: 0.7% (7.9ms) | Samples: 4

**Called by:**
- `async run` (4)

### `cloneObject`
`[native code]` | Self: 0.7% (7.8ms) | Total: 0.7% (7.8ms) | Samples: 5

**Called by:**
- `mergedHeaders` (2)
- `async (anonymous)` (2)
- `update` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:991` | Self: 0.7% (7.8ms) | Total: 6.9% (74.3ms) | Samples: 6

**Called by:**
- `(anonymous)` (54)

**Calls:**
- `anonymous` (48)

### `_parseAsync`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` | Self: 0.6% (7.2ms) | Total: 0.6% (7.2ms) | Samples: 1

**Called by:**
- `(module)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:228` | Self: 0.6% (6.5ms) | Total: 2.8% (30.6ms) | Samples: 5

**Called by:**
- `async executeRuntimeRoute` (22)
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (13)
- `(anonymous)` (3)
- `(anonymous)` (1)
- `mapExecutionStep` (1)

### `asyncFunctionDrive`
`[native code]` | Self: 0.4% (5.1ms) | Total: 0.4% (5.1ms) | Samples: 4

**Called by:**
- `async transportAndDecode` (2)
- `async executeRuntimeRoute` (2)

### `queryInput`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:212` | Self: 0.4% (5.1ms) | Total: 1.3% (14.0ms) | Samples: 4

**Called by:**
- `(anonymous)` (10)

**Calls:**
- `next` (4)
- `entries` (2)

### `values`
`[native code]` | Self: 0.4% (4.9ms) | Total: 0.4% (4.9ms) | Samples: 4

**Called by:**
- `toFetchHeaders` (4)

### `async transportAndDecode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:117` | Self: 0.4% (4.8ms) | Total: 55.9% (601.9ms) | Samples: 4

**Called by:**
- `async executeRoute` (401)
- `async executeRoute` (45)

**Calls:**
- `async (anonymous)` (440)
- `asyncFunctionDrive` (2)

### `nativeRequest`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:56` | Self: 0.4% (4.6ms) | Total: 0.4% (4.6ms) | Samples: 3

**Called by:**
- `(anonymous)` (3)

### `mapExecutionStep`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:8` | Self: 0.4% (4.5ms) | Total: 0.4% (4.5ms) | Samples: 4

**Called by:**
- `(anonymous)` (2)
- `decode` (1)
- `(anonymous)` (1)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:109` | Self: 0.4% (4.3ms) | Total: 14.7% (158.8ms) | Samples: 3

**Called by:**
- `async executeRoute` (110)

**Calls:**
- `(anonymous)` (66)
- `(anonymous)` (20)
- `(anonymous)` (12)
- `(anonymous)` (3)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:17` | Self: 0.3% (4.2ms) | Total: 0.8% (9.5ms) | Samples: 3

**Called by:**
- `(anonymous)` (5)
- `read` (1)

**Calls:**
- `mapExecutionSteps` (1)
- `mapExecutionSteps` (1)
- `mapExecutionSteps` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:399` | Self: 0.3% (4.0ms) | Total: 2.0% (21.7ms) | Samples: 2

**Calls:**
- `copyDataProperties` (13)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:166` | Self: 0.3% (4.0ms) | Total: 1.5% (16.7ms) | Samples: 3

**Called by:**
- `(anonymous)` (13)

**Calls:**
- `(anonymous)` (9)
- `validateWithValue` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:379` | Self: 0.3% (4.0ms) | Total: 26.1% (281.3ms) | Samples: 3

**Called by:**
- `async executeRuntimeRoute` (209)

**Calls:**
- `read` (191)
- `read` (6)
- `read` (2)
- `(anonymous)` (2)
- `(anonymous)` (2)
- `read` (2)
- `(anonymous)` (1)

### `throwIfAborted`
`[native code]` | Self: 0.3% (3.9ms) | Total: 0.3% (3.9ms) | Samples: 3

**Called by:**
- `async executeRuntimeRoute` (3)

### `encodedQuery`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:188` | Self: 0.3% (3.9ms) | Total: 0.5% (6.1ms) | Samples: 2

**Called by:**
- `read` (4)

**Calls:**
- `entries` (2)

### `validate`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:122` | Self: 0.3% (3.7ms) | Total: 0.3% (3.7ms) | Samples: 3

**Called by:**
- `validateWithValue` (3)

### `mimeEssence`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:150` | Self: 0.3% (3.7ms) | Total: 0.3% (3.7ms) | Samples: 3

**Called by:**
- `(anonymous)` (3)

### `(module)`
`/private/tmp/native-profile.ts:2` | Self: 0.3% (3.7ms) | Total: 73.0% (785.5ms) | Samples: 2

**Calls:**
- `async run` (570)

### `append`
`[native code]` | Self: 0.3% (3.7ms) | Total: 0.3% (3.7ms) | Samples: 2

**Called by:**
- `queryString` (2)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:108` | Self: 0.3% (3.7ms) | Total: 71.6% (771.0ms) | Samples: 3

**Called by:**
- `call` (519)
- `async run` (45)

**Calls:**
- `async executeRoute` (401)
- `async executeRoute` (110)
- `async transportAndDecode` (45)
- `async executeRoute` (2)
- `async executeRoute` (2)
- `async executeRoute` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:28` | Self: 0.3% (3.7ms) | Total: 0.3% (3.7ms) | Samples: 3

**Called by:**
- `async executeRuntimeRoute` (2)
- `(anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:51` | Self: 0.3% (3.6ms) | Total: 0.3% (3.6ms) | Samples: 3

**Called by:**
- `read` (3)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:206` | Self: 0.3% (3.5ms) | Total: 4.1% (44.5ms) | Samples: 3

**Called by:**
- `async (anonymous)` (30)

**Calls:**
- `requestQuery` (25)
- `requestQuery` (2)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:375` | Self: 0.3% (3.4ms) | Total: 0.3% (3.4ms) | Samples: 2

### `selectRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:312` | Self: 0.3% (3.3ms) | Total: 2.9% (31.5ms) | Samples: 3

**Called by:**
- `async handler` (24)

**Calls:**
- `decodePathname` (21)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:49` | Self: 0.3% (3.3ms) | Total: 7.1% (77.1ms) | Samples: 3

**Called by:**
- `(anonymous)` (39)
- `mapExecutionSteps` (16)
- `read` (3)

**Calls:**
- `mapExecutionSteps` (39)
- `group` (16)

### `appendBaseUrl`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:18` | Self: 0.3% (3.3ms) | Total: 0.3% (3.3ms) | Samples: 3

**Called by:**
- `nativeRequest` (3)

### `nativeRequest`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:49` | Self: 0.2% (2.9ms) | Total: 4.1% (45.1ms) | Samples: 2

**Called by:**
- `(anonymous)` (32)

**Calls:**
- `queryString` (9)
- `queryString` (8)
- `queryString` (7)
- `appendBaseUrl` (3)
- `queryString` (2)
- `queryString` (1)

### `pathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:157` | Self: 0.2% (2.8ms) | Total: 0.2% (2.8ms) | Samples: 2

**Called by:**
- `async (anonymous)` (2)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:34` | Self: 0.2% (2.7ms) | Total: 0.2% (2.7ms) | Samples: 2

**Called by:**
- `async executeRuntimeRoute` (2)

### `async handler`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:441` | Self: 0.2% (2.7ms) | Total: 0.2% (2.7ms) | Samples: 2

**Called by:**
- `async (anonymous)` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:104` | Self: 0.2% (2.7ms) | Total: 1.2% (13.4ms) | Samples: 2

**Calls:**
- `(anonymous)` (9)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:207` | Self: 0.2% (2.7ms) | Total: 0.2% (2.7ms) | Samples: 2

**Called by:**
- `async (anonymous)` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:990` | Self: 0.2% (2.6ms) | Total: 0.2% (2.6ms) | Samples: 2

**Called by:**
- `(anonymous)` (2)

### `decode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js` | Self: 0.2% (2.6ms) | Total: 0.2% (2.6ms) | Samples: 2

**Called by:**
- `async (anonymous)` (2)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js` | Self: 0.2% (2.6ms) | Total: 0.2% (2.6ms) | Samples: 2

**Called by:**
- `async executeRuntimeRoute` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js` | Self: 0.2% (2.6ms) | Total: 0.2% (2.6ms) | Samples: 1

**Called by:**
- `mapExecutionSteps` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:76` | Self: 0.2% (2.6ms) | Total: 8.9% (96.7ms) | Samples: 1

**Called by:**
- `async executeRoute` (66)

**Calls:**
- `read` (62)
- `read` (2)
- `(anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` | Self: 0.2% (2.5ms) | Total: 0.2% (2.5ms) | Samples: 2

**Called by:**
- `validate` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:976` | Self: 0.2% (2.5ms) | Total: 0.2% (2.5ms) | Samples: 2

**Called by:**
- `(anonymous)` (2)

### `captureParameters`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:276` | Self: 0.2% (2.5ms) | Total: 1.2% (12.9ms) | Samples: 2

**Called by:**
- `selectCandidates` (10)

**Calls:**
- `setOwn` (8)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:103` | Self: 0.2% (2.5ms) | Total: 0.4% (4.7ms) | Samples: 2

**Called by:**
- `decode` (4)

**Calls:**
- `mapExecutionStep` (2)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` | Self: 0.2% (2.5ms) | Total: 0.2% (2.5ms) | Samples: 2

**Called by:**
- `async executeRoute` (2)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:116` | Self: 0.2% (2.4ms) | Total: 0.2% (2.4ms) | Samples: 2

**Called by:**
- `async executeRoute` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` | Self: 0.2% (2.4ms) | Total: 0.2% (2.4ms) | Samples: 2

**Called by:**
- `(anonymous)` (1)
- `anonymous` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:19` | Self: 0.2% (2.4ms) | Total: 0.2% (2.4ms) | Samples: 2

**Called by:**
- `read` (2)

### `pathSegments`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:244` | Self: 0.2% (2.4ms) | Total: 0.2% (2.4ms) | Samples: 2

**Called by:**
- `decodePathname` (2)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:31` | Self: 0.2% (2.3ms) | Total: 0.2% (2.3ms) | Samples: 2

**Called by:**
- `(anonymous)` (2)

### `requestQuery`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:172` | Self: 0.2% (2.2ms) | Total: 0.2% (2.2ms) | Samples: 2

**Called by:**
- `async (anonymous)` (2)

### `selectCandidates`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:302` | Self: 0.2% (2.2ms) | Total: 0.2% (2.2ms) | Samples: 2

**Called by:**
- `async handler` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:30` | Self: 0.2% (2.2ms) | Total: 0.2% (2.2ms) | Samples: 2

**Called by:**
- `async executeRuntimeRoute` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:54` | Self: 0.2% (2.2ms) | Total: 0.5% (6.2ms) | Samples: 2

**Called by:**
- `read` (5)

**Calls:**
- `setOwn` (3)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:38` | Self: 0.1% (1.5ms) | Total: 0.1% (1.5ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `wireHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` | Self: 0.1% (1.5ms) | Total: 0.1% (1.5ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `isPromiseLike`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:5` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `async executeRoute` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:71` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `read` (1)

### `matchingNode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:269` | Self: 0.1% (1.4ms) | Total: 1.9% (20.7ms) | Samples: 1

**Called by:**
- `selectRoute` (9)
- `matchingNode` (6)

**Calls:**
- `matchingNode` (8)
- `matchingNode` (6)

### `decode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:121` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `async run`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:153` | Self: 0.1% (1.4ms) | Total: 72.6% (781.8ms) | Samples: 1

**Called by:**
- `(module)` (570)

**Calls:**
- `async run` (569)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `read` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:87` | Self: 0.1% (1.4ms) | Total: 1.3% (14.3ms) | Samples: 1

**Called by:**
- `async executeRoute` (12)

**Calls:**
- `mergedHeaders` (6)
- `mergedHeaders` (3)
- `mergedHeaders` (2)

### `mapExecutionSteps`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:120` | Self: 0.1% (1.4ms) | Total: 3.3% (35.7ms) | Samples: 1

**Calls:**
- `decode` (22)
- `decode` (2)
- `decode` (1)
- `decode` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:1666` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `anonymous` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:122` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `read` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:204` | Self: 0.1% (1.4ms) | Total: 41.5% (446.6ms) | Samples: 1

**Called by:**
- `(anonymous)` (332)

**Calls:**
- `async (anonymous)` (269)
- `async (anonymous)` (30)
- `async (anonymous)` (17)
- `async (anonymous)` (5)
- `async (anonymous)` (3)
- `async (anonymous)` (2)
- `async (anonymous)` (2)
- `async (anonymous)` (1)
- `async (anonymous)` (1)
- `async (anonymous)` (1)

### `async run`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:154` | Self: 0.1% (1.3ms) | Total: 72.5% (780.3ms) | Samples: 1

**Called by:**
- `async run` (569)

**Calls:**
- `call` (519)
- `async executeRoute` (45)
- `call` (4)

### `nativeRequest`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:61` | Self: 0.1% (1.3ms) | Total: 7.9% (85.1ms) | Samples: 1

**Called by:**
- `(anonymous)` (64)

**Calls:**
- `Request` (63)

### `finalize`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:209` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `async executeRuntimeRoute` (1)

### `fetchTransportResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:114` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

### `pathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:158` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `async handler`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `setOwn`
`/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:82` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `async executeRoute` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `init` (1)

### `finalize`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:219` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `async executeRuntimeRoute` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:374` | Self: 0.1% (1.2ms) | Total: 27.0% (290.4ms) | Samples: 1

**Called by:**
- `async handler` (216)

**Calls:**
- `async executeRuntimeRoute` (209)
- `async executeRuntimeRoute` (4)
- `asyncFunctionDrive` (2)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:220` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `decode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:122` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:26` | Self: 0.1% (1.2ms) | Total: 0.5% (6.4ms) | Samples: 1

**Called by:**
- `read` (5)

**Calls:**
- `setOwn` (3)
- `setOwn` (1)

### `mapExecutionSteps`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:16` | Self: 0.1% (1.2ms) | Total: 5.1% (55.3ms) | Samples: 1

**Called by:**
- `(anonymous)` (39)
- `(anonymous)` (1)

**Calls:**
- `validateWithValue` (22)
- `(anonymous)` (16)
- `(anonymous)` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:397` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:86` | Self: 0.1% (1.2ms) | Total: 0.3% (3.8ms) | Samples: 1

**Called by:**
- `async executeRoute` (2)

**Calls:**
- `copyDataProperties` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:212` | Self: 0.1% (1.2ms) | Total: 0.3% (4.1ms) | Samples: 1

**Called by:**
- `async (anonymous)` (3)

**Calls:**
- `copyDataProperties` (2)

### `slice`
`[native code]` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `requestQuery` (1)

### `decode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:131` | Self: 0.1% (1.2ms) | Total: 2.6% (28.9ms) | Samples: 1

**Called by:**
- `async (anonymous)` (22)

**Calls:**
- `(anonymous)` (16)
- `(anonymous)` (4)
- `mapExecutionStep` (1)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:21` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `nativeRequest` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:118` | Self: 0.1% (1.1ms) | Total: 55.3% (595.6ms) | Samples: 1

**Called by:**
- `async transportAndDecode` (440)

**Calls:**
- `(anonymous)` (332)
- `(anonymous)` (108)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:378` | Self: 0.1% (1.1ms) | Total: 0.4% (5.1ms) | Samples: 1

**Called by:**
- `async executeRuntimeRoute` (4)

**Calls:**
- `throwIfAborted` (3)

### `mapExecutionSteps`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:15` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:167` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `pathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:161` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `queryInput`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:213` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:22` | Self: 0.1% (1.1ms) | Total: 1.2% (13.9ms) | Samples: 1

**Called by:**
- `nativeRequest` (9)

**Calls:**
- `URLSearchParams` (8)

### `mergedHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:36` | Self: 0.1% (1.1ms) | Total: 0.3% (3.6ms) | Samples: 1

**Called by:**
- `(anonymous)` (3)

**Calls:**
- `cloneObject` (2)

### `finish`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:122` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js:21` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `read` (1)

### `pathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:160` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `validateWithValue`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:138` | Self: 0.1% (1.1ms) | Total: 10.0% (107.7ms) | Samples: 1

**Called by:**
- `(anonymous)` (53)
- `mapExecutionSteps` (22)
- `read` (1)
- `(anonymous)` (1)

**Calls:**
- `validate` (76)
- `validate` (3)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:32` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `validate` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:223` | Self: 0.1% (1.1ms) | Total: 33.4% (359.7ms) | Samples: 1

**Called by:**
- `async (anonymous)` (269)

**Calls:**
- `async handler` (216)
- `async handler` (47)
- `cloneObject` (2)
- `async handler` (2)
- `async handler` (1)

### `writeFetchResponseStep`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:148` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `readFetchBody`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:68` | Self: 0.1% (1.0ms) | Total: 1.7% (18.9ms) | Samples: 1

**Called by:**
- `readBody` (14)
- `(anonymous)` (1)

**Calls:**
- `json` (14)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:40` | Self: 0.1% (1.0ms) | Total: 0.1% (1.0ms) | Samples: 1

**Called by:**
- `validate` (1)

### `toFetchResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:127` | Self: 0.1% (1.0ms) | Total: 0.1% (1.0ms) | Samples: 1

**Called by:**
- `writeFetchResponseStep` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:154` | Self: 0.0% (1.0ms) | Total: 6.7% (72.5ms) | Samples: 1

**Called by:**
- `(anonymous)` (17)
- `(anonymous)` (9)
- `(anonymous)` (9)
- `(anonymous)` (8)

**Calls:**
- `validateWithValue` (53)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:217` | Self: 0.0% (1.0ms) | Total: 0.0% (1.0ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:226` | Self: 0.0% (1.0ms) | Total: 4.3% (46.4ms) | Samples: 1

**Called by:**
- `(anonymous)` (34)
- `read` (1)

**Calls:**
- `queryInput` (10)
- `(anonymous)` (8)
- `queryInput` (7)
- `fromEntries` (4)
- `queryInput` (4)
- `queryInput` (1)

### `createContract`
`/Users/samuel/Coding/hulla/api/packages/core/dist/index.js` | Self: 0.0% (1.0ms) | Total: 0.0% (1.0ms) | Samples: 1

**Called by:**
- `(module)` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:405` | Self: 0.0% (1.0ms) | Total: 3.3% (35.5ms) | Samples: 1

**Calls:**
- `(anonymous)` (22)
- `(anonymous)` (1)
- `finalize` (1)
- `(anonymous)` (1)
- `finalize` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js:29` | Self: 0.0% (1.0ms) | Total: 0.0% (1.0ms) | Samples: 1

**Called by:**
- `async executeRuntimeRoute` (1)

### `fetchTransportResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:113` | Self: 0.0% (908us) | Total: 3.3% (36.4ms) | Samples: 1

**Calls:**
- `fromFetchHeaders` (25)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:88` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Called by:**
- `async executeRoute` (1)

**Calls:**
- `copyDataProperties` (1)

### `writeFetchResponseStep`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:163` | Self: 0.0% (0us) | Total: 6.0% (65.0ms) | Samples: 0

**Called by:**
- `async (anonymous)` (45)

**Calls:**
- `json` (41)
- `toFetchResponse` (4)
- `toFetchResponse` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:236` | Self: 0.0% (0us) | Total: 0.1% (1.2ms) | Samples: 0

**Called by:**
- `async executeRuntimeRoute` (1)

**Calls:**
- `(anonymous)` (1)

### `(module)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:30` | Self: 0.0% (0us) | Total: 0.6% (7.2ms) | Samples: 0

**Calls:**
- `_parseAsync` (1)

### `update`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:81` | Self: 0.0% (0us) | Total: 1.7% (19.2ms) | Samples: 0

**Called by:**
- `async executeRuntimeRoute` (11)

**Calls:**
- `copyDataProperties` (10)
- `cloneObject` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:402` | Self: 0.0% (0us) | Total: 1.7% (19.2ms) | Samples: 0

**Calls:**
- `update` (11)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:135` | Self: 0.0% (0us) | Total: 4.1% (44.9ms) | Samples: 0

**Called by:**
- `read` (34)

**Calls:**
- `(anonymous)` (34)

### `fromFetchHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:57` | Self: 0.0% (0us) | Total: 3.3% (35.5ms) | Samples: 0

**Called by:**
- `fetchTransportResponse` (25)

**Calls:**
- `fromEntries` (25)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:89` | Self: 0.0% (0us) | Total: 0.3% (3.5ms) | Samples: 0

**Called by:**
- `async executeRoute` (3)

**Calls:**
- `copyDataProperties` (3)

### `node:util`
`node:util:2` | Self: 0.0% (0us) | Total: 0.8% (9.4ms) | Samples: 0

**Calls:**
- `anonymous` (2)

### `validate`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:121` | Self: 0.0% (0us) | Total: 9.5% (102.8ms) | Samples: 0

**Called by:**
- `validateWithValue` (76)

**Calls:**
- `(anonymous)` (72)
- `(anonymous)` (2)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `toFetchHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:50` | Self: 0.0% (0us) | Total: 0.4% (4.9ms) | Samples: 0

**Called by:**
- `toFetchResponse` (4)

**Calls:**
- `values` (4)

### `textWireEntries`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:118` | Self: 0.0% (0us) | Total: 1.1% (12.3ms) | Samples: 0

**Called by:**
- `read` (9)

**Calls:**
- `entries` (9)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:118` | Self: 0.0% (0us) | Total: 1.7% (18.9ms) | Samples: 0

**Called by:**
- `read` (15)

**Calls:**
- `readBody` (14)
- `readFetchBody` (1)

### `internal:promisify`
`internal:promisify:53` | Self: 0.0% (0us) | Total: 0.1% (1.3ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:28` | Self: 0.0% (0us) | Total: 1.0% (11.6ms) | Samples: 0

**Called by:**
- `nativeRequest` (8)

**Calls:**
- `toString` (8)

### `nativeRequest`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:48` | Self: 0.0% (0us) | Total: 1.1% (12.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (9)

**Calls:**
- `requestBody` (9)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:218` | Self: 0.0% (0us) | Total: 0.6% (6.5ms) | Samples: 0

**Called by:**
- `async (anonymous)` (5)

**Calls:**
- `pathname` (2)
- `pathname` (1)
- `pathname` (1)
- `pathname` (1)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:110` | Self: 0.0% (0us) | Total: 0.1% (1.4ms) | Samples: 0

**Called by:**
- `async executeRoute` (1)

**Calls:**
- `isPromiseLike` (1)

### `selectRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:313` | Self: 0.0% (0us) | Total: 1.3% (14.5ms) | Samples: 0

**Called by:**
- `async handler` (11)

**Calls:**
- `matchingNode` (9)
- `matchingNode` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:149` | Self: 0.0% (0us) | Total: 41.5% (446.6ms) | Samples: 0

**Called by:**
- `async (anonymous)` (332)

**Calls:**
- `async (anonymous)` (332)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:134` | Self: 0.0% (0us) | Total: 4.8% (52.0ms) | Samples: 0

**Called by:**
- `read` (39)

**Calls:**
- `(anonymous)` (39)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:23` | Self: 0.0% (0us) | Total: 0.7% (8.4ms) | Samples: 0

**Called by:**
- `nativeRequest` (7)

**Calls:**
- `entries` (7)

### `selectCandidates`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:304` | Self: 0.0% (0us) | Total: 1.2% (12.9ms) | Samples: 0

**Called by:**
- `selectRoute` (9)
- `async handler` (1)

**Calls:**
- `captureParameters` (10)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:136` | Self: 0.0% (0us) | Total: 8.2% (88.4ms) | Samples: 0

**Called by:**
- `read` (63)

**Calls:**
- `wireHeaders` (45)
- `(anonymous)` (17)
- `wireHeaders` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:90` | Self: 0.0% (0us) | Total: 0.2% (2.8ms) | Samples: 0

**Called by:**
- `async executeRoute` (2)

**Calls:**
- `copyDataProperties` (2)

### `async handler`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:444` | Self: 0.0% (0us) | Total: 5.7% (61.3ms) | Samples: 0

**Called by:**
- `async (anonymous)` (47)

**Calls:**
- `selectRoute` (24)
- `selectRoute` (11)
- `selectRoute` (9)
- `selectCandidates` (2)
- `selectCandidates` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:147` | Self: 0.0% (0us) | Total: 13.7% (147.8ms) | Samples: 0

**Called by:**
- `async (anonymous)` (108)

**Calls:**
- `nativeRequest` (64)
- `nativeRequest` (32)
- `nativeRequest` (9)
- `nativeRequest` (3)

### `requestQuery`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:175` | Self: 0.0% (0us) | Total: 3.6% (38.7ms) | Samples: 0

**Called by:**
- `async (anonymous)` (25)

**Calls:**
- `URLSearchParams` (24)
- `slice` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:216` | Self: 0.0% (0us) | Total: 0.2% (2.3ms) | Samples: 0

**Called by:**
- `async (anonymous)` (2)

**Calls:**
- `copyDataProperties` (2)

### `mergedHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:43` | Self: 0.0% (0us) | Total: 0.6% (6.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (6)

**Calls:**
- `setOwn` (6)

### `(module)`
`/Users/samuel/Coding/hulla/api/benchmarks/fixtures/scenario.ts:409` | Self: 0.0% (0us) | Total: 0.1% (1.3ms) | Samples: 0

**Calls:**
- `_array` (1)

### `init`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:22` | Self: 0.0% (0us) | Total: 0.1% (1.3ms) | Samples: 0

**Called by:**
- `ZodArray` (1)

**Calls:**
- `(anonymous)` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:227` | Self: 0.0% (0us) | Total: 6.0% (64.8ms) | Samples: 0

**Calls:**
- `writeFetchResponseStep` (45)
- `writeFetchResponseStep` (1)

### `wireHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:95` | Self: 0.0% (0us) | Total: 5.7% (61.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (45)

**Calls:**
- `requestHeaders` (45)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:112` | Self: 0.0% (0us) | Total: 0.3% (3.7ms) | Samples: 0

**Called by:**
- `read` (3)

**Calls:**
- `mimeEssence` (3)

### `(module)`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:34` | Self: 0.0% (0us) | Total: 0.0% (1.0ms) | Samples: 0

**Calls:**
- `createContract` (1)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:129` | Self: 0.0% (0us) | Total: 50.3% (541.3ms) | Samples: 0

**Called by:**
- `async executeRoute` (401)

**Calls:**
- `async transportAndDecode` (401)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:211` | Self: 0.0% (0us) | Total: 0.0% (917us) | Samples: 0

**Called by:**
- `async (anonymous)` (1)

**Calls:**
- `copyDataProperties` (1)

### `call`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:192` | Self: 0.0% (0us) | Total: 66.0% (710.8ms) | Samples: 0

**Called by:**
- `async run` (519)

**Calls:**
- `async executeRoute` (519)

### `encodedQuery`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:199` | Self: 0.0% (0us) | Total: 0.0% (884us) | Samples: 0

**Called by:**
- `read` (1)

**Calls:**
- `fromEntries` (1)

### `readBody`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:221` | Self: 0.0% (0us) | Total: 1.6% (17.8ms) | Samples: 0

**Called by:**
- `(anonymous)` (14)

**Calls:**
- `readFetchBody` (14)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:26` | Self: 0.0% (0us) | Total: 0.3% (3.7ms) | Samples: 0

**Called by:**
- `nativeRequest` (2)

**Calls:**
- `append` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:85` | Self: 0.0% (0us) | Total: 2.8% (30.6ms) | Samples: 0

**Called by:**
- `async executeRoute` (20)

**Calls:**
- `(anonymous)` (19)
- `(anonymous)` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:395` | Self: 0.0% (0us) | Total: 0.2% (2.7ms) | Samples: 0

**Calls:**
- `copyDataProperties` (2)

### `toFetchResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js:136` | Self: 0.0% (0us) | Total: 0.4% (4.9ms) | Samples: 0

**Called by:**
- `writeFetchResponseStep` (4)

**Calls:**
- `toFetchHeaders` (4)

### `selectRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:314` | Self: 0.0% (0us) | Total: 1.0% (11.6ms) | Samples: 0

**Called by:**
- `async handler` (9)

**Calls:**
- `selectCandidates` (9)

### `async handler`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:449` | Self: 0.0% (0us) | Total: 27.0% (290.4ms) | Samples: 0

**Called by:**
- `async (anonymous)` (216)

**Calls:**
- `async executeRuntimeRoute` (216)

### `mergedHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:41` | Self: 0.0% (0us) | Total: 0.2% (2.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (2)

**Calls:**
- `setOwn` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:70` | Self: 0.0% (0us) | Total: 0.7% (8.0ms) | Samples: 0

**Called by:**
- `read` (5)

**Calls:**
- `(anonymous)` (5)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js:102` | Self: 0.0% (0us) | Total: 2.0% (21.7ms) | Samples: 0

**Called by:**
- `decode` (16)

**Calls:**
- `json` (16)

### `decodePathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js:248` | Self: 0.0% (0us) | Total: 2.6% (28.1ms) | Samples: 0

**Called by:**
- `selectRoute` (21)

**Calls:**
- `pathSegments` (19)
- `pathSegments` (2)

### `ZodArray`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:41` | Self: 0.0% (0us) | Total: 0.1% (1.3ms) | Samples: 0

**Called by:**
- `_array` (1)

**Calls:**
- `init` (1)

### `queryInput`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js:218` | Self: 0.0% (0us) | Total: 0.5% (5.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `fromEntries` (4)

### `requestBody`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:36` | Self: 0.0% (0us) | Total: 1.1% (12.8ms) | Samples: 0

**Called by:**
- `nativeRequest` (9)

**Calls:**
- `stringify` (9)

### `_array`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/api.js:712` | Self: 0.0% (0us) | Total: 0.1% (1.3ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodArray` (1)

## Files

| Self% | Self | File |
|------:|-----:|------|
| 49.5% | 532.4ms | `[native code]` |
| 9.0% | 97.4ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-DPYuuX89.js` |
| 8.2% | 88.6ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-B-OEbhfR.js` |
| 7.9% | 85.8ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` |
| 6.9% | 74.3ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BiZ8oQjO.js` |
| 3.7% | 40.7ms | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 3.6% | 39.3ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 3.4% | 37.0ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js` |
| 2.7% | 29.3ms | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` |
| 2.3% | 24.9ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-B5Z06fmv.js` |
| 1.2% | 13.0ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-CQpcpHvo.js` |
| 0.3% | 3.7ms | `/private/tmp/native-profile.ts` |
| 0.3% | 3.2ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-CXQo1C2l.js` |
| 0.2% | 2.8ms | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts` |
| 0.1% | 1.3ms | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js` |
| 0.0% | 1.0ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/index.js` |
