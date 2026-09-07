import type { AdapterResponseBody } from '@hulla/api/adapters'
import type { ClientTransportBody } from '@hulla/api/client'
import type {
  MessagePortBody,
  MessagePortFormDataEntry,
  MessagePortFormDataFile,
  MessagePortRequestBody,
} from './protocol'

function isFile(value: FormDataEntryValue): value is File {
  return typeof File !== 'undefined' && value instanceof File
}

async function encodeFormData(value: unknown): Promise<readonly MessagePortFormDataEntry[]> {
  if (!(value instanceof FormData)) throw new TypeError('Message-port form data must be FormData')

  return Promise.all(
    [...value.entries()].map(async ([name, entry]): Promise<MessagePortFormDataEntry> => {
      if (typeof entry === 'string') return [name, entry]
      const file: MessagePortFormDataFile = {
        kind: 'file',
        bytes: new Uint8Array(await entry.arrayBuffer()),
        name: isFile(entry) ? entry.name : 'blob',
        type: entry.type,
        lastModified: isFile(entry) ? entry.lastModified : 0,
      }
      return [name, file]
    })
  )
}

export function decodeMessagePortFormData(entries: readonly MessagePortFormDataEntry[]): FormData {
  const formData = new FormData()
  for (const [name, value] of entries) {
    if (typeof value === 'string') {
      formData.append(name, value)
      continue
    }

    const bytes = value.bytes.slice().buffer as ArrayBuffer
    const file =
      typeof File === 'undefined'
        ? new Blob([bytes], { type: value.type })
        : new File([bytes], value.name, { type: value.type, lastModified: value.lastModified })
    formData.append(name, file, value.name)
  }
  return formData
}

export async function encodeRequestBody(body: ClientTransportBody): Promise<MessagePortRequestBody> {
  if (body.kind === 'form-data') {
    return { kind: 'form-data', contentType: body.contentType, value: await encodeFormData(body.value) }
  }
  return { kind: body.kind, contentType: body.contentType, value: body.value }
}

export async function encodeResponseBody(body: AdapterResponseBody): Promise<MessagePortBody> {
  switch (body.kind) {
    case 'empty':
      return { kind: 'empty' }
    case 'stream':
      return { kind: 'stream' }
    case 'form-data':
      return { kind: 'form-data', value: await encodeFormData(body.value) }
    case 'bytes':
    case 'json':
    case 'raw':
    case 'text':
      return { kind: body.kind, value: body.value }
  }
}
