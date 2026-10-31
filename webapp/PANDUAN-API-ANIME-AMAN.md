# API anime tidak ada di dalam APK

Aplikasi TIDAK lagi menyimpan alamat API anime. Semua permintaan (beranda, cari, detail, episode, stream, jadwal, genre) lewat Edge Function `anime-api` di Supabase, dan hanya pengguna yang sudah login yang boleh memakainya.

## Pasang (urutan)
1. Supabase > Edge Functions > **Secrets**: tambah `ANIME_API_BASE` = alamat API anime tanpa garis miring di akhir (berakhiran `/api`).
2. Supabase > Edge Functions > `anime-api` > tempel isi `supabase/functions/anime-api/index.ts` > **Deploy** (biarkan *Verify JWT* AKTIF). Lakukan juga untuk `episode-watch` (isinya ikut berubah).
3. `bash update.sh` (build ulang APK). Setting `VITE_ANIME_PROXY` sudah tidak dipakai (selalu lewat proxy).
4. Setelah semua jalan, hapus alamat bawaan di kedua file fungsi (bagian `|| 'https://...'`) kalau mau alamatnya benar-benar hanya ada di secret.

## Catatan
- Fungsi menyimpan cache singkat (beranda/genre/jadwal 5 menit, lainnya 1 menit; stream tidak di-cache) sehingga server API tidak ditembak berulang.
- Yang tidak bisa disembunyikan: alamat gambar poster dan link stream yang DIKEMBALIKAN API muncul di lalu lintas jaringan HP. Alamat endpoint API-nya sendiri tidak ada di APK.
- Folder `scripts/` (test-api.sh, test-search.sh) hanya alat bantu di komputermu, tidak ikut masuk APK.
