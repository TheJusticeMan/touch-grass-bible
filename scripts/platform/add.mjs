#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const platform = process.argv[2];
if (!platform || !["android", "ios"].includes(platform)) {
  console.error("Usage: node scripts/platform/add.mjs <android|ios>");
  process.exit(1);
}

const manifestPath =
  platform === "android"
    ? "android/app/src/main/AndroidManifest.xml"
    : "ios/App/App.xcodeproj/project.pbxproj";
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

// eslint-disable-next-line security/detect-non-literal-fs-filename
if (existsSync(manifestPath)) {
  console.log(`${platform.toUpperCase()} platform already present.`);
} else {
  console.log(`Adding ${platform} platform via Capacitor...`);
  const addStatus = run("npx", ["cap", "add", platform]);
  if (addStatus !== 0) process.exit(addStatus);
}

console.log(`Generating custom ${platform.toUpperCase()} icons from assets/logo.svg...`);
const assetStatus = run("npx", ["capacitor-assets", "generate", `--${platform}`]);
process.exit(assetStatus);
