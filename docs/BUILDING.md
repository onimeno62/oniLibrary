# Building oniLibrary APK

The APK is built **without Gradle** — a lean pipeline that yields a ~4.3 MB app:
static export → `aapt2` → `ecj` (Java) → `d8` (dex) → `zipalign` → `apksigner`.

## Prerequisites

| Tool | Notes |
|---|---|
| **Bun** (or Node 20+) | runs the Next.js export |
| **JDK 17+** (`java`, `keytool`) | compiles + signs |
| **Android SDK** | platform `android-34`, build-tools `34.0.0` |

One-time SDK setup (downloads cmdline-tools, accepts licenses, installs platform+build-tools):

```bash
bash scripts/setup-android-sdk.sh        # installs to /home/z/android-sdk by default
```

The build script honours overrides:

```bash
ANDROID_SDK_ROOT=/path/to/sdk bash scripts/build-apk.sh
```

## Build

```bash
bash scripts/build-apk.sh            # reuses out/ if a static export exists
bash scripts/build-apk.sh --fresh    # forces a fresh Next.js static export
```

What happens:

1. `STATIC_EXPORT=1 bunx next build` → fully static `out/` (API routes are
   temporarily moved aside; the app is client-side only).
2. `aapt2 compile/link` — resources + `assets/www` (the export) into `base.apk`.
3. `ecj` compiles `android/app/java/**/*.java` against `android.jar`.
4. `d8` dexes the classes → `classes.dex`.
5. `zipalign` + `apksigner` with the debug keystore → **`download/oniLibrary-vX.Y.Z.apk`**.

## Verify the bundle

After every rebuild, run the asset gate — it simulates the native interceptor
against the real APK and asserts that every URL referenced by `index.html` and
by the runtime JS chunks resolves to a bundled file:

```bash
node scripts/verify-apk-assets.cjs
# ✅ ALL ASSET URLS RESOLVE — interceptor fix verified
```

## Signing

- Keystore: `android/oni-debug.keystore` (alias `oni`, store/key password `onilibrary`).
- **Keep this keystore** — Android only lets updates install when the signing
  certificate matches. It is a self-signed debug key generated on first build
  if missing; treat the committed one as the canonical release key for this project.
- Bump `android:versionCode` / `android:versionName` in
  `android/app/AndroidManifest.xml` before releasing, and update the output
  filename in `scripts/build-apk.sh`.

## CI

`.github/workflows/apk.yml` builds and attaches the APK on demand
(**Actions → Build APK → Run workflow**) on an Ubuntu runner using its
preinstalled Android SDK.

## Native shell architecture (what you're compiling)

`android/app/java/com/onilibrary/app/MainActivity.java`

- Serves `assets/www` over the virtual origin `https://appassets.androidplatform.net`
  (secure context ⇒ localStorage/IndexedDB work), intercepting **all** host paths.
- `OniAndroid` JS bridge: `exportFile` (saves to Downloads / share sheet),
  `ttsSpeak/ttsStop/ttsAvailable` (native read-aloud), `setOverlayDepth`
  (back-button pops the SPA overlay stack).
