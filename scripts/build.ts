import { spawn } from 'bun'
import { BUILD } from './config' with { type: 'macro' }

const procs = BUILD().map((cmd) => spawn(cmd))
const builds = await Promise.all(procs.map((proc) => new Response(proc.stdout).text()))
builds.forEach((pkg) => console.log(pkg))
