import type { OpenAPIDocument } from '../../src'

export const openAPIFixture = {
  openapi: '3.1.0',
  components: {
    schemas: {
      UserStatus: {
        type: 'string',
        enum: ['active', 'disabled'],
      },
      User: {
        type: 'object',
        required: ['id', 'name', 'status', 'roles'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: ['string', 'null'], format: 'email' },
          status: { $ref: '#/components/schemas/UserStatus' },
          roles: {
            type: 'array',
            items: { type: 'string' },
          },
          metadata: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      },
      CreateUser: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: {
            type: 'string',
            enum: ['admin', 'member'],
          },
        },
      },
      UpdateUser: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { $ref: '#/components/schemas/UserStatus' },
          profile: {
            anyOf: [
              {
                type: 'object',
                required: ['bio'],
                properties: {
                  bio: { type: 'string' },
                },
              },
              {
                type: 'object',
                required: ['website'],
                properties: {
                  website: { type: 'string', format: 'url' },
                },
              },
            ],
          },
        },
      },
      AuditEvent: {
        type: 'object',
        required: ['id', 'type', 'createdAt'],
        properties: {
          id: { type: 'integer' },
          type: { const: 'user.audit' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['system'],
        responses: {
          '204': {},
        },
      },
    },
    '/users': {
      get: {
        operationId: 'users.fetch',
        tags: ['users'],
        parameters: [
          {
            name: 'search',
            in: 'query',
            schema: { type: 'string' },
          },
          {
            name: 'status',
            in: 'query',
            schema: { $ref: '#/components/schemas/UserStatus' },
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer' },
          },
          {
            name: 'x-request-id',
            in: 'header',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/User' },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: 'users.write',
        tags: ['users'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateUser' },
            },
          },
        },
        responses: {
          '201': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
        },
      },
    },
    '/users/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      get: {
        operationId: 'users.fetch',
        tags: ['users'],
        parameters: [
          {
            name: 'includePosts',
            in: 'query',
            schema: { type: 'boolean' },
          },
          {
            name: 'x-request-id',
            in: 'header',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
        },
      },
      patch: {
        operationId: 'users.write',
        tags: ['users'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateUser' },
            },
          },
        },
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
        },
      },
      delete: {
        operationId: 'delete-user',
        tags: ['users'],
        responses: {
          '204': {},
        },
      },
    },
    '/users/{id}/audit-events': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      get: {
        tags: ['users'],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/AuditEvent' },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies OpenAPIDocument
