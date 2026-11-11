#!/usr/bin/env node
/* eslint-disable security/detect-non-literal-fs-filename */
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const platform = process.argv[2];
if (!platform || !["android", "ios"].includes(platform)) {
  console.error("Usage: node scripts/platform/run.mjs <android|ios>");
  process.exit(1);
}

function resolveAndroidSdkDir() {
  const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
  if (sdkDir) {
    return sdkDir;
  }

  const localProps = join(process.cwd(), "android", "local.properties");
  if (!existsSync(localProps)) {
    return "";
  }

  const contents = readFileSync(localProps, "utf8");
  const match = contents.match(/^sdk\.dir=(.+)$/m);
  return match?.[1]?.trim() || "";
}

function pathExists(path) {
  return existsSync(path);
}

function canWritePath(path) {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function printAndroidSdkFixInstructions(sdkDir) {
  const requiredPackages = [
    { id: "platforms;android-36", marker: join(sdkDir, "platforms", "android-36") },
    { id: "build-tools;35.0.0", marker: join(sdkDir, "build-tools", "35.0.0") },
  ];
  const missing = requiredPackages.filter(pkg => !pathExists(pkg.marker));

  if (!sdkDir) {
    console.error("Android SDK path is not set.");
    console.error(
      "Set ANDROID_HOME/ANDROID_SDK_ROOT or create android/local.properties with sdk.dir=<sdk path>.",
    );
    return;
  }

  if (missing.length === 0) {
    return;
  }

  const packageArgs = missing.map(pkg => `"${pkg.id}"`).join(" ");
  const sdkInstallCmd = `android --sdk="${sdkDir}" sdk install ${packageArgs}`;
  const writable = canWritePath(sdkDir);

  console.error("Required Android SDK packages are missing:");
  for (const pkg of missing) {
    console.error(`  - ${pkg.id}`);
  }

  if (writable) {
    console.error("Run:");
    console.error(`  ${sdkInstallCmd}`);
  } else {
    console.error("SDK path is not writable by your user. Run:");
    console.error(`  sudo ${sdkInstallCmd}`);
    console.error("Or one-time fix ownership:");
    console.error(`  sudo chown -R "$USER":"$USER" "${sdkDir}"`);
  }
}

function getConnectedAndroidTargets(env) {
  const adbFromSdk = env.ANDROID_SDK_ROOT ? join(env.ANDROID_SDK_ROOT, "platform-tools", "adb") : "";
  const adbCommand = adbFromSdk && existsSync(adbFromSdk) ? adbFromSdk : "adb";
  const probe = spawnSync(adbCommand, ["devices"], {
    encoding: "utf8",
    env,
  });

  if (probe.error || (probe.status ?? 1) !== 0) {
    return { targets: [], adbCommand, ok: false };
  }

  const targets = (probe.stdout || "")
    .split("\n")
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(/\s+/))
    .filter(([, state]) => state === "device")
    .map(([serial]) => serial);

  return { targets, adbCommand, ok: true };
}

if (platform === "android") {
  const sdkDir = resolveAndroidSdkDir();
  if (sdkDir) {
    process.env.ANDROID_HOME = sdkDir;
    process.env.ANDROID_SDK_ROOT = sdkDir;
  }

  const { targets, adbCommand, ok } = getConnectedAndroidTargets(process.env);
  if (!ok) {
    console.warn(`Unable to query Android devices via "${adbCommand}". Continuing with Capacitor run...`);
  } else if (targets.length === 0) {
    console.error("No Android device/emulator detected by adb.");
    console.error(
      `Try running "${adbCommand} devices" and ensure at least one target is listed as "device".`,
    );
    process.exit(1);
  } else {
    console.log(`Detected Android target(s): ${targets.join(", ")}`);
  }

  printAndroidSdkFixInstructions(sdkDir);
}

const command =
  platform === "android"
    ? "mkdir -p ./dist && npm run build:bundle:capacitor && npx capacitor-assets generate --android && npx cap run android"
    : 'if [ "$(uname -s)" != "Darwin" ]; then echo "run:ios requires macOS. Skipping execution."; exit 0; fi && echo "Building Capacitor assets..." && npm run build:bundle:capacitor && echo "Generating iOS icons..." && npx capacitor-assets generate --ios && echo "Running iOS project..." && npx cap run ios';

const result = spawnSync("bash", ["-lc", command], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  throw result.error;
}

if (platform === "android" && (result.status ?? 0) !== 0) {
  const sdkDir = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || "";
  printAndroidSdkFixInstructions(sdkDir);
}

process.exit(result.status ?? 0);
