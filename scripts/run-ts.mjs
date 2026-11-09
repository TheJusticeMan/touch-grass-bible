#!/usr/bin/env node
import { build } from 'esbuild'
import { existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename, extname } from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: node scripts/run-ts.mjs <input-file> [-- <extra-args>]')
  console.log('Bundles the TypeScript entry with esbuild and executes the generated CommonJS output.')
  process.exit(args.length === 0 ? 1 : 0)
}

const input = resolve(args[0])
if (!existsSync(input)) {
  console.error(`Input file not found: ${input}`)
  process.exit(1)
}

const extraArgs = args.slice(1)
const hasDoubleDash = extraArgs.includes('--')
const passThrough = hasDoubleDash ? extraArgs.slice(extraArgs.indexOf('--') + 1) : []
const outfile = join(tmpdir(), `tg-bible-run-${Date.now()}-${basename(input, extname(input))}.cjs`)

try {
  await build({
    entryPoints: [input],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'warning',
    sourcemap: false,
    target: ['node18'],
  })

  const { spawnSync } = await import('node:child_process')
  const result = spawnSync(process.execPath, [outfile, ...passThrough], {
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) {
    throw result.error
  }

  process.exit(result.status ?? 0)
} finally {
  if (existsSync(outfile)) {
    unlinkSync(outfile)
  }
}
