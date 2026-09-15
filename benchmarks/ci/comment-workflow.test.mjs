import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const workflow = await readFile(new URL('../../.github/workflows/performance.yml', import.meta.url), 'utf8')
const script = workflow
  .slice(workflow.lastIndexOf('          script: |\n') + '          script: |\n'.length)
  .split('\n')
  .map((line) => line.slice(12))
  .join('\n')
const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
  'require',
  'context',
  'github',
  'core',
  'process',
  script
)
const marker = '<!-- hulla-api-performance-v1 -->'
const sha = 'a'.repeat(40)
async function publish(comments, latestSha = sha) {
  const calls = []
  const github = {
    paginate: async () => comments,
    rest: {
      pulls: { get: async () => ({ data: { head: { sha: latestSha } } }) },
      issues: {
        listComments() {},
        updateComment: async (value) => calls.push({ method: 'update', ...value }),
        createComment: async (value) => calls.push({ method: 'create', ...value }),
      },
    },
  }
  await execute(
    () => ({ readFileSync: () => marker + '\nMeasured result' }),
    { repo: { owner: 'hulladev', repo: 'api' }, payload: { pull_request: { number: 27 } }, runId: 123 },
    github,
    { info() {} },
    { env: { MEASURED_HEAD: sha } }
  )
  return calls
}

test('performance workflow updates its bot comment instead of duplicating it', async () => {
  const calls = await publish([{ id: 42, user: { login: 'github-actions[bot]' }, body: marker + '\nold' }])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'update')
  assert.equal(calls[0].comment_id, 42)
  assert.ok(calls[0].body.includes('/actions/runs/123'))
})
test('performance workflow creates one first comment without editing user comments', async () => {
  const calls = await publish([{ id: 42, user: { login: 'contributor' }, body: marker }])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'create')
  assert.equal(calls[0].issue_number, 27)
})
test('performance workflow does not publish results for superseded commits', async () => {
  assert.deepEqual(await publish([], 'b'.repeat(40)), [])
})
