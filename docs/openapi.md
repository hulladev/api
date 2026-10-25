# OpenAPI

`@hulla/api-openapi` converts between a contract and an OpenAPI document. Export a document to share your API, or import one to call an API described by someone else.

| Workflow                   | Starting point                                             | Result                                                   | Use it when                                                                                           | Focused guide                                         |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Export a contract          | An `@hulla/api` runtime contract and documentation sidecar | An OpenAPI 3.1.2 or 3.2.0 JSON or YAML document          | The TypeScript contract owns the API and external consumers need a standard wire description          | [Export a contract to OpenAPI](./openapi-export.md)   |
| Import an OpenAPI document | An existing provider-owned OpenAPI document                | A normal `@hulla/api` runtime contract and typed sidecar | An external specification owns the API and the application needs typed calls or a checked-in contract | [Import OpenAPI into a contract](./openapi-import.md) |

## The contract and sidecar have different jobs

The runtime contract describes what `@hulla/api` executes: routes, request representations, responses, and errors.

The documentation sidecar describes how that contract appears in OpenAPI: titles, summaries, descriptions, tags, examples, security metadata, and schema overrides. Generation reads the sidecar; clients, server implementations, and runtime requests do not.

The two workflows cross the boundary in opposite directions:

1. A code-first contract plus its sidecar produces an OpenAPI document.
2. An OpenAPI document produces a wire-oriented runtime contract plus a typed sidecar.
3. The generated contract uses the same clients, transports, and server APIs as a hand-written contract.

> Choose one source of truth. Export from a code-first contract or import from a provider-owned OpenAPI document; do not round-trip generated files as a synchronization strategy. OpenAPI cannot reconstruct application-side codecs or behavior that its schema does not represent.

## What the package does not own

`@hulla/api-openapi` reads and generates API descriptions. It does not:

- serve an OpenAPI document;
- install or configure Swagger UI, Scalar, Redoc, or another documentation interface;
- implement authentication or authorization;
- deploy the API or its documentation;
- create a separate generated client runtime.

Use the host application or deployment platform for serving, UI, authentication, and deployment policy. OpenAPI `security` fields describe a policy; they do not enforce it.

## Choose the next guide

- If the application already declares an `@hulla/api` contract, [export it to OpenAPI](./openapi-export.md).
- If another team or service provides the OpenAPI document, [import it into a contract](./openapi-import.md).
- To define a runtime contract, see [contract authoring](./contract-authoring.md).
- To consume any contract, see [client authoring](./client-authoring.md).
