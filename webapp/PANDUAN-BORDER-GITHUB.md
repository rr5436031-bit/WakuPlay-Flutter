# Avatar Border v2: folder rarity di GitHub, harga otomatis, sinkronisasi upload manual

Dua cara memasukkan Border, keduanya masuk ke **Shop yang sama** (tabel `avatar_borders`, fungsi `avatar_border_register` yang sama, format metadata yang sama):

1. **Impor Panel Developer**: pilih GIF + rarity > tekan Impor > GIF otomatis diunggah ke `Border/<rarity>/nama-border.gif`.
2. **Upload manual GitHub**: unggah GIF sendiri lewat website GitHub ke `Border/<rarity>/`, lalu tekan **Sinkronkan dari GitHub** di Panel Developer > Border.

## Pasang (sekali)
1. Supabase SQL Editor: jalankan `supabase/avatar-border-github.sql` (setelah `avatar-border.sql` dan `avatar-border-url.sql`). Aman diulang.
2. Deploy ulang Edge Function (isinya berubah, token `GITHUB_TOKEN` tidak perlu dibuat ulang):
   `supabase functions deploy border-gif --project-ref <ref-proyek>` (jangan pakai `--no-verify-jwt`).
3. Build ulang APK (`bash update.sh`).
4. Buka Panel Developer > Border > **Sinkronkan dari GitHub** sekali. Ini sekaligus membuat folder rarity yang belum ada.

## Struktur repository (`rr5436031-bit/wakuplay-avatar-borders`)
```
Border/basic/  Border/standard/  Border/premium/
Wallpaper/   Emblem/   Pet/
borders/     <- folder LAMA, tetap ada supaya link border lama tidak putus (tidak dipindah / dihapus)
```
* Git tidak mengenal folder kosong, jadi folder dibuat dengan file penanda `.gitkeep` (diabaikan sinkronisasi). Hanya folder yang belum ada yang dibuat; tidak pernah menimpa.
* Nama folder wallpaper tetap **`Wallpaper`** (ejaan yang dipakai kode dan semua link wallpaper yang sudah ada). Mengganti jadi `Walpaper` akan memutus wallpaper lama.
* Nama folder rarity: huruf kecil.

## Harga otomatis
* Harga disimpan di tabel `avatar_border_prices` (satu baris per rarity). Nilai awal: basic 1.000, standard 6.500, premium 10.500. Konstanta `BORDER_PRICES` di `src/lib/borderUrl.js` hanya nilai awal/cadangan tampilan.
* Ubah di Panel Developer > Border > **Harga rarity**. Perubahan hanya berlaku untuk border BARU.
* Border lama tidak diubah diam-diam. Kalau ada border lama yang harganya berbeda dari harga rarity, muncul tombol **Terapkan ke N** (hanya yang harganya otomatis) atau **Samakan semua** (termasuk yang pernah diatur manual). Ada konfirmasi dulu. Pemain yang sudah membeli tidak ditagih atau dikembalikan (`price_paid` tetap).
* Border bawaan b01-b50 tidak pernah disentuh sinkronisasi harga.
* Rentang harga: Basic 500-1.500, Standard 6.000-7.000, Premium 8.000-13.000 (tabel `avatar_border_tiers`). Harga rarity harus di dalam rentang. Border lama yang harganya di luar rentang tetap bisa diaktif/nonaktifkan tanpa mengubah harga; rentang hanya dipaksakan saat harga diubah.

## Cara kerja Impor Panel
Nama + rarity + file GIF (atau link .gif) > Impor. Untuk file: (1) upload ke `Border/<rarity>/<nama>.gif` lewat Edge Function, (2) simpan metadata + link + path ke Supabase. Kalau langkah 2 gagal, file yang sudah terunggah otomatis dibatalkan. Nama file `nama-border.gif`; kalau sudah ada, GitHub menolak menimpa dan sistem menambah akhiran acak. Status tiap langkah ditampilkan.

## Cara kerja Sinkronisasi
1. Membaca `Border/<rarity>/*.gif` di GitHub (token hanya di server).
2. File yang sudah terdaftar dikenali dari **path** atau **link**-nya, dilewati (tidak dobel, aman dijalankan berkali-kali).
3. File baru diperiksa 32 byte pertamanya: harus GIF asli (GIF87a/89a), < 10 MB, persegi 96-1024 px (aturan yang sama dengan impor Panel). Isi file TIDAK diunduh penuh, diubah, atau dikompres, jadi animasi dan transparansi utuh.
4. Nama border dari nama file (`border-001.gif` > `Border 001`; kalau kembar ditambah rarity / angka), harga dari rarity folder, lalu dicatat lewat `avatar_border_register`. Langsung tampil di Shop.
5. Maks 60 file baru diperiksa per sekali tekan; sisanya berstatus "menunggu", tekan lagi.

Yang dilaporkan di Panel: file ditemukan, border baru, sudah terdaftar, file gagal (beserta alasannya), file diabaikan (bukan .gif / subfolder / di luar folder rarity), file hilang.

## File dihapus dari GitHub
Hanya **ditandai** (`file_missing_at`). Border dan riwayat pembelian tidak dihapus. Border itu disembunyikan dari Shop untuk yang belum punya, tetap ada di koleksi pemilik. Kalau file dikembalikan, sinkronisasi berikutnya menghidupkannya lagi. Penghapusan border dari Panel (tombol Hapus) tetap seperti sebelumnya: refund + file GitHub-nya ikut dihapus (supaya tidak terdaftar ulang oleh sinkronisasi).

## Keamanan
* `GITHUB_TOKEN` hanya sebagai secret Edge Function. Service role key tidak dipakai fungsi sinkronisasi: fungsi database dipanggil dengan sesi login developer dan dijaga `is_developer()`.
* Aksi `sync` / `init` / upload hanya untuk developer (dicek di server).
* Tidak ada perubahan pada `border_buy`, `border_equip`, saldo WakuGold, `wallets`, `gold_ledger`, `avatar_border_owned`.

## Batasan
* Batas border impor 700 (sebelumnya 500; jalankan `supabase/border-batas-700-nama-bebas.sql`). File di atas batas dilaporkan gagal dengan alasan jelas.
* Nama file di GitHub bebas (huruf, angka, spasi, kurung, tanda — dll). Yang ditolak hanya: `/ \ ? # % @ < > " | * :` dan lebih dari 120 karakter. Nama border di Shop dibersihkan otomatis dari teks seperti "Discord avatar decoration".
* Sinkronisasi dijalankan manual lewat tombol (tidak ada jadwal otomatis). Kalau mau otomatis, bisa ditambah GitHub webhook / Supabase cron yang memanggil aksi `sync` dengan akun developer.
* Satu folder rarity dibaca maksimal 1.000 file (batas GitHub API). Kalau terlewati, deteksi "file hilang" dimatikan untuk sinkronisasi itu.

## Rarity hanya 3
Basic, Standard, Premium. Border lama ber-rarity Epic / Legendary / Mythic otomatis dipindah ke Premium oleh SQL (hanya label; harga, pembelian, dan koleksi pemain tidak berubah). Folder `Border/epic|legendary|mythic/` yang mungkin sudah terlanjur dibuat tidak dibaca lagi; pindahkan file-nya ke `Border/premium/` lewat GitHub lalu sinkronkan.

## Pembersihan nama file otomatis (Border, Wallpaper, Emblem, Pet)
* Aturan (`cleanFileName`): buang teks seperti "— Discord avatar decoration", keterangan sumber/kredit (`source`, `credit`, `made by`...), nama situs (`xxx.com`), teks promosi (`subscribe`, `follow me`...), `@username`, penanda salinan `(1)` / `- copy`; sisanya dijadikan huruf kecil dengan tanda `-`. Nama utama dan ekstensi (`.gif .png .jpg .jpeg .webp`) dipertahankan. Contoh: `Demon Horns — Discord avatar decoration.gif` menjadi `demon-horns.gif`.
* Nama kembar di folder yang sama diberi angka: `demon-horns-2.gif`, `demon-horns-3.gif`. Nama yang seluruhnya bukan huruf latin (mis. Jepang) menjadi `file.gif`, `file-2.gif`, dst.
* Upload Panel (Border, Wallpaper, Emblem, Pet): nama file hasil unggahan memakai aturan yang sama. Border memakai nama border; jenis lain memakai nama file asli dari HP.
* Upload manual GitHub: dibersihkan otomatis di awal Sinkronisasi (folder Border/). Untuk Wallpaper/Emblem/Pet pakai tombol **Periksa nama file** > **Bersihkan** di Panel Developer > Border (membaca semua subfolder, ada pratinjau dulu).
* Ganti nama dilakukan sebagai commit Git (blob yang sama, hanya path baru): isi file tidak diunduh, dikompres, atau diubah, jadi animasi, kualitas, dan transparansi utuh.
* PENTING: file yang sedang dipakai di database (border terdaftar, wallpaper gacha, emblem clan, pet, banner profil) TIDAK diganti namanya karena link-nya akan putus. File itu dilaporkan sebagai "dilewati". Hanya file baru / belum terdaftar yang diganti.
* Setelah rename, link `raw.githubusercontent.com` lama untuk file itu tidak berlaku lagi (hanya masalah bagi file yang belum terdaftar).

## Perbaikan error `column reference "found" is ambiguous` (v1.5.9)
Gejala: di Panel Developer > Border muncul pesan merah `column reference "found" is ambiguous`, daftar border dan Impor gagal.
Penyebab: fungsi `dev_border_list()` memilih kolom `found` dari `avatar_border_sync_log`, padahal `FOUND` juga variabel bawaan plpgsql.
Perbaikan: jalankan **`supabase/border-fix-found.sql`** di Supabase SQL Editor (aman diulang, tidak mengubah data). `avatar-border-github.sql` juga sudah diperbaiki, jadi menjalankannya ulang tidak mengembalikan bug.
Tidak perlu deploy ulang Edge Function.
