# CPU Profile

| Duration | Samples | Interval | Functions |
|----------|---------|----------|----------|
| 1.07s | 776 | 1.0ms | 203 |

**Top 10:** `json` 9.7%, `next` 7.6%, `Request` 6.5%, `anonymous` 5.8%, `copyDataProperties` 3.7%, `setOwn` 3.4%, `URLSearchParams` 3.2%, `read` 2.7%, `pathname` 2.4%, `async (anonymous)` 2.1%

## Hot Functions (Self Time)

| Self% | Self | Total% | Total | Function | Location |
|------:|-----:|-------:|------:|----------|----------|
| 9.7% | 105.4ms | 9.7% | 105.4ms | `json` | `[native code]` |
| 7.6% | 82.6ms | 7.6% | 82.6ms | `next` | `[native code]` |
| 6.5% | 71.0ms | 6.5% | 71.0ms | `Request` | `[native code]` |
| 5.8% | 62.5ms | 8.3% | 89.9ms | `anonymous` | `[native code]` |
| 3.7% | 40.8ms | 3.7% | 40.8ms | `copyDataProperties` | `[native code]` |
| 3.4% | 36.7ms | 3.4% | 36.7ms | `setOwn` | `/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js:14` |
| 3.2% | 35.3ms | 3.2% | 35.3ms | `URLSearchParams` | `[native code]` |
| 2.7% | 29.9ms | 31.6% | 341.0ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:33` |
| 2.4% | 26.1ms | 2.4% | 26.1ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:157` |
| 2.1% | 23.0ms | 2.1% | 23.0ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:210` |
| 2.0% | 22.5ms | 2.0% | 22.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:22` |
| 2.0% | 22.5ms | 8.3% | 90.0ms | `fromEntries` | `[native code]` |
| 1.9% | 20.6ms | 1.9% | 20.6ms | `entries` | `[native code]` |
| 1.3% | 14.6ms | 1.3% | 14.6ms | `stringify` | `[native code]` |
| 1.3% | 14.0ms | 1.3% | 14.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` |
| 1.2% | 13.7ms | 1.2% | 13.7ms | `toString` | `[native code]` |
| 1.1% | 12.8ms | 1.4% | 15.6ms | `group` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:8` |
| 1.1% | 12.5ms | 1.1% | 12.5ms | `cloneObject` | `[native code]` |
| 1.1% | 12.4ms | 1.2% | 13.4ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:34` |
| 1.1% | 12.0ms | 7.4% | 79.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:33` |
| 0.9% | 10.4ms | 15.0% | 161.7ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:109` |
| 0.9% | 10.4ms | 1.8% | 19.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:54` |
| 0.9% | 9.8ms | 1.0% | 11.0ms | `mapExecutionStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:8` |
| 0.9% | 9.8ms | 70.3% | 757.1ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:108` |
| 0.8% | 9.6ms | 0.8% | 9.6ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:38` |
| 0.8% | 9.0ms | 0.8% | 9.0ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 0.8% | 9.0ms | 0.8% | 9.0ms | `pathSegments` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:239` |
| 0.8% | 8.9ms | 0.8% | 8.9ms | `has` | `[native code]` |
| 0.8% | 8.7ms | 0.8% | 8.7ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:70` |
| 0.8% | 8.6ms | 0.8% | 8.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.7% | 8.4ms | 0.7% | 8.4ms | `defineDefaultBodyResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/index.js` |
| 0.7% | 8.2ms | 1.4% | 15.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:39` |
| 0.7% | 7.8ms | 5.7% | 62.3ms | `requestHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:166` |
| 0.7% | 7.8ms | 4.3% | 46.7ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:113` |
| 0.6% | 7.4ms | 0.6% | 7.4ms | `pathSegments` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:238` |
| 0.6% | 7.3ms | 0.6% | 7.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:19` |
| 0.6% | 7.2ms | 0.6% | 7.2ms | `encodeURIComponent` | `[native code]` |
| 0.6% | 6.6ms | 4.4% | 47.9ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:16` |
| 0.6% | 6.5ms | 0.6% | 6.5ms | `append` | `[native code]` |
| 0.6% | 6.5ms | 0.6% | 6.5ms | `asyncFunctionDrive` | `[native code]` |
| 0.5% | 6.3ms | 2.2% | 24.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:222` |
| 0.5% | 6.3ms | 0.5% | 6.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js` |
| 0.5% | 6.2ms | 0.5% | 6.2ms | `freeze` | `[native code]` |
| 0.5% | 6.2ms | 1.7% | 18.6ms | `captureParameters` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:270` |
| 0.5% | 5.7ms | 0.5% | 5.7ms | `matchingNode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:262` |
| 0.5% | 5.6ms | 0.5% | 5.6ms | `values` | `[native code]` |
| 0.5% | 5.4ms | 0.5% | 5.4ms | `slice` | `[native code]` |
| 0.4% | 5.0ms | 0.4% | 5.0ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:34` |
| 0.4% | 4.9ms | 7.0% | 75.9ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:61` |
| 0.4% | 4.9ms | 0.4% | 4.9ms | `toFetchResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:127` |
| 0.4% | 4.6ms | 0.6% | 6.9ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:389` |
| 0.4% | 4.5ms | 8.0% | 86.3ms | `validate` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:121` |
| 0.4% | 4.3ms | 0.4% | 4.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:28` |
| 0.3% | 4.1ms | 0.3% | 4.1ms | `requestQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:172` |
| 0.3% | 4.1ms | 8.5% | 91.9ms | `validateWithValue` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:123` |
| 0.3% | 4.1ms | 1.9% | 20.6ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:212` |
| 0.3% | 4.0ms | 4.9% | 53.4ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:49` |
| 0.3% | 3.9ms | 0.3% | 3.9ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:31` |
| 0.3% | 3.9ms | 54.4% | 585.3ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:118` |
| 0.3% | 3.8ms | 0.3% | 3.8ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:114` |
| 0.3% | 3.8ms | 0.3% | 3.8ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:369` |
| 0.3% | 3.8ms | 0.3% | 3.8ms | `mimeEssence` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:150` |
| 0.3% | 3.8ms | 0.3% | 3.8ms | `appendBaseUrl` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:18` |
| 0.3% | 3.4ms | 2.6% | 28.2ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:399` |
| 0.2% | 2.9ms | 0.2% | 2.9ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:30` |
| 0.2% | 2.8ms | 6.8% | 74.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:991` |
| 0.2% | 2.7ms | 0.5% | 6.0ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:211` |
| 0.2% | 2.7ms | 0.2% | 2.7ms | `call` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:190` |
| 0.2% | 2.6ms | 0.5% | 6.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:86` |
| 0.2% | 2.6ms | 2.7% | 29.4ms | `requestQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:175` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:29` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:214` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:205` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `finish` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:120` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `throwIfAborted` | `[native code]` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:116` |
| 0.2% | 2.4ms | 71.3% | 767.1ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:159` |
| 0.2% | 2.4ms | 66.0% | 710.8ms | `call` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:192` |
| 0.2% | 2.3ms | 0.2% | 2.3ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js` |
| 0.2% | 2.3ms | 0.2% | 2.3ms | `call` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:163` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:97` |
| 0.2% | 2.2ms | 0.4% | 4.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:17` |
| 0.2% | 2.1ms | 3.3% | 35.8ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:206` |
| 0.1% | 2.0ms | 40.2% | 433.4ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:204` |
| 0.1% | 1.5ms | 0.1% | 1.5ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js` |
| 0.1% | 1.5ms | 0.1% | 1.5ms | `validate` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:122` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:435` |
| 0.1% | 1.4ms | 0.8% | 8.9ms | `mergedHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:36` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `finalize` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:203` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:739` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:114` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:126` |
| 0.1% | 1.4ms | 6.0% | 65.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:49` |
| 0.1% | 1.4ms | 0.6% | 7.0ms | `toFetchHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:50` |
| 0.1% | 1.3ms | 0.6% | 6.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:89` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `writeFetchResponseStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:148` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:29` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:116` |
| 0.1% | 1.3ms | 0.3% | 3.8ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:383` |
| 0.1% | 1.3ms | 6.1% | 66.4ms | `writeFetchResponseStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:163` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `mimeEssence` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:149` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `readBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:161` |
| 0.1% | 1.3ms | 0.8% | 9.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:6` |
| 0.1% | 1.3ms | 1.4% | 15.2ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:22` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:158` |
| 0.1% | 1.3ms | 1.3% | 15.0ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:28` |
| 0.1% | 1.3ms | 54.2% | 584.1ms | `async transportAndDecode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:117` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:53` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:21` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:976` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `readFetchBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js` |
| 0.1% | 1.2ms | 1.6% | 17.8ms | `selectRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:306` |
| 0.1% | 1.2ms | 0.7% | 7.8ms | `encodedQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:188` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:213` |
| 0.1% | 1.2ms | 3.4% | 36.5ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:126` |
| 0.1% | 1.2ms | 9.0% | 97.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:76` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:372` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:15` |
| 0.1% | 1.1ms | 4.0% | 43.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:226` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `validateHandlerTree` | `/Users/samuel/Coding/hulla/api/packages/core/dist/server/index.js` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:209` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:150` |
| 0.1% | 1.1ms | 0.8% | 8.9ms | `matchingNode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:263` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:82` |
| 0.1% | 1.0ms | 0.1% | 1.0ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:38` |
| 0.1% | 1.0ms | 0.1% | 1.0ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:215` |
| 0.1% | 1.0ms | 0.9% | 10.0ms | `fromFetchHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:58` |
| 0.1% | 1.0ms | 1.4% | 15.0ms | `update` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:81` |
| 0.0% | 1.0ms | 2.0% | 22.1ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:165` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:38` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `aborted` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/util.js:525` |
| 0.0% | 1.0ms | 26.3% | 283.4ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:368` |

## Call Tree (Total Time)

| Total% | Total | Self% | Self | Function | Location |
|-------:|------:|------:|-----:|----------|----------|
| 71.3% | 767.3ms | 0.0% | 0us | `(module)` | `/private/tmp/native-profile.ts:2` |
| 71.3% | 767.3ms | 0.0% | 0us | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:158` |
| 71.3% | 767.1ms | 0.2% | 2.4ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:159` |
| 70.3% | 757.1ms | 0.9% | 9.8ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:108` |
| 66.0% | 710.8ms | 0.2% | 2.4ms | `call` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:192` |
| 54.4% | 585.3ms | 0.3% | 3.9ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:118` |
| 54.2% | 584.1ms | 0.1% | 1.3ms | `async transportAndDecode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:117` |
| 49.3% | 530.5ms | 0.0% | 0us | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:129` |
| 40.2% | 433.4ms | 0.1% | 2.0ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:204` |
| 40.2% | 433.4ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:149` |
| 31.6% | 341.0ms | 2.7% | 29.9ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:33` |
| 30.6% | 329.6ms | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:223` |
| 26.3% | 283.4ms | 0.0% | 0us | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:443` |
| 26.3% | 283.4ms | 0.0% | 1.0ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:368` |
| 25.6% | 276.1ms | 0.0% | 0us | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:373` |
| 15.0% | 161.7ms | 0.9% | 10.4ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:109` |
| 13.5% | 145.3ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:147` |
| 9.7% | 105.4ms | 9.7% | 105.4ms | `json` | `[native code]` |
| 9.0% | 97.1ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:76` |
| 8.5% | 91.9ms | 0.3% | 4.1ms | `validateWithValue` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:123` |
| 8.3% | 90.0ms | 2.0% | 22.5ms | `fromEntries` | `[native code]` |
| 8.3% | 89.9ms | 5.8% | 62.5ms | `anonymous` | `[native code]` |
| 8.1% | 87.8ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:133` |
| 8.0% | 86.3ms | 0.4% | 4.5ms | `validate` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:121` |
| 7.6% | 82.6ms | 7.6% | 82.6ms | `next` | `[native code]` |
| 7.4% | 79.6ms | 1.1% | 12.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:33` |
| 7.0% | 75.9ms | 0.4% | 4.9ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:61` |
| 6.8% | 74.2ms | 0.2% | 2.8ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:991` |
| 6.5% | 71.0ms | 6.5% | 71.0ms | `Request` | `[native code]` |
| 6.1% | 66.4ms | 0.1% | 1.3ms | `writeFetchResponseStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:163` |
| 6.0% | 65.0ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:49` |
| 5.8% | 62.4ms | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:227` |
| 5.7% | 62.3ms | 0.7% | 7.8ms | `requestHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:166` |
| 5.7% | 62.3ms | 0.0% | 0us | `wireHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:92` |
| 5.6% | 60.6ms | 0.0% | 0us | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:138` |
| 4.9% | 53.4ms | 0.3% | 4.0ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:49` |
| 4.4% | 47.9ms | 0.6% | 6.6ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:16` |
| 4.3% | 46.7ms | 0.7% | 7.8ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:113` |
| 4.1% | 44.8ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:131` |
| 4.0% | 43.6ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:132` |
| 4.0% | 43.6ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:226` |
| 4.0% | 43.3ms | 0.0% | 0us | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:438` |
| 3.7% | 40.8ms | 3.7% | 40.8ms | `copyDataProperties` | `[native code]` |
| 3.7% | 40.6ms | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:120` |
| 3.4% | 36.7ms | 3.4% | 36.7ms | `setOwn` | `/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js:14` |
| 3.4% | 36.5ms | 0.1% | 1.2ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:126` |
| 3.3% | 35.8ms | 0.2% | 2.1ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:206` |
| 3.2% | 35.3ms | 3.2% | 35.3ms | `URLSearchParams` | `[native code]` |
| 2.8% | 31.1ms | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:218` |
| 2.7% | 29.4ms | 0.2% | 2.6ms | `requestQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:175` |
| 2.7% | 29.2ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:115` |
| 2.6% | 28.8ms | 0.0% | 0us | `fromFetchHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:57` |
| 2.6% | 28.2ms | 0.3% | 3.4ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:399` |
| 2.5% | 27.9ms | 0.0% | 0us | `readFetchBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:68` |
| 2.4% | 26.4ms | 0.0% | 0us | `readBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:221` |
| 2.4% | 26.1ms | 2.4% | 26.1ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:157` |
| 2.3% | 25.7ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:99` |
| 2.2% | 24.5ms | 0.5% | 6.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:222` |
| 2.1% | 23.0ms | 2.1% | 23.0ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:210` |
| 2.0% | 22.5ms | 2.0% | 22.5ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:22` |
| 2.0% | 22.1ms | 0.0% | 1.0ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:165` |
| 1.9% | 20.6ms | 1.9% | 20.6ms | `entries` | `[native code]` |
| 1.9% | 20.6ms | 0.3% | 4.1ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:212` |
| 1.8% | 19.5ms | 0.9% | 10.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:54` |
| 1.7% | 18.6ms | 0.5% | 6.2ms | `captureParameters` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:270` |
| 1.7% | 18.6ms | 0.0% | 0us | `selectCandidates` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:298` |
| 1.6% | 17.8ms | 0.1% | 1.2ms | `selectRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:306` |
| 1.6% | 17.4ms | 0.0% | 0us | `node:util` | `node:util:2` |
| 1.5% | 16.5ms | 0.0% | 0us | `decodePathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:242` |
| 1.5% | 16.4ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:85` |
| 1.4% | 16.1ms | 0.0% | 0us | `selectRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:308` |
| 1.4% | 15.8ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:87` |
| 1.4% | 15.6ms | 1.1% | 12.8ms | `group` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:8` |
| 1.4% | 15.4ms | 0.7% | 8.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:39` |
| 1.4% | 15.2ms | 0.1% | 1.3ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:22` |
| 1.4% | 15.0ms | 0.1% | 1.0ms | `update` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:81` |
| 1.4% | 15.0ms | 0.0% | 0us | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:396` |
| 1.3% | 15.0ms | 0.1% | 1.3ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:28` |
| 1.3% | 14.7ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:160` |
| 1.3% | 14.6ms | 1.3% | 14.6ms | `stringify` | `[native code]` |
| 1.3% | 14.6ms | 0.0% | 0us | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:48` |
| 1.3% | 14.6ms | 0.0% | 0us | `requestBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:36` |
| 1.3% | 14.0ms | 1.3% | 14.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` |
| 1.2% | 13.7ms | 1.2% | 13.7ms | `toString` | `[native code]` |
| 1.2% | 13.4ms | 1.1% | 12.4ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:34` |
| 1.1% | 12.5ms | 1.1% | 12.5ms | `cloneObject` | `[native code]` |
| 1.0% | 11.0ms | 0.9% | 9.8ms | `mapExecutionStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:8` |
| 0.9% | 10.0ms | 0.1% | 1.0ms | `fromFetchHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:58` |
| 0.8% | 9.6ms | 0.8% | 9.6ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:38` |
| 0.8% | 9.2ms | 0.1% | 1.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:6` |
| 0.8% | 9.0ms | 0.8% | 9.0ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 0.8% | 9.0ms | 0.8% | 9.0ms | `pathSegments` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:239` |
| 0.8% | 8.9ms | 0.8% | 8.9ms | `has` | `[native code]` |
| 0.8% | 8.9ms | 0.1% | 1.4ms | `mergedHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:36` |
| 0.8% | 8.9ms | 0.1% | 1.1ms | `matchingNode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:263` |
| 0.8% | 8.7ms | 0.8% | 8.7ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:70` |
| 0.8% | 8.6ms | 0.8% | 8.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.7% | 8.4ms | 0.7% | 8.4ms | `defineDefaultBodyResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/index.js` |
| 0.7% | 8.4ms | 0.0% | 0us | `(module)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/index.js:319` |
| 0.7% | 7.8ms | 0.1% | 1.2ms | `encodedQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:188` |
| 0.6% | 7.4ms | 0.6% | 7.4ms | `pathSegments` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:238` |
| 0.6% | 7.3ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:100` |
| 0.6% | 7.3ms | 0.6% | 7.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:19` |
| 0.6% | 7.3ms | 0.0% | 0us | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:23` |
| 0.6% | 7.2ms | 0.6% | 7.2ms | `encodeURIComponent` | `[native code]` |
| 0.6% | 7.0ms | 0.1% | 1.4ms | `toFetchHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:50` |
| 0.6% | 7.0ms | 0.0% | 0us | `toFetchResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:136` |
| 0.6% | 6.9ms | 0.4% | 4.6ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:389` |
| 0.6% | 6.8ms | 0.0% | 0us | `selectRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:307` |
| 0.6% | 6.6ms | 0.1% | 1.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:89` |
| 0.6% | 6.5ms | 0.6% | 6.5ms | `append` | `[native code]` |
| 0.6% | 6.5ms | 0.0% | 0us | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:26` |
| 0.6% | 6.5ms | 0.6% | 6.5ms | `asyncFunctionDrive` | `[native code]` |
| 0.5% | 6.4ms | 0.2% | 2.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:86` |
| 0.5% | 6.3ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:966` |
| 0.5% | 6.3ms | 0.5% | 6.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js` |
| 0.5% | 6.2ms | 0.5% | 6.2ms | `freeze` | `[native code]` |
| 0.5% | 6.0ms | 0.2% | 2.7ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:211` |
| 0.5% | 6.0ms | 0.0% | 0us | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:393` |
| 0.5% | 5.9ms | 0.0% | 0us | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:218` |
| 0.5% | 5.7ms | 0.0% | 0us | `mergedHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:43` |
| 0.5% | 5.7ms | 0.5% | 5.7ms | `matchingNode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:262` |
| 0.5% | 5.6ms | 0.5% | 5.6ms | `values` | `[native code]` |
| 0.5% | 5.5ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:26` |
| 0.5% | 5.4ms | 0.5% | 5.4ms | `slice` | `[native code]` |
| 0.4% | 5.3ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:90` |
| 0.4% | 5.2ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:109` |
| 0.4% | 5.0ms | 0.4% | 5.0ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:34` |
| 0.4% | 4.9ms | 0.4% | 4.9ms | `toFetchResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:127` |
| 0.4% | 4.6ms | 0.2% | 2.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:17` |
| 0.4% | 4.3ms | 0.4% | 4.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:28` |
| 0.3% | 4.1ms | 0.3% | 4.1ms | `requestQuery` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:172` |
| 0.3% | 3.9ms | 0.3% | 3.9ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:31` |
| 0.3% | 3.8ms | 0.0% | 0us | `textWireEntries` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:118` |
| 0.3% | 3.8ms | 0.3% | 3.8ms | `fetchTransportResponse` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:114` |
| 0.3% | 3.8ms | 0.3% | 3.8ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:369` |
| 0.3% | 3.8ms | 0.1% | 1.3ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:383` |
| 0.3% | 3.8ms | 0.3% | 3.8ms | `mimeEssence` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:150` |
| 0.3% | 3.8ms | 0.3% | 3.8ms | `appendBaseUrl` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:18` |
| 0.3% | 3.7ms | 0.0% | 0us | `init` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:22` |
| 0.3% | 3.5ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:70` |
| 0.2% | 2.9ms | 0.2% | 2.9ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:30` |
| 0.2% | 2.7ms | 0.2% | 2.7ms | `call` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:190` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:29` |
| 0.2% | 2.6ms | 0.2% | 2.6ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:214` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:205` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `finish` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:120` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `throwIfAborted` | `[native code]` |
| 0.2% | 2.5ms | 0.2% | 2.5ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:116` |
| 0.2% | 2.5ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:230` |
| 0.2% | 2.3ms | 0.2% | 2.3ms | `read` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js` |
| 0.2% | 2.3ms | 0.2% | 2.3ms | `call` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 0.2% | 2.2ms | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:216` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:163` |
| 0.2% | 2.2ms | 0.2% | 2.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:97` |
| 0.1% | 1.5ms | 0.1% | 1.5ms | `decode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js` |
| 0.1% | 1.5ms | 0.1% | 1.5ms | `validate` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:122` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `async handler` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:435` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `finalize` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:203` |
| 0.1% | 1.4ms | 0.0% | 0us | `(module)` | `/Users/samuel/Coding/hulla/api/benchmarks/fixtures/scenario.ts:433` |
| 0.1% | 1.4ms | 0.0% | 0us | `object` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:791` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:739` |
| 0.1% | 1.4ms | 0.0% | 0us | `ZodObject` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:41` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:114` |
| 0.1% | 1.4ms | 0.1% | 1.4ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:126` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `writeFetchResponseStep` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:148` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `queryString` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:29` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `async executeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:116` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `mimeEssence` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:149` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:161` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `readBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `pathname` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:158` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:53` |
| 0.1% | 1.3ms | 0.1% | 1.3ms | `nativeRequest` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `async run` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:21` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:976` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `readFetchBody` | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `queryInput` | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:213` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `async executeRuntimeRoute` | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:372` |
| 0.1% | 1.2ms | 0.1% | 1.2ms | `mapExecutionSteps` | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:15` |
| 0.1% | 1.1ms | 0.0% | 0us | `mergedHeaders` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:41` |
| 0.1% | 1.1ms | 0.0% | 0us | `internal:util/inspect` | `internal:util/inspect:2` |
| 0.1% | 1.1ms | 0.0% | 0us | `(module)` | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:66` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `validateHandlerTree` | `/Users/samuel/Coding/hulla/api/packages/core/dist/server/index.js` |
| 0.1% | 1.1ms | 0.0% | 0us | `implement` | `/Users/samuel/Coding/hulla/api/packages/core/dist/server/index.js:177` |
| 0.1% | 1.1ms | 0.0% | 0us | `bindServerNode` | `/Users/samuel/Coding/hulla/api/packages/core/dist/server/index.js:95` |
| 0.1% | 1.1ms | 0.0% | 0us | `ZodString` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:41` |
| 0.1% | 1.1ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:259` |
| 0.1% | 1.1ms | 0.0% | 0us | `_string` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/api.js:7` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:209` |
| 0.1% | 1.1ms | 0.0% | 0us | `(module)` | `/Users/samuel/Coding/hulla/api/benchmarks/fixtures/scenario.ts:404` |
| 0.1% | 1.1ms | 0.0% | 0us | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:88` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:150` |
| 0.1% | 1.1ms | 0.1% | 1.1ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:82` |
| 0.1% | 1.0ms | 0.1% | 1.0ms | `runChecks` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:38` |
| 0.1% | 1.0ms | 0.1% | 1.0ms | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:215` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `(anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:38` |
| 0.0% | 1.0ms | 0.0% | 0us | `async (anonymous)` | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:212` |
| 0.0% | 1.0ms | 0.0% | 1.0ms | `aborted` | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/util.js:525` |

## Function Details

### `json`
`[native code]` | Self: 9.7% (105.4ms) | Total: 9.7% (105.4ms) | Samples: 76

**Called by:**
- `writeFetchResponseStep` (39)
- `readFetchBody` (21)
- `(anonymous)` (16)

### `next`
`[native code]` | Self: 7.6% (82.6ms) | Total: 7.6% (82.6ms) | Samples: 60

**Called by:**
- `fromEntries` (50)
- `queryInput` (10)

### `Request`
`[native code]` | Self: 6.5% (71.0ms) | Total: 6.5% (71.0ms) | Samples: 52

**Called by:**
- `nativeRequest` (52)

### `anonymous`
`[native code]` | Self: 5.8% (62.5ms) | Total: 8.3% (89.9ms) | Samples: 36

**Called by:**
- `(anonymous)` (50)
- `(anonymous)` (4)
- `node:util` (2)
- `internal:util/inspect` (1)

**Calls:**
- `runChecks` (11)
- `runChecks` (6)
- `(anonymous)` (1)
- `runChecks` (1)
- `(anonymous)` (1)
- `internal:util/inspect` (1)

### `copyDataProperties`
`[native code]` | Self: 3.7% (40.8ms) | Total: 3.7% (40.8ms) | Samples: 32

**Called by:**
- `update` (8)
- `async executeRuntimeRoute` (5)
- `(anonymous)` (4)
- `(anonymous)` (3)
- `(anonymous)` (3)
- `async (anonymous)` (3)
- `async executeRuntimeRoute` (2)
- `async (anonymous)` (2)
- `(anonymous)` (1)
- `async (anonymous)` (1)

### `setOwn`
`/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js:14` | Self: 3.4% (36.7ms) | Total: 3.4% (36.7ms) | Samples: 27

**Called by:**
- `captureParameters` (10)
- `(anonymous)` (6)
- `mergedHeaders` (4)
- `(anonymous)` (4)
- `group` (2)
- `mergedHeaders` (1)

### `URLSearchParams`
`[native code]` | Self: 3.2% (35.3ms) | Total: 3.2% (35.3ms) | Samples: 26

**Called by:**
- `requestQuery` (16)
- `queryString` (10)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:33` | Self: 2.7% (29.9ms) | Total: 31.6% (341.0ms) | Samples: 24

**Called by:**
- `async executeRuntimeRoute` (191)
- `(anonymous)` (60)

**Calls:**
- `(anonymous)` (66)
- `(anonymous)` (33)
- `(anonymous)` (31)
- `(anonymous)` (22)
- `(anonymous)` (14)
- `(anonymous)` (13)
- `(anonymous)` (7)
- `encodedQuery` (6)
- `(anonymous)` (4)
- `freeze` (4)
- `(anonymous)` (4)
- `(anonymous)` (4)
- `(anonymous)` (4)
- `(anonymous)` (4)
- `textWireEntries` (3)
- `(anonymous)` (3)
- `validateWithValue` (2)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `pathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:157` | Self: 2.4% (26.1ms) | Total: 2.4% (26.1ms) | Samples: 19

**Called by:**
- `async (anonymous)` (19)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:210` | Self: 2.1% (23.0ms) | Total: 2.1% (23.0ms) | Samples: 17

**Called by:**
- `async (anonymous)` (17)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:22` | Self: 2.0% (22.5ms) | Total: 2.0% (22.5ms) | Samples: 14

**Called by:**
- `read` (14)

### `fromEntries`
`[native code]` | Self: 2.0% (22.5ms) | Total: 8.3% (90.0ms) | Samples: 17

**Called by:**
- `requestHeaders` (39)
- `fromFetchHeaders` (22)
- `queryInput` (5)
- `(anonymous)` (1)

**Calls:**
- `next` (50)

### `entries`
`[native code]` | Self: 1.9% (20.6ms) | Total: 1.9% (20.6ms) | Samples: 16

**Called by:**
- `queryString` (6)
- `encodedQuery` (5)
- `textWireEntries` (3)
- `queryInput` (1)
- `requestHeaders` (1)

### `stringify`
`[native code]` | Self: 1.3% (14.6ms) | Total: 1.3% (14.6ms) | Samples: 11

**Called by:**
- `requestBody` (11)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` | Self: 1.3% (14.0ms) | Total: 1.3% (14.0ms) | Samples: 10

**Called by:**
- `async run` (8)
- `validate` (2)

### `toString`
`[native code]` | Self: 1.2% (13.7ms) | Total: 1.2% (13.7ms) | Samples: 9

**Called by:**
- `queryString` (9)

### `group`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:8` | Self: 1.1% (12.8ms) | Total: 1.4% (15.6ms) | Samples: 9

**Called by:**
- `(anonymous)` (11)

**Calls:**
- `setOwn` (2)

### `cloneObject`
`[native code]` | Self: 1.1% (12.5ms) | Total: 1.1% (12.5ms) | Samples: 8

**Called by:**
- `mergedHeaders` (5)
- `update` (2)
- `async (anonymous)` (1)

### `runChecks`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:34` | Self: 1.1% (12.4ms) | Total: 1.2% (13.4ms) | Samples: 10

**Called by:**
- `anonymous` (11)

**Calls:**
- `aborted` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:33` | Self: 1.1% (12.0ms) | Total: 7.4% (79.6ms) | Samples: 9

**Called by:**
- `validate` (61)

**Calls:**
- `(anonymous)` (51)
- `(anonymous)` (1)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:109` | Self: 0.9% (10.4ms) | Total: 15.0% (161.7ms) | Samples: 6

**Called by:**
- `async executeRoute` (117)

**Calls:**
- `(anonymous)` (70)
- `(anonymous)` (14)
- `(anonymous)` (11)
- `(anonymous)` (5)
- `(anonymous)` (4)
- `(anonymous)` (4)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `freeze` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:54` | Self: 0.9% (10.4ms) | Total: 1.8% (19.5ms) | Samples: 7

**Called by:**
- `read` (13)

**Calls:**
- `setOwn` (6)

### `mapExecutionStep`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:8` | Self: 0.9% (9.8ms) | Total: 1.0% (11.0ms) | Samples: 7

**Called by:**
- `(anonymous)` (5)
- `(anonymous)` (2)
- `(anonymous)` (1)

**Calls:**
- `(anonymous)` (1)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:108` | Self: 0.9% (9.8ms) | Total: 70.3% (757.1ms) | Samples: 8

**Called by:**
- `call` (521)
- `async run` (37)

**Calls:**
- `async executeRoute` (391)
- `async executeRoute` (117)
- `async transportAndDecode` (41)
- `async executeRoute` (1)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:38` | Self: 0.8% (9.6ms) | Total: 0.8% (9.6ms) | Samples: 6

**Called by:**
- `(anonymous)` (4)
- `async executeRuntimeRoute` (2)

### `runChecks`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` | Self: 0.8% (9.0ms) | Total: 0.8% (9.0ms) | Samples: 6

**Called by:**
- `anonymous` (6)

### `pathSegments`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:239` | Self: 0.8% (9.0ms) | Total: 0.8% (9.0ms) | Samples: 7

**Called by:**
- `decodePathname` (7)

### `has`
`[native code]` | Self: 0.8% (8.9ms) | Total: 0.8% (8.9ms) | Samples: 7

**Called by:**
- `fromFetchHeaders` (7)

### `fetchTransportResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:70` | Self: 0.8% (8.7ms) | Total: 0.8% (8.7ms) | Samples: 7

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` | Self: 0.8% (8.6ms) | Total: 0.8% (8.6ms) | Samples: 7

**Called by:**
- `read` (7)

### `defineDefaultBodyResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/index.js` | Self: 0.7% (8.4ms) | Total: 0.7% (8.4ms) | Samples: 1

**Called by:**
- `(module)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:39` | Self: 0.7% (8.2ms) | Total: 1.4% (15.4ms) | Samples: 7

**Called by:**
- `(anonymous)` (13)

**Calls:**
- `encodeURIComponent` (6)

### `requestHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:166` | Self: 0.7% (7.8ms) | Total: 5.7% (62.3ms) | Samples: 6

**Called by:**
- `wireHeaders` (46)

**Calls:**
- `fromEntries` (39)
- `entries` (1)

### `fetchTransportResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:113` | Self: 0.7% (7.8ms) | Total: 4.3% (46.7ms) | Samples: 6

**Calls:**
- `fromFetchHeaders` (22)
- `fromFetchHeaders` (8)

### `pathSegments`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:238` | Self: 0.6% (7.4ms) | Total: 0.6% (7.4ms) | Samples: 4

**Called by:**
- `decodePathname` (4)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:19` | Self: 0.6% (7.3ms) | Total: 0.6% (7.3ms) | Samples: 4

**Called by:**
- `read` (4)

### `encodeURIComponent`
`[native code]` | Self: 0.6% (7.2ms) | Total: 0.6% (7.2ms) | Samples: 6

**Called by:**
- `(anonymous)` (6)

### `mapExecutionSteps`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:16` | Self: 0.6% (6.6ms) | Total: 4.4% (47.9ms) | Samples: 5

**Called by:**
- `(anonymous)` (35)
- `(anonymous)` (1)

**Calls:**
- `validateWithValue` (20)
- `(anonymous)` (11)

### `append`
`[native code]` | Self: 0.6% (6.5ms) | Total: 0.6% (6.5ms) | Samples: 4

**Called by:**
- `queryString` (4)

### `asyncFunctionDrive`
`[native code]` | Self: 0.6% (6.5ms) | Total: 0.6% (6.5ms) | Samples: 5

**Called by:**
- `async executeRuntimeRoute` (2)
- `async transportAndDecode` (1)
- `async (anonymous)` (1)
- `async run` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:222` | Self: 0.5% (6.3ms) | Total: 2.2% (24.5ms) | Samples: 5

**Called by:**
- `async executeRuntimeRoute` (16)
- `(anonymous)` (2)
- `mapExecutionStep` (1)

**Calls:**
- `(anonymous)` (11)
- `mapExecutionStep` (2)
- `(anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js` | Self: 0.5% (6.3ms) | Total: 0.5% (6.3ms) | Samples: 5

**Called by:**
- `read` (4)
- `(anonymous)` (1)

### `freeze`
`[native code]` | Self: 0.5% (6.2ms) | Total: 0.5% (6.2ms) | Samples: 5

**Called by:**
- `read` (4)
- `async executeRoute` (1)

### `captureParameters`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:270` | Self: 0.5% (6.2ms) | Total: 1.7% (18.6ms) | Samples: 5

**Called by:**
- `selectCandidates` (15)

**Calls:**
- `setOwn` (10)

### `matchingNode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:262` | Self: 0.5% (5.7ms) | Total: 0.5% (5.7ms) | Samples: 5

**Called by:**
- `matchingNode` (4)
- `selectRoute` (1)

### `values`
`[native code]` | Self: 0.5% (5.6ms) | Total: 0.5% (5.6ms) | Samples: 5

**Called by:**
- `toFetchHeaders` (5)

### `slice`
`[native code]` | Self: 0.5% (5.4ms) | Total: 0.5% (5.4ms) | Samples: 4

**Called by:**
- `requestQuery` (4)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:34` | Self: 0.4% (5.0ms) | Total: 0.4% (5.0ms) | Samples: 3

**Called by:**
- `async executeRuntimeRoute` (3)

### `nativeRequest`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:61` | Self: 0.4% (4.9ms) | Total: 7.0% (75.9ms) | Samples: 4

**Called by:**
- `(anonymous)` (56)

**Calls:**
- `Request` (52)

### `toFetchResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:127` | Self: 0.4% (4.9ms) | Total: 0.4% (4.9ms) | Samples: 3

**Called by:**
- `writeFetchResponseStep` (3)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:389` | Self: 0.4% (4.6ms) | Total: 0.6% (6.9ms) | Samples: 3

**Calls:**
- `copyDataProperties` (2)

### `validate`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:121` | Self: 0.4% (4.5ms) | Total: 8.0% (86.3ms) | Samples: 3

**Called by:**
- `validateWithValue` (66)

**Calls:**
- `(anonymous)` (61)
- `(anonymous)` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:28` | Self: 0.4% (4.3ms) | Total: 0.4% (4.3ms) | Samples: 4

**Called by:**
- `async executeRuntimeRoute` (3)
- `(anonymous)` (1)

### `requestQuery`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:172` | Self: 0.3% (4.1ms) | Total: 0.3% (4.1ms) | Samples: 3

**Called by:**
- `async (anonymous)` (3)

### `validateWithValue`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:123` | Self: 0.3% (4.1ms) | Total: 8.5% (91.9ms) | Samples: 3

**Called by:**
- `decode` (46)
- `mapExecutionSteps` (20)
- `read` (2)
- `(anonymous)` (1)

**Calls:**
- `validate` (66)
- `validate` (1)

### `queryInput`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:212` | Self: 0.3% (4.1ms) | Total: 1.9% (20.6ms) | Samples: 3

**Called by:**
- `(anonymous)` (14)

**Calls:**
- `next` (10)
- `entries` (1)

### `nativeRequest`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:49` | Self: 0.3% (4.0ms) | Total: 4.9% (53.4ms) | Samples: 3

**Called by:**
- `(anonymous)` (37)

**Calls:**
- `queryString` (11)
- `queryString` (10)
- `queryString` (6)
- `queryString` (4)
- `appendBaseUrl` (2)
- `queryString` (1)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:31` | Self: 0.3% (3.9ms) | Total: 0.3% (3.9ms) | Samples: 3

**Called by:**
- `(anonymous)` (1)
- `async executeRuntimeRoute` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:118` | Self: 0.3% (3.9ms) | Total: 54.4% (585.3ms) | Samples: 3

**Called by:**
- `async transportAndDecode` (430)

**Calls:**
- `(anonymous)` (323)
- `(anonymous)` (105)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `fetchTransportResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:114` | Self: 0.3% (3.8ms) | Total: 0.3% (3.8ms) | Samples: 1

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:369` | Self: 0.3% (3.8ms) | Total: 0.3% (3.8ms) | Samples: 3

**Called by:**
- `async executeRuntimeRoute` (2)

### `mimeEssence`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:150` | Self: 0.3% (3.8ms) | Total: 0.3% (3.8ms) | Samples: 3

**Called by:**
- `(anonymous)` (3)

### `appendBaseUrl`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:18` | Self: 0.3% (3.8ms) | Total: 0.3% (3.8ms) | Samples: 2

**Called by:**
- `nativeRequest` (2)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:399` | Self: 0.3% (3.4ms) | Total: 2.6% (28.2ms) | Samples: 3

**Calls:**
- `(anonymous)` (16)
- `(anonymous)` (2)
- `finalize` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:30` | Self: 0.2% (2.9ms) | Total: 0.2% (2.9ms) | Samples: 2

**Called by:**
- `(anonymous)` (1)
- `async executeRuntimeRoute` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:991` | Self: 0.2% (2.8ms) | Total: 6.8% (74.2ms) | Samples: 2

**Called by:**
- `(anonymous)` (51)
- `(anonymous)` (5)

**Calls:**
- `anonymous` (50)
- `(anonymous)` (4)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:211` | Self: 0.2% (2.7ms) | Total: 0.5% (6.0ms) | Samples: 2

**Called by:**
- `async (anonymous)` (5)

**Calls:**
- `copyDataProperties` (3)

### `call`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:190` | Self: 0.2% (2.7ms) | Total: 0.2% (2.7ms) | Samples: 2

**Called by:**
- `async run` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:86` | Self: 0.2% (2.6ms) | Total: 0.5% (6.4ms) | Samples: 2

**Called by:**
- `async executeRoute` (5)

**Calls:**
- `copyDataProperties` (3)

### `requestQuery`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:175` | Self: 0.2% (2.6ms) | Total: 2.7% (29.4ms) | Samples: 2

**Called by:**
- `async (anonymous)` (22)

**Calls:**
- `URLSearchParams` (16)
- `slice` (4)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:29` | Self: 0.2% (2.6ms) | Total: 0.2% (2.6ms) | Samples: 2

**Called by:**
- `async executeRuntimeRoute` (2)

### `queryInput`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:214` | Self: 0.2% (2.6ms) | Total: 0.2% (2.6ms) | Samples: 2

**Called by:**
- `(anonymous)` (2)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:205` | Self: 0.2% (2.5ms) | Total: 0.2% (2.5ms) | Samples: 2

### `finish`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:120` | Self: 0.2% (2.5ms) | Total: 0.2% (2.5ms) | Samples: 2

### `throwIfAborted`
`[native code]` | Self: 0.2% (2.5ms) | Total: 0.2% (2.5ms) | Samples: 2

**Called by:**
- `async executeRuntimeRoute` (2)

### `decode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:116` | Self: 0.2% (2.5ms) | Total: 0.2% (2.5ms) | Samples: 2

**Called by:**
- `async (anonymous)` (2)

### `async run`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:159` | Self: 0.2% (2.4ms) | Total: 71.3% (767.1ms) | Samples: 1

**Called by:**
- `async run` (564)

**Calls:**
- `call` (523)
- `async executeRoute` (37)
- `call` (2)
- `call` (2)

### `call`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:192` | Self: 0.2% (2.4ms) | Total: 66.0% (710.8ms) | Samples: 2

**Called by:**
- `async run` (523)

**Calls:**
- `async executeRoute` (521)

### `read`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js` | Self: 0.2% (2.3ms) | Total: 0.2% (2.3ms) | Samples: 2

**Called by:**
- `(anonymous)` (1)
- `async executeRuntimeRoute` (1)

### `call`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` | Self: 0.2% (2.3ms) | Total: 0.2% (2.3ms) | Samples: 2

**Called by:**
- `async run` (2)

### `pathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:163` | Self: 0.2% (2.2ms) | Total: 0.2% (2.2ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:97` | Self: 0.2% (2.2ms) | Total: 0.2% (2.2ms) | Samples: 2

**Called by:**
- `decode` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:17` | Self: 0.2% (2.2ms) | Total: 0.4% (4.6ms) | Samples: 2

**Called by:**
- `(anonymous)` (3)
- `read` (1)

**Calls:**
- `mapExecutionSteps` (1)
- `mapExecutionSteps` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:206` | Self: 0.2% (2.1ms) | Total: 3.3% (35.8ms) | Samples: 2

**Called by:**
- `async (anonymous)` (27)

**Calls:**
- `requestQuery` (22)
- `requestQuery` (3)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:204` | Self: 0.1% (2.0ms) | Total: 40.2% (433.4ms) | Samples: 2

**Called by:**
- `(anonymous)` (323)

**Calls:**
- `async (anonymous)` (245)
- `async (anonymous)` (27)
- `async (anonymous)` (22)
- `async (anonymous)` (17)
- `async (anonymous)` (5)
- `async (anonymous)` (2)
- `asyncFunctionDrive` (1)
- `async (anonymous)` (1)
- `async (anonymous)` (1)

### `decode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js` | Self: 0.1% (1.5ms) | Total: 0.1% (1.5ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `validate`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:122` | Self: 0.1% (1.5ms) | Total: 0.1% (1.5ms) | Samples: 1

**Called by:**
- `validateWithValue` (1)

### `async handler`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:435` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `mergedHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:36` | Self: 0.1% (1.4ms) | Total: 0.8% (8.9ms) | Samples: 1

**Called by:**
- `(anonymous)` (6)

**Calls:**
- `cloneObject` (5)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `finalize`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:203` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `async executeRuntimeRoute` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:739` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `init` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:114` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

**Called by:**
- `anonymous` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:126` | Self: 0.1% (1.4ms) | Total: 0.1% (1.4ms) | Samples: 1

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:49` | Self: 0.1% (1.4ms) | Total: 6.0% (65.0ms) | Samples: 1

**Called by:**
- `(anonymous)` (33)
- `mapExecutionSteps` (11)
- `read` (4)

**Calls:**
- `mapExecutionSteps` (35)
- `group` (11)
- `mapExecutionStep` (1)

### `toFetchHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:50` | Self: 0.1% (1.4ms) | Total: 0.6% (7.0ms) | Samples: 1

**Called by:**
- `toFetchResponse` (6)

**Calls:**
- `values` (5)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:89` | Self: 0.1% (1.3ms) | Total: 0.6% (6.6ms) | Samples: 1

**Called by:**
- `async executeRoute` (4)

**Calls:**
- `copyDataProperties` (3)

### `writeFetchResponseStep`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:148` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:29` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `nativeRequest` (1)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:116` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `async executeRoute` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:383` | Self: 0.1% (1.3ms) | Total: 0.3% (3.8ms) | Samples: 1

**Calls:**
- `throwIfAborted` (2)

### `writeFetchResponseStep`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:163` | Self: 0.1% (1.3ms) | Total: 6.1% (66.4ms) | Samples: 1

**Called by:**
- `async (anonymous)` (45)

**Calls:**
- `json` (39)
- `toFetchResponse` (6)
- `toFetchResponse` (3)

### `mimeEssence`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:149` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `readBody`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `pathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:161` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js:6` | Self: 0.1% (1.3ms) | Total: 0.8% (9.2ms) | Samples: 1

**Called by:**
- `async run` (6)

**Calls:**
- `(anonymous)` (5)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:22` | Self: 0.1% (1.3ms) | Total: 1.4% (15.2ms) | Samples: 1

**Called by:**
- `nativeRequest` (11)

**Calls:**
- `URLSearchParams` (10)

### `pathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:158` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:28` | Self: 0.1% (1.3ms) | Total: 1.3% (15.0ms) | Samples: 1

**Called by:**
- `nativeRequest` (10)

**Calls:**
- `toString` (9)

### `async transportAndDecode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:117` | Self: 0.1% (1.3ms) | Total: 54.2% (584.1ms) | Samples: 1

**Called by:**
- `async executeRoute` (391)
- `async executeRoute` (41)

**Calls:**
- `async (anonymous)` (430)
- `asyncFunctionDrive` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:53` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `read` (1)

### `nativeRequest`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` | Self: 0.1% (1.3ms) | Total: 0.1% (1.3ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `async run`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `async run` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:21` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `read` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:976` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `readFetchBody`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `selectRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:306` | Self: 0.1% (1.2ms) | Total: 1.6% (17.8ms) | Samples: 1

**Called by:**
- `async handler` (12)

**Calls:**
- `decodePathname` (11)

### `encodedQuery`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:188` | Self: 0.1% (1.2ms) | Total: 0.7% (7.8ms) | Samples: 1

**Called by:**
- `read` (6)

**Calls:**
- `entries` (5)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `queryInput`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:213` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `decode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:126` | Self: 0.1% (1.2ms) | Total: 3.4% (36.5ms) | Samples: 1

**Called by:**
- `async (anonymous)` (25)

**Calls:**
- `(anonymous)` (17)
- `(anonymous)` (5)
- `(anonymous)` (2)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:76` | Self: 0.1% (1.2ms) | Total: 9.0% (97.1ms) | Samples: 1

**Called by:**
- `async executeRoute` (70)

**Calls:**
- `read` (60)
- `read` (4)
- `read` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)
- `read` (1)
- `(anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `anonymous` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:372` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `async executeRuntimeRoute` (1)

### `mapExecutionSteps`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:15` | Self: 0.1% (1.2ms) | Total: 0.1% (1.2ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:226` | Self: 0.1% (1.1ms) | Total: 4.0% (43.6ms) | Samples: 1

**Called by:**
- `(anonymous)` (31)

**Calls:**
- `queryInput` (14)
- `decode` (7)
- `queryInput` (5)
- `queryInput` (2)
- `fromEntries` (1)
- `queryInput` (1)

### `validateHandlerTree`
`/Users/samuel/Coding/hulla/api/packages/core/dist/server/index.js` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `bindServerNode` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:209` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `init` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:150` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `matchingNode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:263` | Self: 0.1% (1.1ms) | Total: 0.8% (8.9ms) | Samples: 1

**Called by:**
- `selectRoute` (5)
- `matchingNode` (3)

**Calls:**
- `matchingNode` (4)
- `matchingNode` (3)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:82` | Self: 0.1% (1.1ms) | Total: 0.1% (1.1ms) | Samples: 1

**Called by:**
- `async executeRoute` (1)

### `runChecks`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:38` | Self: 0.1% (1.0ms) | Total: 0.1% (1.0ms) | Samples: 1

**Called by:**
- `anonymous` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:215` | Self: 0.1% (1.0ms) | Total: 0.1% (1.0ms) | Samples: 1

**Called by:**
- `async (anonymous)` (1)

### `fromFetchHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:58` | Self: 0.1% (1.0ms) | Total: 0.9% (10.0ms) | Samples: 1

**Called by:**
- `fetchTransportResponse` (8)

**Calls:**
- `has` (7)

### `update`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:81` | Self: 0.1% (1.0ms) | Total: 1.4% (15.0ms) | Samples: 1

**Called by:**
- `async executeRuntimeRoute` (11)

**Calls:**
- `copyDataProperties` (8)
- `cloneObject` (2)

### `async run`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:165` | Self: 0.0% (1.0ms) | Total: 2.0% (22.1ms) | Samples: 1

**Calls:**
- `(anonymous)` (8)
- `(anonymous)` (6)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:38` | Self: 0.0% (1.0ms) | Total: 0.0% (1.0ms) | Samples: 1

**Called by:**
- `(anonymous)` (1)

### `aborted`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/util.js:525` | Self: 0.0% (1.0ms) | Total: 0.0% (1.0ms) | Samples: 1

**Called by:**
- `runChecks` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:368` | Self: 0.0% (1.0ms) | Total: 26.3% (283.4ms) | Samples: 1

**Called by:**
- `async handler` (210)

**Calls:**
- `async executeRuntimeRoute` (204)
- `async executeRuntimeRoute` (2)
- `asyncFunctionDrive` (2)
- `async executeRuntimeRoute` (1)

### `queryInput`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:218` | Self: 0.0% (0us) | Total: 0.5% (5.9ms) | Samples: 0

**Called by:**
- `(anonymous)` (5)

**Calls:**
- `fromEntries` (5)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:99` | Self: 0.0% (0us) | Total: 2.3% (25.7ms) | Samples: 0

**Called by:**
- `decode` (17)

**Calls:**
- `json` (16)
- `readBody` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:120` | Self: 0.0% (0us) | Total: 3.7% (40.6ms) | Samples: 0

**Calls:**
- `decode` (25)
- `decode` (2)
- `decode` (1)

### `toFetchResponse`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:136` | Self: 0.0% (0us) | Total: 0.6% (7.0ms) | Samples: 0

**Called by:**
- `writeFetchResponseStep` (6)

**Calls:**
- `toFetchHeaders` (6)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:227` | Self: 0.0% (0us) | Total: 5.8% (62.4ms) | Samples: 0

**Calls:**
- `writeFetchResponseStep` (45)
- `writeFetchResponseStep` (1)

### `decodePathname`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:242` | Self: 0.0% (0us) | Total: 1.5% (16.5ms) | Samples: 0

**Called by:**
- `selectRoute` (11)

**Calls:**
- `pathSegments` (7)
- `pathSegments` (4)

### `async run`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:158` | Self: 0.0% (0us) | Total: 71.3% (767.3ms) | Samples: 0

**Called by:**
- `(module)` (566)

**Calls:**
- `async run` (564)
- `async run` (1)
- `asyncFunctionDrive` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:259` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Called by:**
- `init` (1)

**Calls:**
- `init` (1)

### `(module)`
`/Users/samuel/Coding/hulla/api/benchmarks/fixtures/scenario.ts:404` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Calls:**
- `_string` (1)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:26` | Self: 0.0% (0us) | Total: 0.6% (6.5ms) | Samples: 0

**Called by:**
- `nativeRequest` (4)

**Calls:**
- `append` (4)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:131` | Self: 0.0% (0us) | Total: 4.1% (44.8ms) | Samples: 0

**Called by:**
- `read` (33)

**Calls:**
- `(anonymous)` (33)

### `(module)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/index.js:319` | Self: 0.0% (0us) | Total: 0.7% (8.4ms) | Samples: 0

**Calls:**
- `defineDefaultBodyResponse` (1)

### `implement`
`/Users/samuel/Coding/hulla/api/packages/core/dist/server/index.js:177` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `bindServerNode` (1)

### `decode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js:138` | Self: 0.0% (0us) | Total: 5.6% (60.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (20)
- `(anonymous)` (10)
- `(anonymous)` (7)

**Calls:**
- `validateWithValue` (46)

### `selectRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:308` | Self: 0.0% (0us) | Total: 1.4% (16.1ms) | Samples: 0

**Called by:**
- `async handler` (13)

**Calls:**
- `selectCandidates` (13)

### `requestBody`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:36` | Self: 0.0% (0us) | Total: 1.3% (14.6ms) | Samples: 0

**Called by:**
- `nativeRequest` (11)

**Calls:**
- `stringify` (11)

### `(module)`
`/Users/samuel/Coding/hulla/api/benchmarks/fixtures/scenario.ts:433` | Self: 0.0% (0us) | Total: 0.1% (1.4ms) | Samples: 0

**Calls:**
- `object` (1)

### `async handler`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:443` | Self: 0.0% (0us) | Total: 26.3% (283.4ms) | Samples: 0

**Called by:**
- `async (anonymous)` (210)

**Calls:**
- `async executeRuntimeRoute` (210)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:230` | Self: 0.0% (0us) | Total: 0.2% (2.5ms) | Samples: 0

**Called by:**
- `async executeRuntimeRoute` (2)

**Calls:**
- `(anonymous)` (2)

### `node:util`
`node:util:2` | Self: 0.0% (0us) | Total: 1.6% (17.4ms) | Samples: 0

**Calls:**
- `anonymous` (2)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:223` | Self: 0.0% (0us) | Total: 30.6% (329.6ms) | Samples: 0

**Called by:**
- `async (anonymous)` (245)

**Calls:**
- `async handler` (210)
- `async handler` (33)
- `cloneObject` (1)
- `async handler` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:132` | Self: 0.0% (0us) | Total: 4.0% (43.6ms) | Samples: 0

**Called by:**
- `read` (31)

**Calls:**
- `(anonymous)` (31)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:373` | Self: 0.0% (0us) | Total: 25.6% (276.1ms) | Samples: 0

**Called by:**
- `async executeRuntimeRoute` (204)

**Calls:**
- `read` (191)
- `read` (3)
- `(anonymous)` (3)
- `read` (2)
- `(anonymous)` (2)
- `read` (1)
- `read` (1)
- `(anonymous)` (1)

### `selectRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:307` | Self: 0.0% (0us) | Total: 0.6% (6.8ms) | Samples: 0

**Called by:**
- `async handler` (6)

**Calls:**
- `matchingNode` (5)
- `matchingNode` (1)

### `nativeRequest`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:48` | Self: 0.0% (0us) | Total: 1.3% (14.6ms) | Samples: 0

**Called by:**
- `(anonymous)` (11)

**Calls:**
- `requestBody` (11)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js:26` | Self: 0.0% (0us) | Total: 0.5% (5.5ms) | Samples: 0

**Called by:**
- `read` (4)

**Calls:**
- `setOwn` (4)

### `queryString`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:23` | Self: 0.0% (0us) | Total: 0.6% (7.3ms) | Samples: 0

**Called by:**
- `nativeRequest` (6)

**Calls:**
- `entries` (6)

### `textWireEntries`
`/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js:118` | Self: 0.0% (0us) | Total: 0.3% (3.8ms) | Samples: 0

**Called by:**
- `read` (3)

**Calls:**
- `entries` (3)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:90` | Self: 0.0% (0us) | Total: 0.4% (5.3ms) | Samples: 0

**Called by:**
- `async executeRoute` (4)

**Calls:**
- `copyDataProperties` (4)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js:966` | Self: 0.0% (0us) | Total: 0.5% (6.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `anonymous` (4)

### `internal:util/inspect`
`internal:util/inspect:2` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Called by:**
- `anonymous` (1)

**Calls:**
- `anonymous` (1)

### `mergedHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:41` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Called by:**
- `(anonymous)` (1)

**Calls:**
- `setOwn` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:85` | Self: 0.0% (0us) | Total: 1.5% (16.4ms) | Samples: 0

**Called by:**
- `async executeRoute` (14)

**Calls:**
- `(anonymous)` (13)
- `(anonymous)` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:87` | Self: 0.0% (0us) | Total: 1.4% (15.8ms) | Samples: 0

**Called by:**
- `async executeRoute` (11)

**Calls:**
- `mergedHeaders` (6)
- `mergedHeaders` (4)
- `mergedHeaders` (1)

### `async handler`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:438` | Self: 0.0% (0us) | Total: 4.0% (43.3ms) | Samples: 0

**Called by:**
- `async (anonymous)` (33)

**Calls:**
- `selectRoute` (13)
- `selectRoute` (12)
- `selectRoute` (6)
- `selectCandidates` (2)

### `wireHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:92` | Self: 0.0% (0us) | Total: 5.7% (62.3ms) | Samples: 0

**Called by:**
- `(anonymous)` (46)

**Calls:**
- `requestHeaders` (46)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:133` | Self: 0.0% (0us) | Total: 8.1% (87.8ms) | Samples: 0

**Called by:**
- `read` (66)

**Calls:**
- `wireHeaders` (46)
- `decode` (20)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:393` | Self: 0.0% (0us) | Total: 0.5% (6.0ms) | Samples: 0

**Calls:**
- `copyDataProperties` (5)

### `async executeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:129` | Self: 0.0% (0us) | Total: 49.3% (530.5ms) | Samples: 0

**Called by:**
- `async executeRoute` (391)

**Calls:**
- `async transportAndDecode` (391)

### `readFetchBody`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:68` | Self: 0.0% (0us) | Total: 2.5% (27.9ms) | Samples: 0

**Called by:**
- `readBody` (20)
- `(anonymous)` (1)

**Calls:**
- `json` (21)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:216` | Self: 0.0% (0us) | Total: 0.2% (2.2ms) | Samples: 0

**Called by:**
- `async (anonymous)` (2)

**Calls:**
- `copyDataProperties` (2)

### `_string`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/api.js:7` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodString` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:147` | Self: 0.0% (0us) | Total: 13.5% (145.3ms) | Samples: 0

**Called by:**
- `async (anonymous)` (105)

**Calls:**
- `nativeRequest` (56)
- `nativeRequest` (37)
- `nativeRequest` (11)
- `nativeRequest` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:70` | Self: 0.0% (0us) | Total: 0.3% (3.5ms) | Samples: 0

**Called by:**
- `read` (3)

**Calls:**
- `(anonymous)` (3)

### `fromFetchHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js:57` | Self: 0.0% (0us) | Total: 2.6% (28.8ms) | Samples: 0

**Called by:**
- `fetchTransportResponse` (22)

**Calls:**
- `fromEntries` (22)

### `init`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:22` | Self: 0.0% (0us) | Total: 0.3% (3.7ms) | Samples: 0

**Called by:**
- `ZodString` (1)
- `(anonymous)` (1)
- `ZodObject` (1)

**Calls:**
- `(anonymous)` (1)
- `(anonymous)` (1)
- `(anonymous)` (1)

### `ZodObject`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:41` | Self: 0.0% (0us) | Total: 0.1% (1.4ms) | Samples: 0

**Called by:**
- `object` (1)

**Calls:**
- `init` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:218` | Self: 0.0% (0us) | Total: 2.8% (31.1ms) | Samples: 0

**Called by:**
- `async (anonymous)` (22)

**Calls:**
- `pathname` (19)
- `pathname` (1)
- `pathname` (1)
- `pathname` (1)

### `async (anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:212` | Self: 0.0% (0us) | Total: 0.0% (1.0ms) | Samples: 0

**Called by:**
- `async (anonymous)` (1)

**Calls:**
- `copyDataProperties` (1)

### `async executeRuntimeRoute`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:396` | Self: 0.0% (0us) | Total: 1.4% (15.0ms) | Samples: 0

**Calls:**
- `update` (11)

### `ZodString`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js:41` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Called by:**
- `_string` (1)

**Calls:**
- `init` (1)

### `readBody`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:221` | Self: 0.0% (0us) | Total: 2.4% (26.4ms) | Samples: 0

**Called by:**
- `(anonymous)` (20)

**Calls:**
- `readFetchBody` (20)

### `(module)`
`/private/tmp/native-profile.ts:2` | Self: 0.0% (0us) | Total: 71.3% (767.3ms) | Samples: 0

**Calls:**
- `async run` (566)

### `selectCandidates`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:298` | Self: 0.0% (0us) | Total: 1.7% (18.6ms) | Samples: 0

**Called by:**
- `selectRoute` (13)
- `async handler` (2)

**Calls:**
- `captureParameters` (15)

### `object`
`/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js:791` | Self: 0.0% (0us) | Total: 0.1% (1.4ms) | Samples: 0

**Called by:**
- `(module)` (1)

**Calls:**
- `ZodObject` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js:149` | Self: 0.0% (0us) | Total: 40.2% (433.4ms) | Samples: 0

**Called by:**
- `async (anonymous)` (323)

**Calls:**
- `async (anonymous)` (323)

### `(module)`
`/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts:66` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Calls:**
- `implement` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:88` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Called by:**
- `async executeRoute` (1)

**Calls:**
- `copyDataProperties` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:109` | Self: 0.0% (0us) | Total: 0.4% (5.2ms) | Samples: 0

**Called by:**
- `read` (4)

**Calls:**
- `mimeEssence` (3)
- `mimeEssence` (1)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:115` | Self: 0.0% (0us) | Total: 2.7% (29.2ms) | Samples: 0

**Called by:**
- `read` (22)

**Calls:**
- `readBody` (20)
- `readFetchBody` (1)
- `readFetchBody` (1)

### `bindServerNode`
`/Users/samuel/Coding/hulla/api/packages/core/dist/server/index.js:95` | Self: 0.0% (0us) | Total: 0.1% (1.1ms) | Samples: 0

**Called by:**
- `implement` (1)

**Calls:**
- `validateHandlerTree` (1)

### `mergedHeaders`
`/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js:43` | Self: 0.0% (0us) | Total: 0.5% (5.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (4)

**Calls:**
- `setOwn` (4)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js:100` | Self: 0.0% (0us) | Total: 0.6% (7.3ms) | Samples: 0

**Called by:**
- `decode` (5)

**Calls:**
- `mapExecutionStep` (5)

### `(anonymous)`
`/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js:160` | Self: 0.0% (0us) | Total: 1.3% (14.7ms) | Samples: 0

**Called by:**
- `(anonymous)` (11)

**Calls:**
- `decode` (10)
- `validateWithValue` (1)

## Files

| Self% | Self | File |
|------:|-----:|------|
| 49.3% | 530.9ms | `[native code]` |
| 11.3% | 122.0ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js` |
| 7.7% | 83.9ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/validation-yQotGinf.js` |
| 6.3% | 68.6ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/headers-BGkquIeR.js` |
| 5.7% | 62.1ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/runtime-CfxMKH7y.js` |
| 4.7% | 50.8ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js` |
| 3.4% | 36.7ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/object-CyBJiaRR.js` |
| 3.2% | 35.4ms | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js` |
| 2.5% | 27.3ms | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js` |
| 1.4% | 15.6ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/query-BTChN3Ce.js` |
| 1.0% | 11.5ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/response-Bq8e2oTD.js` |
| 1.0% | 11.4ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/web-AyYIyR3H.js` |
| 0.7% | 8.4ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/index.js` |
| 0.5% | 5.9ms | `/Users/samuel/Coding/hulla/api/benchmarks/hulla-api.ts` |
| 0.2% | 2.5ms | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js` |
| 0.1% | 1.1ms | `/Users/samuel/Coding/hulla/api/packages/core/dist/server/index.js` |
| 0.0% | 1.0ms | `/Users/samuel/Coding/hulla/api/node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/util.js` |
