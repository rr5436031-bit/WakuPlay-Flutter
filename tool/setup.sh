#!/usr/bin/env bash
# Menyiapkan folder android/ (sekali saja) lalu memasang kode Kotlin WakuPlay di atasnya.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v flutter >/dev/null || { echo "Flutter SDK belum terpasang / tidak ada di PATH"; exit 1; }
command -v node >/dev/null || { echo "Node.js belum terpasang"; exit 1; }

if [ ! -d android/app ]; then
  echo "==> flutter create (membuat kerangka android/)"
  flutter create --platforms=android --project-name wakuplay --org com.wakuplay -a kotlin . >/dev/null
fi
node tool/patch-android.mjs
echo "==> setup selesai"
