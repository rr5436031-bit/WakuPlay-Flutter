# XP dari Gift Premium + Tier Level + Pajak Gift

## Pasang (sekali)
1. Supabase SQL Editor: jalankan `supabase/gift-xp.sql` (SETELAH `xp-aman.sql`, `gift-premium.sql`, `giveaway-premium.sql`, `biaya-gift.sql`, `dev-lb-gift.sql`). Aman diulang.
2. Build ulang APK (`bash update.sh`) supaya tier ikon baru & tampilan XP di popup ikut. Tanpa APK baru, XP gift tetap masuk (server yang menghitung), hanya tampilannya yang lama.
3. Cek (SQL Editor): `select * from public.gift_fee_tiers order by from_days;` harus 0.20 / 0.25 / 0.30 / 0.35.

## Aturan XP gift (semua dijaga SERVER)
| Aturan | Isi |
|---|---|
| Rumus | hari yang BENAR-BENAR berpindah x 500 XP (bawaan). Gift 1 hari x 1 orang = 500 XP, gift 7 hari = 3.500 XP |
| Giveaway | XP masuk LANGSUNG saat giveaway dikirim (jalankan giveaway-xp-kirim.sql). XP = hari x orang x tarif, maks 60.000 per giveaway. Tidak perlu diklaim, dan hadiah tidak terklaim tidak menarik XP kembali |
| Siapa dapat | Hanya PEMBERI. Penerima / pengklaim tidak dapat XP dari gift |
| Sekali bayar | Tiap transfer hanya dibayar sekali (`gift_xp_log.source_key` unik). Dobel panggil = 0 XP |
| Batas harian | 30.000 XP gift per akun per hari WIB (sama dengan batas gift langsung 60 hari/hari). Lewat batas = tidak dapat XP, gift tetap sukses |
| Leaderboard | XP gift TIDAK masuk Leaderboard / TOP LB. Hanya menambah XP total (level). Leaderboard hanya membaca `xp_daily` + `lb_adjust`, dan XP gift tidak menulis ke keduanya |
| Tidak menggagalkan gift | Kalau pemberian XP error, gift/klaim tetap sukses (muncul sebagai WARNING di log) |
| Dikunci | `user_xp_guard` hanya mengizinkan XP naik dari: sesi nonton (maks 150), Panel Developer, atau `grant_gift_xp()` (maks 15000). APK tidak bisa mengisi XP sendiri |

Gift dari Panel Developer (`dev_premium_gift`) TIDAK memberi XP.

## Ubah angka
Supabase > Table Editor > tabel `gift_xp_config` (1 baris): `xp_per_day` (0-500, 0 = matikan XP gift) dan `daily_cap` (0-100000). Berlaku langsung.
Catatan: 500 XP per hari adalah nilai maksimum yang diizinkan (`xp_per_day` maks 500). Untuk angka 500, jalankan juga `supabase/gift-xp-500.sql`.

## Pajak gift (diturunkan)
| Bagian total hari | Dulu | Sekarang |
|---|---|---|
| 0 - 5 | 50% | 20% |
| 5 - 15 | 60% | 25% |
| 15 - 30 | 70% | 30% |
| di atas 30 | 80% | 35% |
Contoh gift 1 hari: dulu dipotong 1h 12j, sekarang 1h 5j. Ubah lagi di tabel `gift_fee_tiers`.

## Tier ikon level (lebih sulit)
| Tier | Mulai level | Dulu |
|---|---|---|
| Batu Bara | 1 | 1 |
| Tembaga | 25 | 21 |
| Besi | 70 | 51 |
| Zamrud | 180 | 101 |
| Berlian | 360 | 201 |
| Netherite | 600 | 451 |
| Totem | 1.200 | 891 |
| Nether Star | 2.000 | 1.301 |
| Ember Lava | 3.500 | 2.001 |
| Bedrock | 6.000 | 4.001 |
Ubah di satu tempat: `TIER_DEFS` di `src/components/LevelBadge.jsx` (kolom `min`). Ikon, popup Level Progress, dan kilau mengikuti otomatis. Kurva XP per level tidak diubah.
