#!/usr/bin/env node
import { runCLI } from './cli-main'

void runCLI(process.argv.slice(2)).then((code) => {
  process.exitCode = code
})
