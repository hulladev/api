# Releasing @hulla/api

## Contributor workflow

From the repository root, run `bun run changeset`, choose the affected package and
patch/minor/major severity, describe the user-visible change, and commit the changeset
with the implementation. Do not edit versions by hand.

All public packages in this repository form one fixed release family. A changeset for any member bumps and publishes every member at the same version. Private tooling and examples are excluded.

On `master`, `release.yml` opens or updates a release PR. It runs
`bun run version:packages`, updating package manifests, family dependency/peer ranges,
changelogs, the lockfile and `.changeset/release-plan.json`. The plan is the explicit
publication boundary: an unprepared checkout never publishes just because a package
is missing from npm. Review and merge that PR to release.

The next run checks sources, packs artifacts, and waits at the `npm` environment.
Approve that job once for the whole repository release. npm authenticates the workflow
using OIDC; there are no per-package mobile prompts or stored npm publishing tokens.
Versions come from the reviewed `package.json` files. Stable releases use `latest`.

After publication, a fresh consumer installs the exact registry versions using an
empty cache. Verification checks archive integrity, declared entrypoints, types-file
presence and selected runtime imports. It does not replace the repository's behavioral
and type tests.

## GitHub announcements are disabled

npm publication and verification do not create a GitHub Release by default.
Both the announcement job and its script require an explicit
`PUBLISH_GITHUB_RELEASES=true` opt-in. Leave that repository variable unset while
reviewing documentation and improving the packages.

When you are ready to announce future releases, set **Settings → Secrets and variables →
Actions → Variables → `PUBLISH_GITHUB_RELEASES`** to **`true`**. Eligible release runs
can then create one GitHub Release, `v<version>`, for the whole family after npm
verification. GitHub release subscribers may receive notifications at that point.
Enabling announcements is separate from enabling npm publishing.

Completed npm versions are detected from npm, so withholding GitHub announcements
does not cause every push to republish. Manual workflow runs remain available to
retry a failed publication or consumer verification.

## One-time activation

1. Merge the workflow and enable GitHub Actions to create pull requests in the
   repository's Actions settings.
2. Create a GitHub environment named **`npm`**. Configure required reviewers if one
   approval per release is desired and restrict deployment branches to **`master`**.
   Merely declaring the environment in YAML does not configure reviewers.
3. In **each package's npm Settings → Trusted publishing**, add:
   - GitHub owner: **`hulladev`**
   - Repository: **`api`**
   - Workflow filename: **`release.yml`** (no path)
   - Environment: **`npm`**
   - Allowed action: **direct `npm publish`**
4. Configure trust when an actual release is ready: a new trusted publisher must
   complete its first publication within two days. For a never-published package,
   bootstrap its npm package/trust configuration before expecting OIDC to work.
5. Optionally set **`RELEASE_PR_TOKEN`** to a GitHub App installation token delivered
   by your automation, or an appropriately scoped GitHub token. Without it the action
   uses `GITHUB_TOKEN`; PRs it creates do not automatically trigger other PR workflows.
   Arrange validation of the release PR before merging (or use an App for this flow).
   This token is for GitHub PRs, never npm publication.
6. Remove obsolete `NPM_TOKEN` secrets after a successful OIDC release.

Package settings to configure:

- `@hulla/api-astro`
- `@hulla/api-aws-lambda`
- `@hulla/api-azure-functions`
- `@hulla/api-cloudflare`
- `@hulla/api-control`
- `@hulla/api`
- `@hulla/api-elysia`
- `@hulla/api-express`
- `@hulla/api-fastify`
- `@hulla/api-google-cloud-functions`
- `@hulla/api-h3`
- `@hulla/api-hono`
- `@hulla/api-koa`
- `@hulla/api-message-port`
- `@hulla/api-nestjs`
- `@hulla/api-netlify-functions`
- `@hulla/api-next`
- `@hulla/api-node`
- `@hulla/api-nuxt`
- `@hulla/api-openapi`
- `@hulla/api-react-router`
- `@hulla/api-solid-start`
- `@hulla/api-sveltekit`
- `@hulla/api-swr`
- `@hulla/api-tanstack-query`
- `@hulla/api-tanstack-start`
- `@hulla/api-websocket`

## Retry and diagnosis

Use **Actions → Release → Run workflow** on `master`, or rerun a failed job.
Dependency and peer packages publish before integrations. An existing version is
skipped only when its npm integrity matches the built archive; a conflicting version,
auth error, rate limit or registry outage fails explicitly. Reuse the original
`npm-release` artifact when retrying publication; do not rebuild with different inputs.
When explicitly enabled, GitHub Release creation happens after consumer verification and is idempotent; retries do not create duplicate releases or notifications. There is no atomic
multi-package npm transaction: a failure may leave a partial publication, which the
next run resumes. No package is silently unpublished or overwritten.

Useful local checks (none publishes):

```sh
bun run test:release
bun run release:check
node scripts/release.mjs mode
```

`bun run release:pack` requires a prepared release plan and built artifacts.
`bun run release` intentionally refuses interactive/local publication; use Actions.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[Changesets fixed families](https://changesets.dev/guide/config#fixed),
[GitHub release notifications](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).
