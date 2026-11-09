#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const platform = process.argv[2]
if (!platform || !['android', 'ios'].includes(platform)) {
  console.error('Usage: node scripts/platform/open.mjs <android|ios>')
  process.exit(1)
}

if (platform === 'android') {
  const result = spawnSync('bash', ['-lc', 'if command -v studio >/dev/null 2>&1; then npx cap open android; else echo "Android Studio CLI not found; skipping open:android."; fi'], {
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) throw result.error
  process.exit(result.status ?? 0)
}

const result = spawnSync('bash', ['-lc', 'if [ "$(uname -s)" != "Darwin" ]; then echo "open:ios requires macOS; skipping."; exit 0; fi; npx cap open ios'], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  throw result.error
}
process.exit(result.status ?? 0)
