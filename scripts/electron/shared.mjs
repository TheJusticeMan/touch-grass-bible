#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const distDir = join(root, 'dist')
const electronSourceDir = join(root, 'src', 'electron')

function runOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  const status = result.status ?? 0
  if (status !== 0) {
    throw new Error(`Command failed (${status}): ${command} ${args.join(' ')}`)
  }
}

export function buildElectronDist() {
  mkdirSync(distDir, { recursive: true })
  runOrThrow('npm', ['run', 'build:bundle:electron'])

  rmSync(join(distDir, 'package-lock.json'), { force: true })

  const sourceEntries = readdirSync(electronSourceDir)
  for (const entry of sourceEntries) {
    if (entry === 'package-lock.json') {
      continue
    }
    const sourcePath = join(electronSourceDir, entry)
    const targetPath = join(distDir, entry)
    if (statSync(sourcePath).isFile()) {
      cpSync(sourcePath, targetPath)
    }
  }
}

export function installElectronDistDependencies() {
  rmSync(join(distDir, 'node_modules'), { recursive: true, force: true })
  runOrThrow('npm', ['install', '--prefix', './dist', '--package-lock=false'])
}

export function runElectronDistScript(scriptName) {
  runOrThrow('npm', ['run', '--prefix', './dist', scriptName])
}

export function hasDisplayServer() {
  if (process.platform !== 'linux') {
    return true
  }

  const hasX11 = !!process.env.DISPLAY
  const hasWayland = !!process.env.WAYLAND_DISPLAY
  return hasX11 || hasWayland
}
