// Test instrumentation: the single fixture server counts HTTP API dispatches.
const state = globalThis as typeof globalThis & { hullaFixtureApiCalls?: number }
export function recordApiCall() {
  state.hullaFixtureApiCalls = apiCalls() + 1
}
export function apiCalls() {
  return state.hullaFixtureApiCalls ?? 0
}
