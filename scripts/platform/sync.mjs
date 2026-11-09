#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const args = process.argv.slice(2)
const root = process.cwd()
const localProps = join(root, 'android', 'local.properties')
let sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || ''

if (!sdkDir && existsSync(localProps)) {
  const contents = readFileSync(localProps, 'utf8')
  const match = contents.match(/^sdk\.dir=(.+)$/m)
  sdkDir = match?.[1]?.trim() || ''
}

if (sdkDir) {
  process.env.ANDROID_HOME = sdkDir
  process.env.ANDROID_SDK_ROOT = sdkDir
}

const command = `mkdir -p ./dist && npm run build:bundle:capacitor && npx cap sync ${args.join(' ')}`.trim()
const result = spawnSync('bash', ['-lc', command], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  throw result.error
}
process.exit(result.status ?? 0)
