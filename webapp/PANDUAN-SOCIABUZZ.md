# Panduan Premium lewat SociaBuzz (menggantikan Pakasir)

## Alur
1. Home > BELI PREMIUM > pilih paket > **Beli**.
2. Server membuat pesanan `pending` berkode `WPyymmdd...` (harga & bonus diambil dari tabel paket di server).
3. Jendela WebView muncul DI DALAM aplikasi (`https://sociabuzz.com/wakuplay_premium/support`). Nominal, nama, email, pesan (kode pesanan + uid) terisi otomatis, kotak persetujuan dicentang, tombol "Pilih metode pembayaran" ditekan, lalu QRIS dipilih.
4. Pengguna scan QRIS. SociaBuzz mengirim **webhook** ke server; server mencocokkan kode `WP...` di pesan + nominal, lalu Premium + bonus WakuGold aktif otomatis. Aplikasi mengecek status tiap 4 detik dan menutup jendela sendiri saat berhasil.
5. Belum bayar / aplikasi ditutup: pesanan tetap `pending` (berlaku 3 menit, sama dengan QRIS SociaBuzz). Di Riwayat transaksi muncul tombol **Bayar sekarang** yang membuka lagi halaman QRIS yang sama.

## Pemasangan (urut)
1. **SQL**: SQL Editor > jalankan `supabase/premium-sociabuzz.sql` (setelah `premium.sql` dan `premium-bonus-top.sql`).
2. **Secret** (Edge Functions > Secrets): `SOCIABUZZ_WEBHOOK_KEY` = teks acak minimal 24 karakter buatanmu. (Opsional `SOCIABUZZ_PAGE` bila link halaman berubah.) Secret Pakasir tidak dipakai lagi.
3. **Deploy ulang** fungsi `premium` (isi baru) dan `premium-webhook` (isi baru, **Verify JWT = OFF**).
4. **Webhook di SociaBuzz**: dashboard SociaBuzz > Pengaturan > Integrasi/Webhook, isi URL:
   `https://<PROJECT-REF>.supabase.co/functions/v1/premium-webhook?key=<SOCIABUZZ_WEBHOOK_KEY>`
5. **Build APK**: `bash update.sh` (plugin baru `wp-pay` otomatis ikut lewat `npm install` + `cap sync`).

## Uji
- Beli paket termurah, bayar sungguhan. Lihat Edge Functions > premium-webhook > Logs.
- Tabel `premium_webhook_log` menyimpan payload mentah tiap webhook + hasilnya (`activated`, `no_order`, `rejected:...`). Kalau ada pembayaran masuk tapi Premium tidak aktif, lihat tabel ini.
- Kalau pembayaran tidak terbaca otomatis, developer bisa memberi hari manual lewat Panel Developer > Gift Premium.

## Catatan penting
- Isi otomatis memakai pencarian label/teks di halaman SociaBuzz (`plugins/wp-pay/android/src/main/assets/wp-pay-fill.js`). Kalau SociaBuzz mengubah tampilan, cukup sesuaikan file itu.
- Nominal di SociaBuzz harus >= harga paket (biaya admin SociaBuzz ditanggung pembayar tidak masalah).
- Pembayaran yang masuk sesudah pesanan kedaluwarsa tetap diaktifkan (uangnya sudah diterima).
- Satu ID donasi SociaBuzz hanya bisa mengaktifkan satu pesanan.

## Fitur khusus Premium / staf (v46)
- Jalankan `supabase/perks-premium.sql` di SQL Editor (sekali).
- Aturan ada di `src/lib/perks.js` (aplikasi) dan fungsi `wp_perk_ok` di SQL (server). Ubah keduanya bersamaan.
- Terkunci untuk user biasa tanpa Premium: ubah nama akun, pasang banner profil, aktifkan Skip Intro. Role admin/developer/moderator bebas.
- Skip Intro: setting default OFF. Kalau Premium habis, otomatis tidak aktif lagi.

## Gift Premium di Chat Global (v48)
- Jalankan `supabase/gift-premium.sql` di SQL Editor (sekali).
- Cara pakai: tekan lama pesan orang lain > Gift Premium (atau Balas pesannya, lalu tekan ikon hadiah di kolom ketik).
- Aturan ketat dijaga server (lihat komentar di atas file SQL): wajib Premium aktif, hari gift harus < sisa Premium, pengirim dikurangi & penerima ditambah dalam satu transaksi, maks 30 hari/gift, 10 gift & 60 hari per 24 jam, jeda 20 detik, penerima maks 365 hari, semua tercatat di tabel premium_gifts.

## Giveaway Premium di Chat Global (v49)
- Jalankan `supabase/giveaway-premium.sql` di SQL Editor (sekali, setelah gift-premium.sql).
- Tombol hadiah biru di samping kolom ketik > pilih hari per hadiah & jumlah hadiah > konfirmasi. Hari Premium pembuat langsung dipotong (total = hari x jumlah).
- Orang lain menekan Klaim di kartu. Berlaku 24 jam; sisa yang tidak diklaim dikembalikan ke pembuat otomatis.
- Aturan lengkap ada di komentar atas file SQL.

## Gacha Wallpaper (v1.2.0)
- Jalankan `supabase/gacha-wallpaper.sql` di SQL Editor (sekali). Ia juga membuat penyimpanan gambar `gacha` dan mengubah `set_my_banner`.
- Developer: Panel Developer > tab **Wallpaper** > isi Nama, Rarity, Peluang (bobot), lalu Impor foto/GIF atau tempel link .gif > Tambah ke gacha. Awalnya kosong.
- Pemain: WakuGames > Gacha Wallpaper. Summon 1x = 100 WakuGold, 10x = 1.000 (ubah di tabel gacha_config). Duplikat mengembalikan 50%.
- Setting > Pasang banner membuka halaman Pilih Banner: link .gif manual atau wallpaper koleksi gacha (tetap khusus Premium/staf).

## Kebun Waku (v1.3.0)
- Jalankan `supabase/kebun-waku.sql` di SQL Editor (sekali). Setelah itu WakuGames punya tombol **Kebun Waku**.
- Angka game ada di tabel (Table Editor): `farm_config` (emas per wortel), `farm_levels` (harga upgrade, waktu, buah per panen, kapasitas), `farm_items` (dekorasi).
- Awalnya kebun kosong; Upgrade ke level 1 untuk menanam wortel. Level 1 berbuah tiap 60 jam, 1 wortel = 20 WakuGold.

## Performa (v1.3.3)
- Mode `lite` otomatis di HP RAM <= 4 GB / CPU <= 6 inti: tanpa blur, tanpa bayangan filter, animasi hias tidak berputar terus. Pindah halaman tetap beranimasi.
- Pengaturan > Efek: Auto / Penuh (matikan lite) / Hemat (matikan semua animasi).
