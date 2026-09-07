import type { ResponseHeaderValues } from '@hulla/api'
import { isRecord } from './object'

export const MESSAGE_PORT_PROTOCOL_VERSION = 1 as const
export const DEFAULT_MESSAGE_PORT_CHANNEL = '@hulla/api' as const

export type MessagePortFormDataFile = {
  readonly kind: 'file'
  readonly bytes: Uint8Array
  readonly name: string
  readonly type: string
  readonly lastModified: number
}

export type MessagePortFormDataEntry = readonly [name: string, value: string | MessagePortFormDataFile]

export type MessagePortBody =
  | { readonly kind: 'bytes' | 'json' | 'raw' | 'text'; readonly value: unknown }
  | { readonly kind: 'empty' }
  | { readonly kind: 'form-data'; readonly value: readonly MessagePortFormDataEntry[] }
  | { readonly kind: 'stream' }

export type MessagePortRequestBody =
  | { readonly kind: 'bytes' | 'json' | 'text'; readonly value: unknown; readonly contentType: string }
  | {
      readonly kind: 'form-data'
      readonly value: readonly MessagePortFormDataEntry[]
      readonly contentType: string
    }

export type MessagePortRequest = {
  readonly key: readonly string[]
  readonly method: string
  readonly path: string
  readonly query?: Readonly<Record<string, string | readonly string[] | undefined>>
  readonly headers: Readonly<Record<string, string>>
  readonly body?: MessagePortRequestBody
}

type MessagePortEnvelope = {
  readonly channel: string
  readonly protocol: typeof MESSAGE_PORT_PROTOCOL_VERSION
  readonly id: string
}

export type MessagePortRequestMessage = MessagePortEnvelope & {
  readonly type: 'request'
  readonly request: MessagePortRequest
}

export type MessagePortResponseMessage = MessagePortEnvelope & {
  readonly type: 'response'
  readonly response: {
    readonly status: number
    readonly headers: ResponseHeaderValues
    readonly body: MessagePortBody
  }
}

export type MessagePortCancelMessage = MessagePortEnvelope & {
  readonly type: 'cancel'
}

export type MessagePortStreamPullMessage = MessagePortEnvelope & {
  readonly type: 'stream-pull'
}

export type MessagePortStreamChunkMessage = MessagePortEnvelope & {
  readonly type: 'stream-chunk'
  readonly chunk: Uint8Array
}

export type MessagePortStreamEndMessage = MessagePortEnvelope & {
  readonly type: 'stream-end'
}

export type MessagePortErrorMessage = MessagePortEnvelope & {
  readonly type: 'error' | 'stream-error'
  readonly error: {
    readonly message: string
    readonly name?: string
  }
}

export type MessagePortCloseMessage = Omit<MessagePortEnvelope, 'id'> & {
  readonly type: 'close'
}

export type MessagePortMessage =
  | MessagePortRequestMessage
  | MessagePortResponseMessage
  | MessagePortCancelMessage
  | MessagePortStreamPullMessage
  | MessagePortStreamChunkMessage
  | MessagePortStreamEndMessage
  | MessagePortErrorMessage
  | MessagePortCloseMessage

export function isMessagePortEnvelope(
  value: unknown,
  channel: string
): value is MessagePortMessage & Readonly<Record<string, unknown>> {
  return (
    isRecord(value) &&
    value['channel'] === channel &&
    value['protocol'] === MESSAGE_PORT_PROTOCOL_VERSION &&
    typeof value['type'] === 'string'
  )
}

export function messagePortError(error: unknown): MessagePortErrorMessage['error'] {
  return error instanceof Error
    ? { message: error.message, ...(error.name === 'Error' ? {} : { name: error.name }) }
    : { message: String(error) }
}
