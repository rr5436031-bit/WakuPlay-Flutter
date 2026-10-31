# Peringatan "Tidak dapat memverifikasi developer aplikasi"

Peringatan itu dari **Google/Android** (verifikasi developer), bukan karena isi kode. Di Indonesia aturannya mulai berlaku September 2026: aplikasi di luar Play Store dari developer yang belum terdaftar akan diberi peringatan. Kode tidak bisa menghilangkannya; yang bisa: daftarkan aplikasinya ke Google.

## Langkah (urut)
1. **Tanda tangan APK dengan kunci tetap** (sekali saja, sebelum daftar):
   `WP_SIGN=1 bash update.sh`
   - Kunci dibuat otomatis di `~/.wakuplay/` -> **BACKUP folder itu** (salin ke Download / simpan di Drive). Kalau hilang, aplikasi tidak bisa diupdate dan pendaftaran Google hangus.
   - Selalu pakai `WP_SIGN=1` setiap build berikutnya.
   - Karena kunci berubah dari kunci debug, pengguna lama harus **uninstall versi lama dulu** sekali (akun & data ada di server, aman).
2. **Daftar Android Developer Console** (developer.android.com/developer-verification), lalu daftarkan nama paket aplikasi + kunci tanda tangan:
   - **Verifikasi penuh** (identitas + biaya sekitar US$25): peringatan hilang untuk SEMUA pengguna. Ini yang menyelesaikan masalah "orang takut install".
   - **Akun gratis "limited distribution"** (tanpa KTP/biaya): hanya untuk maksimal 20 perangkat.
3. Pengguna yang tetap melihat peringatan: ketuk **Tetap instal** (di layar yang sama, tulisan kecil di bawah). Selama aplikasi belum terdaftar, bisa juga lewat Setelan > Opsi pengembang (alur "advanced flow" Android).

## Tips agar orang tidak takut
- Bagikan APK dari satu tempat resmi saja (mis. GitHub Releases / channel kamu) + tulis nama developer yang konsisten.
- Beri tahu cara: "Tetap instal" itu normal untuk aplikasi di luar Play Store.
