# Gacha Emblem Clan

Emblem = gambar kecil (sesuai bentuk aslinya) di sisi kiri badge clan (komentar, chat, profil, Top Clans, halaman clan).

## Pasang (urutan)
1. Supabase SQL Editor: jalankan `supabase/clan-emblem.sql` (SETELAH `clan-pengaturan.sql`; aman diulang).
2. Deploy ulang Edge Function (isinya berubah, token TIDAK perlu dibuat ulang):
   `supabase functions deploy border-gif --project-ref <ref-proyek>` (jangan pakai `--no-verify-jwt`)
   atau Dashboard > Edge Functions > border-gif > tempel isi `supabase/functions/border-gif/index.ts` > Deploy.
3. Build ulang APK (`bash update.sh`).

## Folder di GitHub (repo yang sama)
    https://github.com/rr5436031-bit/wakuplay-avatar-borders
      borders/     Avatar Border   (folder lama, tetap, link lama tidak putus)
      Wallpaper/   Wallpaper Gacha
      Emblem/      Emblem Clan     (dibuat otomatis saat emblem pertama diunggah)

## Impor emblem (Panel Developer > Emblem)
Isi nama, pilih rarity (Common / Epic / Legend / Mythic), tekan **Impor emblem dari HP**, lalu **Tambah ke gacha**.
Sama seperti Wallpaper & Border: file naik ke GitHub lewat Edge Function, dibatalkan / diganti / dihapus = file di GitHub ikut terhapus
(ditolak kalau masih dipakai emblem lain). Menempel link manual tetap bisa.
Syarat gambar: 64-1024 px, rasio maks 3:1, maks 2 MB. Bentuk dan transparansi asli dipertahankan (PNG transparan tetap transparan, tanpa lingkaran). Tinggi emblem di badge tetap, lebarnya mengikuti rasio gambar. Pratinjau badge tampil sebelum disimpan.

## Cara kerja Gacha Emblem (Shop Clan > Gacha Emblem)
| Aturan | Isi |
|---|---|
| Siapa | Leader & Vice Leader (spin dan pilih emblem) |
| Harga | Spin x1 = 500 XPGold, Spin x5 = 2.250 XPGold (`emblem_spin_cost`, `emblem_spin5_cost` di tabel `clan_config`) |
| Peluang | Common 70, Epic 20, Legend 8, Mythic 2 (`emblem_odds_*`, bobot). Peluang TETAP, tidak naik walau clan sudah punya banyak emblem |
| Emblem kembar | Boleh. Emblem yang sudah dimiliki bisa keluar lagi (ditandai "sudah punya"), spin x5 pun boleh ada yang sama. Tidak ada pengembalian XPGold |
| Rarity kosong | Rarity yang belum punya emblem aktif dilewati dan peluangnya dibagi ke rarity lain |
| Pakai emblem | Dari hasil spin atau tab Koleksi; bisa dilepas ("Tanpa emblem") |
| Hapus emblem (developer) | Kepemilikan ikut terhapus, clan yang memakainya kembali tanpa emblem |
