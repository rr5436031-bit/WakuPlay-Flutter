# Clan: tampilan baru, Pengaturan, Banner .gif

## Pasang
1. Supabase SQL Editor: jalankan `supabase/clan-pengaturan.sql` (SETELAH `wakugames-clan.sql` dan `clan-role.sql`; aman diulang).
2. Build ulang APK (`bash update.sh`). Tanpa SQL, tampilan baru tetap jalan tapi mode Tertutup dan banner belum aktif.

## Yang berubah
- Kartu atas halaman Clan dipugar: logo, nama, emblem + Lv + mode, progres level, 3 kotak (Total XP, Member, XPGold), tombol **Setor Gold** dan **Shop Clan**, tombol gear (hanya Leader & Vice Leader), dan **Keluar Clan** (bukan Leader). Banner clan jadi background kartu ini.
- Bubble di Top Clans lebih besar: emblem di baris atas (lebih besar, tidak terpotong), nama + Lv + anggota di bawah, banner jadi background bubble.
- Pengaturan Clan (gear): Mode gabung (Tertutup / Request / Terbuka), Banner clan, dan Bubarkan clan (khusus Leader, pindah dari Shop Clan).

## Aturan (server)
| Aturan | Isi |
|---|---|
| Mode gabung | hanya Leader & Vice Leader; nilai selain closed / request / open ditolak |
| Tertutup | tidak bisa masuk dan tidak bisa kirim permintaan; permintaan yang menunggu otomatis dihapus; menerima permintaan lama ditolak |
| Banner | hanya Leader & Vice Leader clan itu; Admiral, Officer, Member ditolak |
| Link banner | `https://domain/.../nama.gif`, maks 500 huruf, tanpa IP / port / user:pass@ / spasi (dicek di server dan aplikasi) |
| Anti spam | jeda 10 detik antar perubahan banner |
| Tabel clans | terkunci dari aplikasi; banner dan mode hanya lewat fungsi resmi |
| Bubarkan | hanya Leader asli dan hanya bila tidak ada anggota lain (aturan lama tetap) |

Catatan: batas ukuran gambar banner (maks 2000 px per sisi) dicek di aplikasi saat pratinjau, bukan di server.

## Ringan
- Banner dimuat saat bubble mendekati layar dan dilepas saat jauh (sama seperti background komentar). Mode Hemat = banner tidak ditampilkan.
