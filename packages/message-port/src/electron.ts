/** Electron MessagePortMain and transferred renderer ports already implement this boundary. */
export { messagePortEndpoint as electronEndpoint } from './endpoint'
export type { MessagePortLike as ElectronPort } from './endpoint'
