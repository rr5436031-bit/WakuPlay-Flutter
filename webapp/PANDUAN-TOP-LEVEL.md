# Top Level + XP Giveaway Langsung

## Urutan menjalankan SQL (Supabase > SQL Editor)
1. `supabase/top-level.sql`  : peringkat Top Level + badge (hanya membaca, aman diulang)
2. `supabase/giveaway-xp-kirim.sql` : XP giveaway cair saat kirim. Jalankan PALING TERAKHIR (setelah giveaway-xp.sql, biaya-gift.sql, giveaway-min5.sql)

## Banner Home
Slide 1 Top Anime, Slide 2 Top Leaderboard, Slide 3 Top Giver, **Slide 4 Top Level**. Klik slide 4 membuka halaman Top Level (100 besar, satu peringkat saja, tanpa harian/mingguan/bulanan).

## Badge TOP LEVEL
Muncul di profil peringkat 1-10, warna cyan, di samping badge TOP LB dan TOP GIVER. Tidak disimpan di database: dihitung ulang server setiap profil dibuka.

## Aturan Top Level
Lihat header `top-level.sql` (10 aturan). Intinya: urut XP total, akun diblokir / developer / admin tidak ikut, XP 0 tidak ikut, satu sumber urutan untuk slide, halaman, dan badge.

## Aturan XP giveaway langsung
Lihat header `giveaway-xp-kirim.sql` (11 aturan). Intinya: cair di transaksi yang sama dengan pembuatan giveaway, sekali per giveaway, maks 60.000 XP per giveaway, ada batas harian, tidak masuk Leaderboard, error XP tidak menggagalkan giveaway.

## XP nonton (xp-nonton-2menit.sql)
+500 XP tiap 2 menit penuh menonton.

## XP giveaway & gift bertingkat (xp-giveaway-bertingkat.sql, jalankan paling terakhir)
Penyebab XP sama: batas harian kecil (36.000). Sekarang tarif dasar 1000 XP/hari, batas harian 3.000.000, dan XP giveaway bertingkat per bagian hari (x1 sampai 25 hari, x1,15 sampai 100, x1,3 sampai 250, x1,5 di atasnya).
