# Panduan Premium + Pembayaran Pakasir (API v2) untuk WakuPlay

Semua langkah bisa dilakukan dari HP Android (browser + Termux). Kerjakan berurutan.

## Gambaran singkat

- Aplikasi hanya **meminta** pesanan. Harga, nominal, dan aktivasi Premium diputuskan di **server** (Supabase).
- API Key Pakasir **hanya** ada di Supabase Secrets. Tidak ada di APK, `.env`, atau tabel database.
- Premium aktif **hanya** setelah server memverifikasi pembayaran ke Pakasir (lewat webhook, atau pengecekan status resmi).
- File yang ditambahkan:
  - `supabase/premium.sql` (tabel, keamanan, fungsi)
  - `supabase/functions/premium/index.ts` (buat pesanan QRIS, cek status, batalkan)
  - `supabase/functions/premium-webhook/index.ts` (terima notifikasi Pakasir)
  - Aplikasi: halaman Premium, tombol BELI PREMIUM di Home, badge PREMIUM (profil + komentar anime), tab Premium di Panel Developer.

## Langkah 0. Daftar Pakasir (sekali saja)

Menurut panduan resmi Pakasir (https://pakasir.com/p/get-started):

1. Buka https://app.pakasir.com, login dengan Nofbox.
2. **KYC akun** memakai KTP. Peninjauan 1 sampai 3 hari kerja.
3. Sambil menunggu, buat **Proyek**. Proyek baru otomatis berada di **Mode Sandbox** (simulasi, tanpa uang sungguhan).
4. Di halaman **Detail Proyek** (bagian bawah) catat tiga hal:
   - `slug`
   - `api_key`
   - **Webhook Secret** (header `X-Secret`)
5. Untuk menerima uang sungguhan, ajukan **KYC Proyek** (Go Live).

Catatan: API v1 Pakasir akan dihentikan 20 Oktober 2026. Aplikasi ini memakai **API v2**.

## Langkah 1. Jalankan SQL

1. Buka Supabase Dashboard (browser HP, aktifkan "Situs desktop" bila tampilan sempit) → proyek WakuPlay → **SQL Editor** → **New query**.
2. Tempel seluruh isi `supabase/premium.sql` → **Run**. Aman diulang.
3. Harus sudah pernah dijalankan sebelumnya: `schema.sql` dan `teman-chat.sql`.

## Langkah 2. Isi Secret (API Key disimpan di sini, bukan di aplikasi)

Supabase Dashboard → **Edge Functions** → **Secrets** (label menu bisa sedikit berbeda antar versi dashboard; bisa juga lewat Project Settings → Edge Functions). Tambahkan:

| Nama | Isi |
|---|---|
| `PAKASIR_SLUG` | slug proyek dari Pakasir |
| `PAKASIR_API_KEY` | api_key dari Pakasir |
| `PAKASIR_WEBHOOK_SECRET` | Webhook Secret dari Pakasir |
| `PAKASIR_ALLOW_SANDBOX` | `1` **hanya saat uji sandbox**. Hapus sebelum Go Live |

`SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` diisi otomatis oleh Supabase. Jangan dibuat manual dan jangan pernah ditempel ke aplikasi.

## Langkah 3. Deploy dua Edge Function

Untuk masing-masing fungsi: Dashboard → **Edge Functions** → **Deploy a new function** (lewat editor) → isi nama → tempel kode → **Deploy**.

1. Nama `premium` → tempel isi `supabase/functions/premium/index.ts`. Biarkan **Verify JWT aktif**.
2. Nama `premium-webhook` → tempel isi `supabase/functions/premium-webhook/index.ts`. **Matikan Verify JWT** untuk fungsi ini (di pengaturan fungsi: "Enforce JWT Verification" → off). Pakasir tidak mengirim token Supabase; keaslian dicek lewat header `X-Secret` di dalam kode.

### Penting: alamat (slug) fungsi bisa berbeda dari namanya

Fungsi yang dibuat lewat editor Dashboard bisa mendapat **alamat acak** (contoh: namanya `premium`, alamatnya `smooth-service`). Yang dipakai aplikasi dan Pakasir adalah **alamatnya**, bukan namanya.

1. Buka tiap fungsi di Dashboard dan lihat **URL** di bagian atas halamannya (akhiran setelah `/functions/v1/`).
2. Fungsi `premium`: isi alamatnya di file `.env` pada baris `VITE_PREMIUM_FN=` (contoh: `VITE_PREMIUM_FN=smooth-service`), lalu build ulang APK.
3. Fungsi `premium-webhook`: URL yang ditempel di Pakasir harus persis URL yang tampil di halaman fungsinya.

## Langkah 4. Pasang URL webhook di Pakasir

URL webhook (aktif setelah fungsi `premium-webhook` berhasil di-deploy):

```
https://bqjmjprdzqmunxnfaxtg.supabase.co/functions/v1/premium-webhook
```

(Diambil dari `VITE_SUPABASE_URL` di `.env` proyekmu. Kalau URL proyek Supabase-mu berbeda, formatnya `https://<PROJECT-REF>.supabase.co/functions/v1/premium-webhook`.)

1. Buka app.pakasir.com → proyek → **Detail Proyek**.
2. Isi kolom **Webhook URL** dengan URL di atas → simpan.
3. Pastikan **Webhook Secret** di halaman itu sama dengan secret `PAKASIR_WEBHOOK_SECRET` yang kamu isi di Supabase. Kalau kamu me-reset secret di Pakasir, perbarui juga di Supabase.

## Langkah 5. Buat paket (harga dan durasi tidak diisi otomatis)

1. Buka aplikasi → Panel Developer → tab **Premium**.
2. Isi **Manfaat Premium** (satu baris satu poin) → Simpan.
3. **Tambah paket**: ID, nama, durasi (hari), harga (Rp 500 sampai 10.000.000, batas QRIS Pakasir). Simpan.

(Alternatif lewat SQL: contoh ada di bagian bawah `premium.sql`.)

## Langkah 6. Uji dulu di Sandbox

1. Pastikan secret `PAKASIR_ALLOW_SANDBOX` = `1` (hanya untuk uji).
2. Di aplikasi: Home → **BELI PREMIUM** → pilih paket → muncul QRIS (ada tulisan "Mode uji").
3. Simulasikan pembayaran dari dashboard Pakasir. Halaman panduan yang kubaca menyebut Mode Sandbox memungkinkan simulasi, tetapi tidak menjelaskan tombolnya; cari di Detail Proyek / detail transaksi.
4. Hasil yang benar: layar aplikasi berubah ke "Pembayaran berhasil", badge **PREMIUM** biru muncul di profil dan komentar, dan Panel Developer → Premium menampilkan transaksi.
5. Setelah selesai uji: **hapus** secret `PAKASIR_ALLOW_SANDBOX`. Tanpa secret ini, transaksi sandbox sengaja tidak mengaktifkan Premium.
6. Go Live: setelah KYC Proyek disetujui, lakukan satu pembelian kecil sungguhan dengan akunmu sendiri.

Lihat log kalau ada masalah: Dashboard → Edge Functions → pilih fungsi → **Logs**.

## Langkah 7. Bangun ulang APK (Termux)

```bash
cd ~/WakuPlay      # folder project kamu
bash update.sh
```

`update.sh` menjalankan `npm install` (akan mengunduh `qrcode-generator` untuk menampilkan QRIS), build web, sync, lalu build APK. Hasilnya `WakuPlay.apk`. Naikkan `version` di `package.json` kalau mau memunculkan popup update ke member.

## Tambahan: bonus WakuGold, badge Top LB, XP 100/menit

Jalankan di SQL Editor, urut, SETELAH `premium.sql`:

1. `xp-aman.sql` (diperbarui): XP nonton 100 per menit + penjaga tabel `user_xp`.
2. `premium-bonus-top.sql` (baru): bonus WakuGold per paket + peringkat bulanan untuk badge Top LB.

**Mengatur bonus:** Panel Developer, tab Premium, ketuk paket (atau Tambah paket), isi **Bonus WakuGold**, simpan.
Bonus 0 = tanpa bonus. Bonus dikunci ke pesanan saat pesanan dibuat; mengubah bonus paket tidak mengubah pesanan yang sudah ada.

**Aturan bonus yang berlaku (semuanya di server):**
- Hanya Developer yang bisa mengubah besar bonus.
- Bonus cair hanya setelah pembayaran terverifikasi ke Pakasir, dalam satu transaksi database dengan aktivasi Premium.
- Satu pesanan hanya bisa mencairkan bonus sekali (penjaga `activated_at` + indeks unik di `gold_ledger`).
- Setiap bonus tercatat di `gold_ledger` dengan alasan `premium_bonus:<ID pesanan>`.
- APK tidak punya jalur apa pun untuk memberi bonus.

Cek bonus sudah masuk: Supabase Table Editor, tabel `gold_ledger`, cari `premium_bonus`.

**Edge Function tidak perlu di-deploy ulang** untuk perubahan ini; semua logika bonus ada di SQL.

**Badge Top LB:** muncul di profil pengguna yang masuk 10 besar XP bulanan (bulan berjalan, zona WIB), sumbernya sama dengan Leaderboard > Bulanan.

## Panel Developer: Top LB dan Gift Premium

Jalankan di SQL Editor SETELAH `premium-bonus-top.sql`: `dev-lb-gift.sql`. Jangan jalankan ulang `leaderboard-xp.sql` sesudahnya.

**Tab Top LB** (Panel Developer):
- Pilih Harian / Minggu / Bulan. Daftar berisi SEMUA user dengan XP yang tampil di Leaderboard periode itu, diurutkan dari terbesar. Ada kolom pencarian nama atau #ID.
- Ketuk satu user, isi XP LB baru, Simpan. Hanya XP di Leaderboard yang berubah; **XP asli dan level tidak berubah**.
- Tombol "Kembalikan ke XP asli" menghapus perubahan Developer di periode itu.
- Perubahan disimpan di tabel `lb_adjust` (tidak menyentuh `user_xp` dan `xp_daily`, jadi batas XP harian user tidak terganggu) dan dicatat di `lb_adjust_log`.
- Periode saling bersarang: hari ini termasuk minggu ini, dan minggu ini biasanya termasuk bulan ini. Mengubah XP LB Minggu ikut menambah XP LB Bulan. Di hari pertama periode (Senin / tanggal 1), mengubah Minggu atau Bulan juga ikut mengubah Harian, karena hari ini termasuk periode itu.
- Badge TOP LB di profil mengikuti XP LB Bulan, termasuk perubahan Developer.

**Tab Gift Premium**:
- Cari ID user (harus persis), isi jumlah **hari**, pilih Tambah atau Kurangi.
- Tambah: jika Premium masih aktif, hari ditambahkan setelah tanggal berakhir; jika tidak, mulai dari sekarang.
- Kurangi: hanya jika Premium aktif dan tidak boleh melebihi sisa hari.
- Gift tidak memberi bonus WakuGold (bonus hanya untuk pembelian). Tercatat di `premium_gift_log`.

## Aturan keamanan yang sudah diterapkan

- Tabel Premium dikunci dari APK. Pengguna hanya bisa membaca status dan riwayat **miliknya** lewat fungsi database.
- Premium hanya bisa diberikan oleh fungsi `premium_activate`, yang hanya dapat dipanggil `service_role` (Edge Function). Pengguna dan developer biasa tidak bisa memanggilnya.
- Harga dan nominal selalu dari tabel paket di server. Nilai dari aplikasi diabaikan.
- Webhook ditolak bila: `X-Secret` salah, order tidak dikenal, `txn_id` atau nominal tidak cocok, atau status di API status resmi Pakasir bukan `completed`.
- Satu pesanan hanya bisa mengaktifkan Premium **sekali** (kolom `activated_at` dikunci di dalam transaksi database).
- Perpanjangan saat masih aktif: durasi baru ditambahkan **setelah** tanggal berakhir saat ini. Jika sudah habis, mulai dari saat aktivasi. Waktu memakai jam server.
- Badge hilang otomatis saat masa berakhir karena status dihitung server (`expires_at > now()`).

## Yang sudah diuji, dan yang belum

Sudah diuji (otomatis, dengan Pakasir dan database **tiruan** di komputer): buat pesanan dengan nominal dari server, pesanan ganda dari tap berulang, pesanan orang lain, webhook tanpa/dengan secret salah, webhook palsu (Pakasir bilang belum bayar), nominal tidak cocok, order tidak dikenal, webhook valid, webhook diulang (tidak aktif dua kali), perpanjangan, aktivasi lewat pengecekan status, sandbox diblokir, pembatalan, kedaluwarsa.

**Belum bisa diuji dari sini**, jadi tolong cek sendiri saat uji sandbox: SQL di database Supabase asli, pembayaran Pakasir sungguhan, tampilan di HP, dan build APK.

## Sisa hari Premium (dihitung server)
Jalankan `supabase/premium-sisa-hari.sql` (setelah `premium-bonus-top.sql`). Kartu "Premium aktif" menampilkan "Tinggal N hari lagi"
(jam / menit kalau kurang dari sehari). Angkanya dihitung di server pakai `now()` server, bukan jam HP, sehingga tidak bisa diubah lewat
tanggal HP atau kode aplikasi. Tanpa SQL ini aplikasi tetap menghitung dari `server_now` (jam server) sebagai cadangan.
