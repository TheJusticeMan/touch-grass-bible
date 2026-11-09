#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['scripts/run-ts.mjs', 'scripts/data/generate-map-coords.ts', '--', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  throw result.error
}
process.exit(result.status ?? 0)
