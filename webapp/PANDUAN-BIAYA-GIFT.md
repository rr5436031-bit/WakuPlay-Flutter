# Biaya Gift (giveaway "hari x orang" + gift langsung)

Pengirim dipotong **hari yang dikirim + biaya**; penerima tetap menerima hanya hari yang dikirim.
Contoh: giveaway/gift **1 hari x 1 orang** -> Premium pengirim berkurang **1 hari 5 jam**.

## Pasang (sekali)
1. Supabase SQL Editor: jalankan `supabase/biaya-gift.sql` (setelah `gift-premium.sql` dan `giveaway-premium.sql`). Aman diulang.
2. Build ulang APK (`bash update.sh`). Aplikasi lama yang belum diperbarui tetap aman: server yang menentukan biaya.

## Tarif bawaan (progresif per bagian total hari = hari x jumlah orang)
| Bagian total hari | Biaya |
|---|---|
| 0 - 5 | 20% |
| 5 - 15 | 25% |
| 15 - 30 | 30% |
| di atas 30 | 35% |

(Diturunkan dari 50/60/70/80% lewat `supabase/gift-xp.sql`.)

Dibulatkan ke atas per jam. Contoh dipotong dari pengirim: 1h x 1 = 1h 5j | 3h x 1 = 3h 15j | 3h x 2 = 7h 6j | 7h x 2 = 17h 6j | 30h x 1 = 38h | 30h x 2 = 78h 12j.

## Ubah tarif
Supabase > Table Editor > tabel `gift_fee_tiers` (kolom `from_days`, `rate`; 0.5 = 50%). Berlaku langsung untuk gift/giveaway berikutnya, tanpa deploy ulang.
Mau semua gratis lagi: hapus semua baris tabel itu.

## Aturan lain
* Sisa Premium pengirim harus lebih besar dari total potongan (hari + biaya).
* Giveaway tidak terklaim sampai habis waktu: hanya hari hadiah yang dikembalikan; biaya tidak dikembalikan.
* Top Giver / lencana tetap menghitung hari yang diterima orang lain (biaya tidak dihitung). Batas harian gift (10 gift / 60 hari) tetap menghitung hari yang dikirim saja.
* Biaya tiap transaksi tercatat di kolom `fee_hours` (tabel `giveaways` dan `premium_gifts`).
