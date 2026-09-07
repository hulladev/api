import { benchmarkIdentity } from '../harness/provenance'
import { ipc, lifecycle, scaling, sockets } from '../suites/diagnostics'
const suites = { ipc, lifecycle, scaling, sockets }
const suite = process.env['BENCH_DIAGNOSTIC_SUITE'] as keyof typeof suites
if (!Object.hasOwn(suites, suite)) throw new Error('Unknown diagnostic suite')
console.log(
  JSON.stringify({ identity: await benchmarkIdentity(), processId: process.pid, results: await suites[suite]() })
)
