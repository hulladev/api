# Fetch round-trip benchmark

This benchmark measures one complete, in-memory JSON request through each library's typed client and Fetch server adapter. The scenario is a `POST /users` operation with a small object body and response.

Each measured path performs four equivalent Zod validations: client request, server request, server response, and client response. It also includes request serialization, route dispatch, response serialization, and client decoding. Network and socket costs are deliberately excluded. `Direct Fetch` is the lower-level baseline rather than a competing contract library.

The latest stable ts-rest release declares Zod 3 as a peer dependency, while this package uses Zod 4. Its benchmark therefore uses a plain ts-rest typed contract with explicit Zod 4 validation at the same four boundaries. The measured runtime path remains ts-rest's client and Fetch handler.

The benchmark is a separate private workspace and consumes the built `@hulla/api` package through its public exports. No benchmark code or competitor dependency is part of the core package.

Run the default benchmark from the repository root with:

```sh
bun run bench
```

The defaults are seven samples, 5,000 measured iterations per sample, and 1,000 warmup iterations. Override them with `BENCH_SAMPLES`, `BENCH_ITERATIONS`, and `BENCH_WARMUP`. Benchmark order rotates between samples to reduce ordering bias. Package versions are printed in the result table and locked by `bun.lock`.
