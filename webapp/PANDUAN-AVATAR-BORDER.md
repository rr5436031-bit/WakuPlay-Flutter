# Avatar Border lewat link .gif (Panel Developer > Border)

> UPDATE: folder per rarity (`Border/<rarity>/`), harga otomatis per rarity, dan sinkronisasi upload manual GitHub dijelaskan di **PANDUAN-BORDER-GITHUB.md**. Isi di bawah tetap berlaku untuk hal yang tidak disebut di sana.

Dua cara: (a) tempel link .gif (tidak memakai storage), atau (b) impor file GIF dari HP (wajib di bawah 10 MB, diunggah ke repository GitHub lewat Edge Function `border-gif`). Gambar tidak ikut di APK; database hanya menyimpan link-nya.

## Pasang (sekali)
1. Supabase SQL Editor: jalankan `supabase/avatar-border-url.sql` (setelah `avatar-border.sql`). Aman diulang.
   Border aset lama (a001..a999), kalau pernah ada, dihapus dan pemiliknya mendapat WakuGold kembali sebesar harga yang dibayar.
2. Build ulang APK (`bash update.sh`).

## Penyimpanan GIF di GitHub (Edge Function `border-gif`)
File GIF hasil impor dari HP disimpan di https://github.com/rr5436031-bit/wakuplay-avatar-borders (folder `borders/`; wallpaper Gacha memakai repository, token, dan Edge Function yang sama di folder `Wallpaper/`, lihat PANDUAN-WALLPAPER-GITHUB.md). Supabase tetap untuk login, database, dan metadata (tabel `avatar_borders`, kolom `image_url` berisi link `https://raw.githubusercontent.com/.../borders/xxx.gif`). Tidak perlu migration SQL baru. File lama di bucket `avatar-border` tetap bekerja.

Alur: aplikasi mengirim file ke Edge Function > fungsi memeriksa login + `is_developer()` + isi GIF (GIF87a/89a, di bawah 10 MB, persegi 96-1024 px) > fungsi mengunggah ke GitHub memakai secret `GITHUB_TOKEN` > link dikembalikan ke Panel Developer > developer menekan Impor.

### A. Siapkan token GitHub (sekali)
1. Repository `wakuplay-avatar-borders` harus **Public** (supaya link raw bisa dimuat semua pemain) dan sudah punya minimal 1 commit (mis. README).
2. GitHub > Settings > Developer settings > Personal access tokens > **Fine-grained tokens** > Generate new token. Repository access: *Only select repositories* > `wakuplay-avatar-borders`. Permissions > Repository permissions > **Contents: Read and write**. Salin tokennya.
3. Simpan sebagai secret Supabase (JANGAN di `.env`, kode, atau repository):
   `supabase secrets set GITHUB_TOKEN=github_pat_xxxxx --project-ref <ref-proyek>`
   atau Dashboard > Edge Functions > Secrets > Add new secret (nama `GITHUB_TOKEN`).
   Opsional: `GITHUB_BRANCH=main` (kalau kosong dipakai default branch repository).

### B. Deploy Edge Function (tanpa Vercel)
CLI: `supabase login` lalu `supabase functions deploy border-gif --project-ref <ref-proyek>` (JANGAN pakai `--no-verify-jwt`).
Dashboard: Edge Functions > Deploy a new function > nama `border-gif` > tempel isi `supabase/functions/border-gif/index.ts` > Deploy, biarkan *Verify JWT* aktif.
Kalau alamat fungsi di Dashboard bukan `border-gif`, isi `VITE_BORDER_FN=<alamat>` di `.env` lalu build ulang APK.

### C. Uji konfigurasi
Login sebagai developer, lalu panggil aksi `check` (dari konsol/Postman): POST `https://<ref>.supabase.co/functions/v1/border-gif` dengan header `Authorization: Bearer <token login>`, `apikey: <publishable key>`, body `{"action":"check"}`. Hasil `ok:true` + nama branch berarti token dan repository siap.

### D. Kode error dari fungsi
`no_auth` (belum login) · `forbidden` (bukan developer) · `too_large` (>= 10 MB) · `not_gif` · `bad_size` (bukan persegi / di luar 96-1024 px) · `token_invalid` · `token_forbidden` (token tanpa izin Contents: write) · `repo_not_found` · `rate_limited` · `network` · `in_use` (file masih dipakai border lain, tidak dihapus) · `no_token` (secret belum diisi).

## Tambah border
Panel Developer > tab **Border**: isi Nama, pilih Rarity, tempel link .gif ATAU tekan Impor GIF dari HP, isi Harga, tekan **Impor**. Border langsung muncul di Shop.

## Aturan (dicek di aplikasi DAN di server)
* Hanya developer. Nama 1-40 karakter, tidak boleh kembar.
* Link: https, domain asli (bukan IP/localhost/port/user:pass@), berakhiran .gif, maks 500 karakter, tidak boleh kembar.
* Gambar harus berhasil dimuat, persegi 1:1, sisi 96-1024 px. Tombol Impor baru aktif setelah lolos.
* Harga harus di dalam rentang rarity (tabel `avatar_border_tiers`): basic 500-1.500, standard 2.000-4.500, premium 5.000-10.000, epic 12.000-20.000, legendary 25.000-40.000, mythic 50.000-100.000.
* Maks 700 border impor. Border yang sudah dibeli: rarity terkunci. Kalau dihapus (popup konfirmasi Ya/Tidak), border + file GIF-nya hilang total dan pemilik otomatis dapat WakuGold kembali sebesar harga yang dibayar. Mau menyimpan koleksi pemilik? Pilih Nonaktifkan, bukan Hapus.
* Border bawaan b01-b50 hanya bisa diubah harga / aktifnya.
* File dari HP: harus .gif asli (isi file dicek), di bawah 10 MB, hanya developer yang bisa unggah. File dihapus otomatis dari GitHub kalau border dihapus / link-nya diganti / impor dibatalkan.

## GIF ke Link (Pengaturan > Akun > GIF ke Link)
WebView di dalam APK yang membuka picturetolink.com/gif-to-url, tapi hanya menampilkan kotak upload dan kotak hasil link. Pilih GIF (wajib .gif, di bawah 10 MB), tunggu link muncul, tekan **Salin** (link juga otomatis disalin). Tempel link itu di Panel Developer > Border atau di banner profil.
Plugin: `plugins/wp-gifurl`. Hanya boleh membuka domain picturetolink.com; halaman/iklan lain diblokir. Setelah `bash update.sh` plugin ikut terpasang otomatis.
