#!/bin/bash
# Download and set up Android SDK build tools for APK packaging (no Gradle needed)
set -e
SDK=/home/z/android-sdk
mkdir -p $SDK/cmdline-tools

echo "[1/5] Downloading commandline tools..."
cd /tmp
curl -sSo cmdtools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -qo cmdtools.zip -d $SDK/cmdline-tools
mv $SDK/cmdline-tools/cmdline-tools $SDK/cmdline-tools/latest 2>/dev/null || true

export ANDROID_HOME=$SDK
export PATH=$SDK/cmdline-tools/latest/bin:$PATH

echo "[2/5] Accepting licenses..."
yes | sdkmanager --licenses > /dev/null 2>&1 || true

echo "[3/5] Installing platform tools, build-tools 34.0.0, platform android-34..."
yes | sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34" > /tmp/sdkmgr.log 2>&1

echo "[4/5] Done. Installed:"
ls $SDK/build-tools/ 2>/dev/null
ls $SDK/platforms/ 2>/dev/null
echo "[5/5] ANDROID SETUP COMPLETE"
