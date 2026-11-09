#!/usr/bin/env node
import { buildElectronDist, installElectronDistDependencies, runElectronDistScript } from './shared.mjs'

buildElectronDist()
installElectronDistDependencies()
runElectronDistScript('package')
