#!/bin/bash
# Build oniLibrary APK without Gradle: static export -> aapt2 -> ecj -> d8 -> zipalign -> apksigner
set -e
SDK=/home/z/android-sdk
BT=$SDK/build-tools/34.0.0
AJ=$SDK/platforms/android-34/android.jar
PROJ=/home/z/my-project/android/app
OUT=$PROJ/build
WWW=/home/z/my-project/out
ROOT=/home/z/my-project

echo "[0/7] Static export..."
if [ ! -f $WWW/index.html ] || [ "$1" == "--fresh" ]; then
  if [ -d $ROOT/src/app/api ]; then
    rm -rf /tmp/api-route-backup
    mv $ROOT/src/app/api /tmp/api-route-backup
    (cd $ROOT && STATIC_EXPORT=1 bunx next build > /tmp/export-build.log 2>&1) || true
    mv /tmp/api-route-backup $ROOT/src/app/api || true
  else
    (cd $ROOT && STATIC_EXPORT=1 bunx next build > /tmp/export-build.log 2>&1) || true
  fi
fi
test -f $WWW/index.html || { echo "export failed"; exit 1; }

rm -rf $OUT
mkdir -p $OUT/gen $OUT/classes $OUT/dex $PROJ/assets

echo "[1/7] Compiling resources..."
$BT/aapt2 compile --dir $PROJ/res -o $OUT/res.zip

echo "[2/7] Preparing web assets..."
rm -rf $PROJ/assets/www
mkdir -p $PROJ/assets/www
cp -r $WWW/* $PROJ/assets/www/

echo "[3/7] Linking APK (with assets)..."
$BT/aapt2 link \
  -o $OUT/base.apk \
  -I $AJ \
  --manifest $PROJ/AndroidManifest.xml \
  -A $PROJ/assets \
  --java $OUT/gen \
  --auto-add-overlay \
  $OUT/res.zip

echo "[4/7] Compiling Java..."
java -jar /tmp/ecj.jar \
  -source 8 -target 8 -encoding UTF-8 \
  -classpath $AJ \
  -d $OUT/classes \
  -nowarn \
  $(find $PROJ/java -name "*.java") \
  $(find $OUT/gen -name "*.java")

echo "[5/7] Dexing..."
$BT/d8 --release --lib $AJ --min-api 24 --output $OUT/dex $(find $OUT/classes -name "*.class")

echo "[6/7] Adding classes.dex to APK + zipalign..."
cd $OUT/dex
zip -q $OUT/base.apk classes.dex
cd /home/z/my-project
$BT/zipalign -f 4 $OUT/base.apk $OUT/aligned.apk

echo "[7/7] Signing..."
KS=/home/z/my-project/android/oni-debug.keystore
if [ ! -f $KS ]; then
  keytool -genkeypair -v -keystore $KS -storepass onilibrary -keypass onilibrary \
    -alias oni -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=oniLibrary, OU=Oni, O=oniLibrary, L=Tokyo, C=JP" > /dev/null 2>&1
fi
$BT/apksigner sign --ks $KS --ks-pass pass:onilibrary --key-pass pass:onilibrary \
  --out /home/z/my-project/download/oniLibrary-v1.0.0.apk $OUT/aligned.apk

$BT/apksigner verify --print-certs /home/z/my-project/download/oniLibrary-v1.0.0.apk | head -4
ls -la /home/z/my-project/download/oniLibrary-v1.0.0.apk
echo "APK BUILD COMPLETE"
