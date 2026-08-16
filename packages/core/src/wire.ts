/** Advanced server-adapter boundary over the normalized HTTP representation. */
export { createWireHandler } from './server/runtime'
export type {
  WireServerBody,
  WireServerErrorInput,
  WireServerHandler,
  WireServerInput,
  WireServerOptions,
  WireServerPhase,
  WireServerResponse,
  WireServerResponseBody,
} from './server/runtime'
