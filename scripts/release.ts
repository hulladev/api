import { $ } from 'bun'

// 1. Run build
await $`bun run ./scripts/build.ts`
// 2. Run changeset
await $`bun run changeset`
// 3. Run version
await $`bun run changeset version`
// 4. Set NPM token
await $`npm config set //registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`
// 5. Publish
await $`npm publish --access public`
