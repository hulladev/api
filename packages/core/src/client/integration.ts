export type ClientRouteIntegration = {
  readonly hasInput: boolean
}

const clientRoutes = new WeakMap<Function, ClientRouteIntegration>()

/** Returns the minimal route metadata needed by explicit client integrations. */
export function clientRouteIntegration(call: Function): ClientRouteIntegration | undefined {
  return clientRoutes.get(call)
}

/** @internal */
export function registerClientRoute(call: Function, integration: ClientRouteIntegration): void {
  clientRoutes.set(call, integration)
}
