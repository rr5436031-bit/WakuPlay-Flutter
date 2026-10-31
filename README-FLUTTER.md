# WakuPlay — Flutter (Dart) + Kotlin

Cangkang aplikasi sekarang **Flutter + Kotlin** (bukan Capacitor + Java lagi).
**UI, halaman, tombol, animasi, dan logika bisnis tidak berubah sama sekali** karena
source UI (`webapp/`, React/Vite) dipakai apa adanya dan disajikan di dalam Flutter.

## Apa yang diganti

| Dulu (Capacitor) | Sekarang |
|---|---|
| `@capacitor/core`, `@capacitor/app`, `@capacitor/local-notifications`, `@capgo/capacitor-social-login` | `webapp/src/native/*.js` (jembatan JS ↔ Flutter). Diarahkan lewat `alias` di `webapp/vite.config.js`, jadi **tidak ada satu pun file UI yang diedit** |
| `plugins/wp-notify` (Java) | `notify/*.kt` (NotifyCore, PollService, PollReceiver, BootReceiver, NotifyModule) |
| `plugins/wp-pip` (Java) | `PipModule.kt` |
| `plugins/wp-pay` (Java) | `PayModule.kt` (+ `wp-pay-fill.js`) |
| `plugins/wp-gifurl` (Java) | `GifUrlModule.kt` (+ `wp-gifurl.js`) |
| LocalNotifications | `notify/LocalNotifModule.kt` |
| CapacitorHttp (gambar) | `lib/main.dart` → `_httpGet` |
| Login Google (SocialLogin) | `lib/main.dart` → paket `google_sign_in` |
| Capacitor `MainActivity` | `MainActivity.kt` + `Hub.kt` (FlutterActivity) |

Yang tetap: `applicationId = com.wakuplay.app`, versi dari `webapp/package.json`
(versionCode = `a*10000 + b*100 + c`, mis. 1.5.9 → 10509), SharedPreferences `wp_notify`,
semua rpc Supabase, Edge Functions, SQL.

## Cara build

Prasyarat: Flutter SDK (stable), JDK 17, Node 20, Android SDK.

```bash
bash tool/build.sh            # release (arm64)
bash tool/build.sh debug      # debug
```
Hasil: `build/app/outputs/flutter-apk/`.

Skrip itu: build web → salin ke `assets/www` → sinkron `pubspec.yaml` → `flutter create`
(sekali, untuk kerangka `android/`) → pasang Kotlin/manifest/resource → `flutter build apk`.

Flutter tidak resmi didukung di Termux ARM64. Gunakan **GitHub Actions**:
`.github/workflows/build-apk.yml` (jalankan manual lewat *Run workflow*).

## Wajib dicek

1. **Kunci tanda tangan sama dengan APK lama.** Login Google terikat SHA-1 kunci lama. Kunci dipakai dari
   `~/.wakuplay/sign.properties` (sama seperti skrip lama). Di GitHub Actions isi secret
   `WP_KEYSTORE_BASE64` (`base64 -w0 ~/.wakuplay/wakuplay.jks`) dan `WP_KEYSTORE_PASSWORD`.
   Tanpa itu APK ditandatangani kunci debug dan login Google bisa gagal.
2. **Rahasia `.env`**: kalau `webapp/.env` tidak ikut di-commit, isi secret `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_WEB_CLIENT_ID`, `VITE_PREMIUM_FN`, `VITE_BORDER_FN`.
3. **Origin berubah**: dulu `https://animein.net` (Capacitor), sekarang `http://localhost:8080`
   (server lokal Flutter). Efeknya: data `localStorage`/IndexedDB lama (sesi login, cache gambar,
   pengaturan lokal) tidak terbawa, jadi pengguna login Google ulang sekali setelah update.
   Data akun di Supabase aman.
4. **Belum diuji di perangkat.** Lingkungan tempat ini dibuat tidak punya Flutter/Kotlin/Android SDK,
   jadi kode belum pernah dikompilasi. Yang sudah diuji: logika jembatan JS dan skrip patch Gradle
   (Groovy & Kotlin DSL). Kalau build gagal, kirim log error-nya.

## Struktur

```
webapp/            source UI (React/Vite) — sama seperti WakuPlay-v183, tanpa Capacitor
  src/native/      jembatan pengganti Capacitor
lib/main.dart      cangkang Flutter (WebView, login Google, HTTP gambar, tombol back)
android_overlay/   Kotlin + manifest + resource, dipasang ke android/ oleh tool/patch-android.mjs
tool/              build.sh, setup.sh, patch-android.mjs, sync-pubspec.mjs
supabase/          SQL + Edge Functions (tidak berubah)
```
