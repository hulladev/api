import { assertCompatibleIdentity, benchmarkIdentity } from '../harness/provenance'
import { ipc, lifecycle, scaling, sockets } from '../suites/diagnostics'
const suites = { ipc, lifecycle, scaling, sockets }
const suite = process.env['BENCH_DIAGNOSTIC_SUITE'] as keyof typeof suites
if (!Object.hasOwn(suites, suite)) throw new Error('Unknown diagnostic suite')
const identity = await benchmarkIdentity()
const results = await suites[suite]()
assertCompatibleIdentity(identity, await benchmarkIdentity(), suite)
console.log(JSON.stringify({ identity, processId: process.pid, results }))
