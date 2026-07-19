# Contributing guide 💪

Thank you for your willingness to contribute and even taking your time to read this guide.

## Documentation 📚

Documentation is hosted in a separate repository, that acts as my portfolio/home page.

- [📃 Docs content](https://github.com/samuelhulla/hulla.dev/tree/master/src/content/docs/api)
- [🏠 Repository home](https://github.com/samuelhulla/hulla.dev/)

## Code 🧑‍💻

To provide a code contribution, please create a pull request and fill out the pull request template.

### Pre-requisites 👀

- [`bun`](https://bun.sh/docs/installation) _(PR's with incompatible lockfile due to different node package manager will not be accepted)_

### Contribution workflow 📝

After cloning the repository and doing `bun install` you're free to do any changes as deemed necessary.

1. Add individual changes _(please split bigger changes into smaller chunks, instead of single giant commit)_
2. Run `bunx cz` to trigger the interactive cli to make sure your commits match the project rules
3. Push your changes - This will trigger automatic linting and test check to make sure your PR didn't break anything

> You do not need to bump any versions or deploy anything. This will be done automatically in the next release.

### Acceptance criteria ✅

1. Adding any additional dependencies to the `core` package will result in closing the PR _(unless a good reason is provided)_
2. Pull requests not adhering to the pull request template will be closed
3. Disabling lint / ts rules must always be accompanied with a good reason as to why the rule is being disabled.

### Additional information ℹ️

Here are some useful commands _(these will trigger and cache in all packages automatically, via `turborepo`. Consider these commands as global unless stated otherwise)_

| Command             | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `bun install`       | Installs dependencies                                        |
| `bun run check`     | Checks formatting/lint, tests/builds packages, and runs smoke |
| `bun run clean`     | Removes workspace install and build artifacts                 |
| `bun run lint`      | Checks the repository with oxlint                            |
| `bun run lint:fix`  | Applies safe oxlint fixes                                     |
| `bun run fmt`       | Checks repository formatting                                 |
| `bun run fmt:fix`   | Formats the repository                                        |
| `bun run test`      | Runs package typechecks and Vitest                            |
| `bun run build`     | Builds and publints every package                             |

Here's the project structure _(just the most important parts)_

```bash
📁 .github # CI/CD workflows and templates
📁 packages
  📁 core # the main @hulla/api package
  📁 drizzle # @hulla/api-drizzle
  📁 openapi # @hulla/api-openapi
  📁 tanstack-query # @hulla/api-tanstack-query
  📁 swr # @hulla/api-swr
⎗ .oxlintrc.json # shared oxlint configuration
⎗ .oxfmtrc.json # shared oxfmt configuration
⎗ tsconfig.json # shared typescript configuration
⎗ turbo.json # turborepo configuration
```

Each package has a following structure

```bash
📁 src # source code that's transpited
  ⎗ index.ts # main export file
  ⎗ ... # other files
📁 tests
  ⎗ {name}.test.ts # matching test coverage for src file name
```
