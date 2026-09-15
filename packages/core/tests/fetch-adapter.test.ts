import { describe, expect, test, vi } from 'vitest'
import { defineContract } from '../src/contract'
import { response } from '../src/contract/response'
import { route } from '../src/contract/route'
import { fetchAdapter, type FetchAdapterErrorInput } from '../src/fetch'
import { defineServer } from '../src/server'

describe('fetchAdapter', () => {
  test('inherits, overrides, and disables adapter-level error handling', async () => {
    const contract = defineContract({
      routes: { fail: route.get('/fail', { responses: { 200: response.text() } }) },
    })
    const implementation = defineServer(contract).implement({
      fail: (): { readonly body: string; readonly status: 200 } => {
        throw new Error('failure')
      },
    })
    const inherited = vi.fn<(input: FetchAdapterErrorInput) => Response>(
      ({ defaultResponse }) => new Response('inherited', { status: defaultResponse.status })
    )
    const overridden = vi.fn<(input: FetchAdapterErrorInput) => Response>(
      ({ defaultResponse }) => new Response('overridden', { status: defaultResponse.status })
    )
    const adapter = fetchAdapter({ onError: inherited })
    const request = () => new Request('https://example.com/fail')

    const inheritedResponse = await adapter.mount(implementation)(request())
    expect(await inheritedResponse.text()).toBe('inherited')

    const overriddenResponse = await adapter.mount(implementation, { onError: overridden })(request())
    expect(await overriddenResponse.text()).toBe('overridden')

    const defaultResponse = await adapter.mount(implementation, { onError: undefined })(request())
    expect(defaultResponse.status).toBe(500)
    expect(inherited).toHaveBeenCalledOnce()
    expect(overridden).toHaveBeenCalledOnce()
  })
})
