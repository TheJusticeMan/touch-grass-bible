# Platform Release Requirements

This document describes what you need to build and release Touch Grass Bible on each platform, both locally and through GitHub Actions CI.

---

## Web (Progressive Web App)

### Local Development

No extra tools required beyond Node.js ≥ 20.

```bash
npm install
npm run build:web
```

Output is in `dist/`. Deploy to any static host or run the existing GitHub Actions workflow.

### GitHub Actions CI

**Workflow:** `.github/workflows/static.yml`  
**Trigger:** Push a `v*` tag or dispatch manually.  
**Required Secrets:** None.  
**Required Permissions:** `pages: write`, `id-token: write` (already set in workflow).

The workflow automatically deploys to GitHub Pages at:  
`https://thejusticeman.github.io/touch-grass-bible/`

---

## Electron (Windows, macOS, Linux)

### Local Development Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | |
| npm | ≥ 10 | |
| rpm-build | any | Linux only — `sudo apt-get install rpm` or `sudo dnf install rpm-build` |
| Xcode | ≥ 14 | macOS only — needed for macOS packaging |
| Wine | ≥ 6 | Optional — needed only for Windows cross-compilation from Linux/macOS |

### Building Locally

```bash
npm install
npm run make:electron
```

Artifacts are created in `dist/out/make/`:

| Platform | Format | Location |
|----------|--------|---------|
| Windows | Squirrel `.exe` installer + `.nupkg` | `dist/out/make/squirrel.windows/` |
| macOS | `.zip` archive | `dist/out/make/zip/darwin/` |
| Linux | `.deb` package | `dist/out/make/deb/x64/` |
| Linux | `.rpm` package | `dist/out/make/rpm/x64/` |

### GitHub Actions CI

**Workflow:** `.github/workflows/release-electron.yml`  
**Trigger:** Push a `v*` tag or dispatch manually.  
**Runners:** `windows-latest`, `macos-latest`, `ubuntu-latest` (matrix).  
**Required Secrets:** None (no code signing configured by default).

**Optional: Windows Code Signing**  
Windows installers are not code-signed by default. Unsigned installers may trigger SmartScreen warnings. To sign:
1. Obtain an EV or OV code signing certificate.
2. Add the certificate and password as GitHub Secrets: `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`.
3. Update `forge.config.js` to use the `certificateFile` and `certificatePassword` options in the Squirrel maker config.

**Optional: macOS Code Signing & Notarisation**  
macOS `.zip` builds are not signed or notarised by default; Gatekeeper may block them. To sign and notarise:
1. Enrol in the Apple Developer Program (USD 99/year).
2. Create a "Developer ID Application" certificate in Xcode / Apple Developer portal.
3. Export as `.p12` and store as: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`.
4. Add the electron-forge `@electron-forge/plugin-notarize` plugin (or use `electron-notarize`).

---

## Android (APK / AAB)

### Local Development Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | |
| JDK | 17 | `sudo apt install openjdk-17-jdk` or use [Temurin](https://adoptium.net/) |
| Android SDK | API 34+ | Install via Android Studio or `sdkmanager` |
| Android Studio | latest | Recommended for initial platform setup and emulation |

Set the following environment variables:
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```

### Building Locally

```bash
npm install
npm run build:bundle:capacitor
cp src/web/* dist
npx cap add android          # only needed the first time
npx cap sync android
cd android && ./gradlew assembleDebug   # debug APK
# OR
cd android && ./gradlew assembleRelease # unsigned release APK
```

Output APK: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release Signing

To produce a Play Store–ready signed APK:

1. **Generate a keystore** (keep it secret — never commit it):
   ```bash
   keytool -genkeypair -v \
     -keystore touch-grass-bible.jks \
     -alias touch-grass-bible \
     -keyalg RSA -keysize 2048 \
     -validity 10000
   ```

2. **Build signed release APK:**
   ```bash
   cd android
   ./gradlew assembleRelease \
     -Pandroid.injected.signing.store.file=/path/to/touch-grass-bible.jks \
     -Pandroid.injected.signing.store.password=YOUR_STORE_PASSWORD \
     -Pandroid.injected.signing.key.alias=touch-grass-bible \
     -Pandroid.injected.signing.key.password=YOUR_KEY_PASSWORD
   ```

### GitHub Actions CI

**Workflow:** `.github/workflows/release-android.yml`  
**Trigger:** Push a `v*` tag or dispatch manually.  
**Runner:** `ubuntu-latest`.

**Required Secrets for signed APK** (all optional — falls back to debug APK if absent):

| Secret | Description |
|--------|-------------|
| `ANDROID_SIGNING_KEY` | Base64-encoded keystore file: `base64 -w0 touch-grass-bible.jks` |
| `ANDROID_KEY_ALIAS` | Key alias used when generating the keystore |
| `ANDROID_KEY_STORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_PASSWORD` | Key password |

Add secrets at: **Repository → Settings → Secrets and variables → Actions → New repository secret**

---

## iOS (IPA)

### Local Development Requirements

| Tool | Version | Notes |
|------|---------|-------|
| macOS | 13+ (Ventura) | Required — Xcode only runs on macOS |
| Xcode | 15+ | Install from the Mac App Store |
| CocoaPods | ≥ 1.14 | `sudo gem install cocoapods` |
| Node.js | ≥ 20 | |
| Apple Developer Account | Active membership | Required for device testing and distribution (USD 99/year) |

### Building Locally

```bash
npm install
npm run build:bundle:capacitor
cp src/web/* dist
npx cap add ios          # only needed the first time
npx cap sync ios
cd ios/App && pod install
open ios/App/App.xcworkspace   # open in Xcode for signing & building
```

In Xcode:
1. Select the `App` target.
2. Under **Signing & Capabilities**, choose your team and let Xcode manage signing automatically.
3. Select a connected device or simulator and press ▶ to build and run.

To create a distributable `.ipa`:
1. **Product → Archive** to create an archive.
2. **Distribute App** → choose distribution method (App Store, Ad Hoc, etc.).
3. Follow the Xcode export wizard.

### GitHub Actions CI

**Workflow:** `.github/workflows/release-ios.yml`  
**Trigger:** Push a `v*` tag or dispatch manually.  
**Runner:** `macos-latest`.

Without signing secrets, the workflow builds for the iOS simulator to verify the code compiles. With signing secrets, it creates and uploads a distributable `.ipa`.

**Required Secrets for signed IPA:**

| Secret | Description |
|--------|-------------|
| `IOS_P12_CERTIFICATE` | Base64-encoded `.p12` distribution certificate: `base64 -i certificate.p12 \| tr -d '\n'` |
| `IOS_P12_PASSWORD` | Password for the `.p12` file |
| `IOS_PROVISIONING_PROFILE` | Base64-encoded `.mobileprovision` file: `base64 -i profile.mobileprovision \| tr -d '\n'` |
| `IOS_TEAM_ID` | Apple Developer Team ID (10-character string from the Developer portal) |
| `IOS_KEYCHAIN_PASSWORD` | Any strong random password used to create the temporary CI keychain |

**Getting a Distribution Certificate and Provisioning Profile:**
1. Log in to [developer.apple.com](https://developer.apple.com).
2. Go to **Certificates, Identifiers & Profiles**.
3. Create an **App ID** with bundle ID `io.github.touch_grass_bible`.
4. Create a **Distribution Certificate** (Apple Distribution or iOS Distribution) and export it as `.p12` from Keychain Access.
5. Create a **Provisioning Profile** (Ad Hoc or App Store) linked to the App ID and certificate.
6. Download and base64-encode both files for the GitHub Secrets above.

Add secrets at: **Repository → Settings → Secrets and variables → Actions → New repository secret**

---

## Creating a Release

To trigger all release workflows at once, push a version tag:

```bash
git tag v3.1.1
git push origin v3.1.1
```

This triggers:
- `static.yml` → deploys web to GitHub Pages
- `release-electron.yml` → builds Windows / macOS / Linux installers
- `release-android.yml` → builds Android APK
- `release-ios.yml` → builds iOS IPA (macOS simulator build if no signing secrets)

All built artifacts are automatically attached to the GitHub Release created for that tag.
