# Background Komentar Teman + Ringkasan Giveaway

## Pasang
1. Supabase SQL Editor: jalankan `supabase/background-komentar-teman.sql` (aman diulang).
2. Build ulang APK (`bash update.sh`).

## Apa yang berubah
- Komentar teman di halaman Akun sekarang punya background wallpaper gacha pemilik komentar, sama seperti komentar anime.
- Wallpaper dari Custom URL tidak pernah dipakai (sama seperti komentar anime).
- Popup Buat Giveaway: kotak ringkasan baru (Penerima, Total Biaya, Bonus XP). Bagian lain popup tidak berubah.

## Kenapa tidak berat
- Satu permintaan untuk semua komentar di layar (digabung 80 ms, maks 100 user), disimpan 5 menit.
- Gambar baru dipasang saat komentar mendekati layar dan dilepas saat jauh (`CmBg`), jadi GIF di luar layar tidak memakan memori.
- Tanpa blur / filter / animasi tambahan. Mode Hemat = background tidak ditampilkan.

## Aturan anti-hack
| Aturan | Dijaga oleh |
|---|---|
| Hanya wallpaper gacha yang dimiliki pemilik komentar | server (`wp_banner_owned`) |
| Custom URL tidak pernah tampil di komentar | server |
| Link harus https, tanpa spasi, maks 500 huruf | server + aplikasi (link aneh dibuang) |
| Maks 100 user per permintaan, daftar kosong aman | server |
| Akun diblokir tidak menampilkan background | server (`is_banned`) |
| Tabel `profiles` tidak bisa diubah dari aplikasi | server (revoke), banner hanya lewat `set_my_banner()` |
| Aplikasi hanya mengirim ID berbentuk UUID | aplikasi |
| Total Biaya & Bonus XP di popup hanya pratinjau; angka sebenarnya dihitung ulang server | server |

---

# Sematan (Pin) Komentar + Threads tanpa navigasi

## Pasang
1. Supabase SQL Editor: jalankan `supabase/pin-komentar.sql` (aman diulang). Tanpa ini feed tetap normal, hanya fitur pin yang belum aktif.
2. Build ulang APK.

## Cara pakai (admin/developer)
Tekan lama komentar admin/developer di halaman Akun -> Sematkan / Lepas sematan. Komentar tersemat tampil paling atas dengan tulisan "Disematkan" untuk semua orang. User biasa & moderator tidak punya tekan-lama sama sekali.

## Aturan ketat (server)
| Aturan | Isi |
|---|---|
| Siapa yang boleh | hanya role admin / developer, tidak sedang diblokir |
| Yang boleh disematkan | hanya komentar utama milik admin/developer (komentar teman biasa tidak dibuka ke orang lain), balasan tidak bisa |
| Batas | maks 3 sematan; penuh = pesan "Maksimal 3 sematan", bukan error |
| Akses tabel | `comment_pins` terkunci, hanya lewat `pin_comment`, `unpin_comment`, `get_pinned_feed` |
| Hilang otomatis | komentar dihapus, pemilik bukan admin/developer lagi, atau pemilik diblokir |
| Aman dari bug | semua jawaban `{ ok, code }`; menyematkan 2x tidak dobel; kalau SQL belum dijalankan, feed tetap tampil |

## Threads
Saat Threads dibuka dari komentar teman di halaman Akun, navigasi bawah disembunyikan dan kembali otomatis saat Threads ditutup.
