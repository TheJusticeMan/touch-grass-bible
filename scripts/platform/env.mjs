#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

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
  console.log(`Using Android SDK: ${sdkDir}`)
} else {
  console.log('Android SDK not set (missing android/local.properties sdk.dir and ANDROID_HOME/ANDROID_SDK_ROOT); skipping.')
}

const result = spawnSync('bash', ['-lc', 'echo "ANDROID_HOME=${ANDROID_HOME:-}" && echo "ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-}"'], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  throw result.error
}
process.exit(result.status ?? 0)
