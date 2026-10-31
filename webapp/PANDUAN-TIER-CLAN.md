# Tier Badge Clan 1-20

## Pasang (urutan)
1. Supabase SQL Editor: jalankan `supabase/clan-tier20.sql` PALING AKHIR (setelah `clan-dev-xp-tier15.sql`, `clan-tier-terkunci.sql`, `clan-role.sql`; aman diulang).
2. Build ulang APK (`bash update.sh`).

## Tier baru (bentuk badan berbeda dari tier 1-15)
| Tier | Nama | Bentuk | Harga naik (XPGold) |
|---|---|---|---|
| 16 | Laurel | pita ekor walet + daun laurel + permata atas | 9.000.000 |
| 17 | Aurora | oval penuh + pita cahaya + bintang | 13.000.000 |
| 18 | Mecha | pelat bergigi roda + dudukan baut + garis neon | 19.000.000 |
| 19 | Thorn | bilah miring + cakar duri + kelopak | 28.000.000 |
| 20 | Zenith | segel bergelombang + mahkota permata + kilau lensa (berdenyut) | 40.000.000 |

Harga ada di `clan_config` (`tier_cost_16` .. `tier_cost_20`), terkunci oleh trigger yang sama dengan tier lain.

## Aturan emblem (tier 3 ke atas)
Posisi dan ukuran emblem DIHITUNG OTOMATIS di `src/lib/clanbadgeGeom.js` (`layoutBadge`): badan badge melebar sampai seluruh kotak emblem
berada di dalam badan dengan jarak aman dari garis tepi, apa pun rasio gambarnya. Lebar teks tag dihitung dari lebar huruf (W, M, I berbeda),
jadi tag 2-6 karakter selalu muat. Emblem juga di-clip ke badan sebagai pengaman terakhir.

## Tes otomatis (jalankan sebelum build kalau mengubah badge)
    node scripts/test-clanbadge.mjs
Memeriksa 20 tier x 10 tag x 7 rasio emblem: emblem & teks tidak keluar badan, emblem tidak menabrak teks, input aneh tidak error,
bentuk tier 16-20 tidak sama dengan tier lain. Gagal = exit 1.

## Menambah tier baru nanti
1. `clanbadgeGeom.js`: tambah nama di `TIER_NAMES` (MAX_TIER otomatis ikut), `EX/TOP/BOT`, `bodyPoly`, `innerPoly`, `endOf`.
2. `ClanBadge.jsx`: tambah warna di `METAL` + hiasan.
3. SQL: ubah batas di `clans_tier_check`, `clan_upgrade_tier`, `dev_clan_set_tier`, dan tambah `tier_cost_N`.
4. Jalankan tes di atas.
