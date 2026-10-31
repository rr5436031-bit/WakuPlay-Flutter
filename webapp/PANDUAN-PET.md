# Pet / Peliharaan (WakuGames)

## Pasang (urutan)
1. Supabase SQL Editor: jalankan `supabase/pet.sql` (aman diulang). Tabel: `pets` (katalog), `pet_inventory` (milik pemain), `pet_config` (harga), `pet_log`.
2. Deploy ulang Edge Function `border-gif` (isinya bertambah folder Pet/, token GitHub tetap sama):
   `supabase functions deploy border-gif --project-ref <ref-proyek>` (jangan pakai `--no-verify-jwt`).
3. Build ulang APK (`bash update.sh`).
Kalau sebelumnya belum menjalankan `clan-emblem.sql` dan deploy function versi emblem, cukup deploy function versi ini (sudah mencakup keduanya).

## Struktur repo GitHub (repo yang sama, tidak ada repo baru)
    borders/     Avatar Border   (folder lama, tidak diubah)
    Wallpaper/   Wallpaper Gacha (tidak diubah)
    Emblem/      Emblem Clan     (tidak diubah)
    Pet/         Pet WakuGames   (dibuat otomatis saat pet pertama diunggah)

## Impor pet (Panel Developer > Pet > Impor Pet)
Nama, rarity (Common / Rare / Epic / Legendary / Mythic), bobot peluang, lalu **Impor Pet dari HP** dan **Tambah ke gacha**.
Sama seperti Wallpaper / Border / Emblem: file naik ke GitHub lewat Edge Function (tidak ada token di APK), pratinjau tampil di papan kotak-kotak,
dibatalkan / diganti / dihapus = file di GitHub ikut terhapus (ditolak kalau masih dipakai pet lain), link manual juga bisa.
Syarat gambar (dicek server): PNG / WebP / GIF **transparan**, 64-2048 px, maks 5 MB. JPG ditolak, PNG/WebP yang masih punya latar ditolak.
File TIDAK diubah atau dikonversi, jadi transparansi dan animasi tetap utuh. Nama file dibuat unik otomatis (tidak menimpa file lama).

## Di aplikasi
- WakuGames > tombol **Pet** (papan menu) > halaman habitat. Dock bawah: **Gacha** dan **Katalog**.
- Habitat menggambar maksimal 12 pet (rarity tertinggi lebih dulu) supaya ringan; sisanya ada di Katalog.
- Animasi hanya transform/opacity, berhenti saat popup terbuka / aplikasi di latar belakang, dan mati total di mode Hemat.

## Aturan gacha yang dipakai (semua di server)
| Aturan | Isi |
|---|---|
| Harga | 1x = 500 WakuGold, 10x = 5.000 (ubah di tabel `pet_config`) |
| Peluang | bobot pet aktif ÷ total bobot; persen rarity tertera di Katalog |
| Pet kembar | jumlah (count) bertambah, ditampilkan ×2, ×3. Tidak ada pengembalian WakuGold |
| Keamanan | saldo dipotong + hasil dicatat dalam satu transaksi, dikunci per pemain; hanya developer yang bisa kelola katalog |
| Pet belum dimiliki | di Katalog tampil "?" (nama & gambar tidak dikirim server) |
Aturan di atas adalah keputusan sementara (mengikuti gacha wallpaper). Bagian "rules" di pesanmu terpotong, kirim lagi kalau ada aturan lain.


---
# Pet v2: habitat, pendapatan WakuGold, lihat pet orang lain

## Pasang
1. Supabase SQL Editor: jalankan `supabase/pet-v2.sql` (SETELAH `pet.sql`, aman diulang). Koleksi lama otomatis dipecah jadi unit pet di Penyimpanan (pemain tinggal menekan Pasang).
2. Build ulang APK (`bash update.sh`). Tidak ada Edge Function baru.

## Aturan (semua dijaga SERVER, ada di komentar `pet-v2.sql`)
| Hal | Aturan |
|---|---|
| Slot habitat | maks 15 pet terpasang (`pet_config.max_active`) |
| Pet kembar | Penyimpanan: ditumpuk ×2 / ×3. Habitat: satu pet = satu unit, tidak ditumpuk |
| Pasang | mengambil satu unit dari Penyimpanan, hitung mundur 24 jam dimulai saat dipasang (`claim_hours`) |
| Simpan | pet disimpan = tidak menghitung waktu. Ditolak kalau hadiahnya sudah siap (klaim dulu) |
| Klaim | hanya sah kalau waktunya tiba. Jumlah diundi server antara pendapatan min-maks pet, beda tiap klaim. Setelah klaim hitung mundur mulai ulang dari saat klaim (tidak menumpuk) |
| Klaim semua | satu transaksi untuk semua pet yang siap, tercatat di `gold_ledger` (alasan `pet_income`) |
| Anti curang | dikunci per pemain (sama dengan gacha) + baris pet dikunci; klik ganda / dua HP bersamaan tidak bisa klaim dua kali |
| Lihat pet orang | `pet_view`: hanya baca. Hanya nama, rarity, gambar pet terpasang. Tanpa WakuGold, waktu, penyimpanan, id |
| Tidak ada | jual, kirim, atau tukar pet |

## Panel Developer > Pet
Nama, Rarity (Common / Rare / Epic / Legend / Mythic), peluang gacha, **Pendapatan WakuGold per 24 jam (minimum sampai maksimum)**, Impor gambar, Simpan.
Isi min = maks untuk jumlah tetap. Batas: min >= 1, maks >= min, maks <= 1.000.000.
Pet lama diberi nilai awal sekali menurut rarity (Common 50-100, Rare 100-200, Epic 200-400, Legend 500-1000, Mythic 1000-2000); ubah dengan menekan pet di daftar.
CATATAN EKONOMI: 15 pet Mythic = sekitar 22 ribu WakuGold per hari per pemain pada angka awal. Sesuaikan angkanya dengan ekonomi WakuGold-mu.

## Di aplikasi
- Profil orang lain: tombol **Lihat Peliharaan (nama)** di tengah, di bawah Lihat Kebun / Lihat Clan.
- Habitat: pet kecil, berjalan acak ke segala arah (berhenti saat popup terbuka, aplikasi di latar belakang, atau mode Hemat).
- Pet yang siap klaim berkoin: ketuk pet, atau tombol **Klaim semua WakuGold** (muncul otomatis), atau tombol **Klaim** di Kelola.
- Dock: **Gacha**, **Kelola** (badge merah = jumlah pet siap klaim), **Katalog**. Kelola dan Katalog berbentuk popup bawah seperti contoh.


---
# Pet: Jual (pet-jual.sql)
Jalankan `supabase/pet-jual.sql` (SETELAH `pet-v2.sql`, aman diulang), lalu build ulang APK. Ini menggantikan aturan lama "tidak ada jual".

| Hal | Aturan |
|---|---|
| Harga | pendapatan **minimum** pet per 24 jam (`pets.income_min`), pasti, tidak diundi |
| Syarat | hanya pet di Penyimpanan; pet terpasang harus disimpan dulu. Satu jual = satu pet, hilang permanen |
| Harga berubah | aplikasi mengirim harga yang terlihat; kalau server beda, jual ditolak dan layar dimuat ulang |
| Anti curang | dikunci per pemain + baris pet dikunci; klik ganda / dua HP tidak bisa jual dua kali |
| Batas | 50 jual per 24 jam (`pet_config.sell_daily_limit`) |
| Saklar darurat | `update public.pet_config set value = 0 where key = 'sell_enabled';` mematikan jual (1 = hidup) |
| Pencatatan | dompet + `gold_ledger` alasan `pet_sell` |
| Katalog | kalau satu jenis pet habis terjual, di Katalog kembali "?" |

Di aplikasi: Kelola Pet > Penyimpanan > tombol **Jual** di bawah **Pasang** (ada konfirmasi). Dock Gacha/Kelola/Katalog disembunyikan saat popup Kelola/Katalog terbuka.
