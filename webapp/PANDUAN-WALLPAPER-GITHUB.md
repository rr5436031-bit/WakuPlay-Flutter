# Impor Wallpaper Gacha ke GitHub (hemat storage Supabase)

Impor foto / GIF wallpaper dari Panel Developer > Wallpaper sekarang tidak lagi masuk ke Supabase Storage.
File disimpan di repository GitHub yang SAMA dengan Avatar Border, memakai Edge Function `border-gif`, token (`GITHUB_TOKEN`), dan secret yang sama.

    https://github.com/rr5436031-bit/wakuplay-avatar-borders
      borders/      <- Avatar Border (.gif)      (folder lama, tetap, link border lama tidak putus)
      Wallpaper/    <- Wallpaper Gacha (.gif .jpg .png .webp), dibuat otomatis saat file pertama diunggah

## Yang perlu dilakukan (sekali)
1. Deploy ulang Edge Function (isinya berubah, tokennya TIDAK perlu dibuat ulang):
   `supabase functions deploy border-gif --project-ref <ref-proyek>`  (jangan pakai `--no-verify-jwt`)
   atau Dashboard > Edge Functions > border-gif > tempel isi `supabase/functions/border-gif/index.ts` > Deploy.
2. Tidak ada SQL baru. Server sudah menerima link `raw.githubusercontent.com/...png/.jpg/.webp/.gif`.
3. Build ulang APK (`bash update.sh`).

## Cara pakai
Panel Developer > Wallpaper > isi nama, rarity, bobot > **Impor foto / GIF dari HP** > file otomatis naik ke `Wallpaper/` > **Tambah ke gacha**.
Menempel link manual tetap bisa (tidak memakai storage sama sekali).

## Aturan
* Hanya developer (dicek di server lewat `is_developer()`).
* Isi file dicek, bukan cuma nama: harus benar-benar GIF / JPG / PNG / WEBP. Maksimal 10 MB.
* Nama file di GitHub diacak otomatis (tidak bisa bentrok).
* Dibatalkan / link diganti / wallpaper dihapus -> file di GitHub ikut dihapus otomatis.
  Server menolak menghapus file yang masih dipakai wallpaper lain atau yang sedang dipakai pemain sebagai banner profil (`in_use`).
* Wallpaper lama yang sudah ada di Supabase Storage (bucket `gacha`) tetap tampil. Tidak dihapus otomatis karena bisa saja sedang jadi banner pemain.

## Kode error baru
`not_image` (isi file bukan gambar valid) · `too_large` (di atas 10 MB) · selain itu sama dengan Border (lihat PANDUAN-AVATAR-BORDER.md).
