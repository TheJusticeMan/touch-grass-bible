#!/usr/bin/env node
import { buildElectronDist, hasDisplayServer, installElectronDistDependencies, runElectronDistScript } from './shared.mjs'

if (!hasDisplayServer()) {
  console.log('No display server detected; skipping run:electron.')
  process.exit(0)
}

buildElectronDist()
installElectronDistDependencies()
runElectronDistScript('start')
