#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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

  const sourceEntries = readdirSync(electronSourceDir)
  for (const entry of sourceEntries) {
    const sourcePath = join(electronSourceDir, entry)
    const targetPath = join(distDir, entry)
    if (statSync(sourcePath).isFile()) {
      cpSync(sourcePath, targetPath)
    }
  }

  const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const electronPackagePath = join(distDir, 'package.json')
  const electronPackage = JSON.parse(readFileSync(electronPackagePath, 'utf8'))
  electronPackage.version = rootPackage.version
  writeFileSync(electronPackagePath, `${JSON.stringify(electronPackage, null, 2)}\n`)

  const electronLockPath = join(distDir, 'package-lock.json')
  const electronLock = JSON.parse(readFileSync(electronLockPath, 'utf8'))
  electronLock.version = rootPackage.version
  if (electronLock.packages?.['']) {
    electronLock.packages[''].version = rootPackage.version
  }
  writeFileSync(electronLockPath, `${JSON.stringify(electronLock, null, 2)}\n`)
}

export function installElectronDistDependencies() {
  runOrThrow('npm', ['ci', '--prefix', './dist'])
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
