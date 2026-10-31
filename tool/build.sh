#!/usr/bin/env bash
# Build lengkap: web (Vite) -> assets/www -> APK Flutter.  Pemakaian: bash tool/build.sh [debug|release]
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-release}"

echo "==> [1/5] Build aplikasi web (UI WakuPlay)"
( cd webapp && npm install --no-audit --no-fund && npm run build )

echo "==> [2/5] Salin ke assets/www"
rm -rf assets/www && mkdir -p assets && cp -r webapp/dist assets/www

echo "==> [3/5] Sinkron pubspec (versi + daftar aset)"
node tool/sync-pubspec.mjs

echo "==> [4/5] Siapkan Android (Kotlin)"
bash tool/setup.sh

echo "==> [5/5] flutter build apk --$MODE"
flutter pub get
if [ "$MODE" = "debug" ]; then
  flutter build apk --debug --target-platform android-arm64
else
  flutter build apk --release --no-shrink --target-platform android-arm64
fi
echo
echo "APK: build/app/outputs/flutter-apk/"
ls -la build/app/outputs/flutter-apk/*.apk
