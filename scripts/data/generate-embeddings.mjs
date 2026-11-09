#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)
const chapterMode = argv.includes('--chapter') || argv.includes('chapter')
const script = chapterMode ? 'scripts/data/generate-chapter-embeddings.ts' : 'scripts/data/generate-bible-embeddings.ts'
const passThrough = argv.filter(arg => !['--chapter', 'chapter'].includes(arg))

const result = spawnSync(process.execPath, ['scripts/run-ts.mjs', script, '--', ...passThrough], {
  stdio: 'inherit',
  env: process.env,
})

if (result.error) {
  throw result.error
}
process.exit(result.status ?? 0)
