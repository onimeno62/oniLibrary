#!/usr/bin/env bash
# Build oniLibrary APK without Gradle: static export -> aapt2 -> ecj -> d8 -> zipalign -> apksigner.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ONI_PROJECT_ROOT:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -z "$SDK" ]]; then
  echo "ERROR: Set ANDROID_SDK_ROOT (or ANDROID_HOME) to the Android SDK directory." >&2
  exit 1
fi

BT="$SDK/build-tools/34.0.0"
AJ="$SDK/platforms/android-34/android.jar"
PROJ="$ROOT/android/app"
OUT="$PROJ/build"
WWW="$ROOT/out"
ECJ_JAR="${ECJ_JAR:-/tmp/ecj.jar}"
APK_VERSION="${ONI_APK_VERSION:-1.3.1}"
APK_OUT="$ROOT/download/oniLibrary-v${APK_VERSION}.apk"

for tool in "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner" "$AJ"; do
  [[ -e "$tool" ]] || { echo "ERROR: Required Android SDK file not found: $tool" >&2; exit 1; }
done
[[ -f "$ECJ_JAR" ]] || { echo "ERROR: ECJ compiler JAR not found: $ECJ_JAR" >&2; exit 1; }
[[ -d "$PROJ/res" && -f "$PROJ/AndroidManifest.xml" ]] || {
  echo "ERROR: Android project files not found under $PROJ" >&2; exit 1;
}

echo "[0/7] Static export..."
if [[ ! -f "$WWW/index.html" || "${1:-}" == "--fresh" ]]; then
  API_DIR="$ROOT/src/app/api"
  # NOTE: the backup must live OUTSIDE src/app — Next.js's file router
  # treats any directory under app/ (even dot-prefixed) as a route segment
  # and the build fails collecting page data for it. Repo root is safe.
  API_BACKUP="$ROOT/.api-build-backup-$$"
  restore_api() {
    if [[ -d "$API_BACKUP" && ! -e "$API_DIR" ]]; then
      mv "$API_BACKUP" "$API_DIR"
    fi
  }
  trap restore_api EXIT
  if [[ -d "$API_DIR" ]]; then
    mv "$API_DIR" "$API_BACKUP"
  fi
  if ! (cd "$ROOT" && STATIC_EXPORT=1 bunx next build); then
    echo "ERROR: Next.js static export failed; source API routes will be restored." >&2
    exit 1
  fi
  restore_api
  trap - EXIT
fi
[[ -f "$WWW/index.html" ]] || { echo "ERROR: Static export did not produce $WWW/index.html" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex" "$PROJ/assets" "$(dirname "$APK_OUT")"

echo "[1/7] Compiling resources..."
"$BT/aapt2" compile --dir "$PROJ/res" -o "$OUT/res.zip"

echo "[2/7] Preparing web assets..."
rm -rf "$PROJ/assets/www"
mkdir -p "$PROJ/assets/www"
cp -a "$WWW/." "$PROJ/assets/www/"

echo "[3/7] Linking APK (with assets)..."
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$AJ" \
  --manifest "$PROJ/AndroidManifest.xml" \
  -A "$PROJ/assets" \
  --java "$OUT/gen" \
  --auto-add-overlay \
  "$OUT/res.zip"

echo "[4/7] Compiling Java..."
mapfile -d '' JAVA_SOURCES < <(find "$PROJ/java" "$OUT/gen" -type f -name '*.java' -print0)
(("${#JAVA_SOURCES[@]}" > 0)) || { echo "ERROR: No Java source files found." >&2; exit 1; }
java -jar "$ECJ_JAR" \
  -source 8 -target 8 -encoding UTF-8 \
  -classpath "$AJ" \
  -d "$OUT/classes" \
  -nowarn \
  "${JAVA_SOURCES[@]}"

echo "[5/7] Dexing..."
mapfile -d '' CLASS_FILES < <(find "$OUT/classes" -type f -name '*.class' -print0)
(("${#CLASS_FILES[@]}" > 0)) || { echo "ERROR: Java compilation produced no class files." >&2; exit 1; }
"$BT/d8" --release --lib "$AJ" --min-api 24 --output "$OUT/dex" "${CLASS_FILES[@]}"

echo "[6/7] Adding classes.dex to APK + zipalign..."
[[ -f "$OUT/dex/classes.dex" ]] || { echo "ERROR: D8 did not produce classes.dex." >&2; exit 1; }
(cd "$OUT/dex" && zip -q "$OUT/base.apk" classes.dex)
"$BT/zipalign" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"

echo "[7/7] Signing..."
KS="${ONI_KEYSTORE:-$ROOT/android/oni-debug.keystore}"
KS_PASS="${ONI_KEYSTORE_PASS:-onilibrary}"
KEY_ALIAS="${ONI_KEY_ALIAS:-oni}"
if [[ -z "${ONI_KEYSTORE:-}" ]]; then
  echo "NOTE: Signing with the committed/local DEBUG keystore (testing only; not for production release)."
fi
if [[ ! -f "$KS" ]]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -v -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=oniLibrary, OU=Oni, O=oniLibrary, L=Tokyo, C=JP" >/dev/null
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --ks-key-alias "$KEY_ALIAS" --out "$APK_OUT" "$OUT/aligned.apk"
"$BT/apksigner" verify --verbose "$APK_OUT"
ls -lh "$APK_OUT"
echo "APK BUILD COMPLETE: $APK_OUT"
