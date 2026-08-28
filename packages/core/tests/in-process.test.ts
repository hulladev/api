import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { defineClient } from '../src/client'
import { defineContract } from '../src/contract'
import { response } from '../src/contract/response'
import { route } from '../src/contract/route'
import { router } from '../src/contract/router'
import { fetchAdapter } from '../src/fetch'
import { inProcessAdapter, inProcessTransport } from '../src/in-process'
import { defineServer } from '../src/server'

describe('inProcessTransport', () => {
  test('connects one client and server without Fetch objects', async () => {
    const contract = defineContract({
      routes: {
        organizations: router('/organizations/:organizationId', {
          params: z.object({ organizationId: z.string() }),
          routes: {
            members: router('/members', {
              routes: {
                create: route.post('/:memberId', {
                  params: z.object({ memberId: z.string() }),
                  body: z.object({ name: z.string() }),
                  responses: { 201: response.json(z.object({ id: z.string(), name: z.string() })) },
                }),
              },
            }),
          },
        }),
      },
    })
    const implementation = defineServer(contract).implement({
      organizations: {
        members: {
          create: ({ body, params }) => ({
            status: 201,
            body: { id: `${params.organizationId}:${params.memberId}`, name: body.name },
          }),
        },
      },
    })
    const client = defineClient(contract, { transport: inProcessTransport(implementation) }).create()

    await expect(
      client.organizations.members.create({
        params: { organizationId: 'org-1', memberId: 'member-1' },
        body: { name: 'Samuel' },
      })
    ).resolves.toEqual({
      status: 201,
      headers: { 'content-type': 'application/json' },
      body: { id: 'org-1:member-1', name: 'Samuel' },
    })
  })

  test('rejects a context factory bound to another server adapter', () => {
    const contract = defineContract({
      routes: {
        health: route.get('/health', { responses: { 200: response.text() } }),
      },
    })
    const fetch = fetchAdapter()
    const implementation = defineServer(contract, {
      context: fetch.context(({ request }) => ({ method: request.method })),
    }).implement({
      health: ({ context }) => ({ status: 200, body: context.method }),
    })

    const invalidMount = () => {
      // @ts-expect-error A Fetch-bound implementation cannot be mounted in process.
      inProcessAdapter().mount(implementation)
    }
    expect(invalidMount).toBeTypeOf('function')

    expect(() => inProcessAdapter().mount(implementation as never)).toThrow(
      'Server requires the fetch adapter, but was mounted with in-process'
    )
  })
})
