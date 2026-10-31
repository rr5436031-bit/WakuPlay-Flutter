# Tambah anime baru (Panel Developer > Anime Baru)

Untuk anime yang **belum ada sama sekali** di API. (Episode kosong/rusak di anime yang sudah ada tetap lewat tab Upload Anime.)

## Pasang sekali
1. Jalankan `supabase/anime-baru-notif.sql` di SQL Editor Supabase (setelah `anime-tambahan.sql` dan `notifikasi-supabase.sql`). Aman diulang.
2. `bash update.sh` (build ulang).

## Cara pakai
1. Panel Developer > tab **Anime Baru**: isi judul, link poster, sinopsis, pilih genre (1-5), status, tipe > **Tambah anime & kirim notifikasi**.
2. Buka tab **Upload Anime**, cari judul anime itu, pilih **Link stream**, isi episodenya. Episode baru otomatis memberi notifikasi ke yang memfavoritkan / menonton.
3. Anime tampil di beranda (daftar terbaru / New Eps Anime), pencarian (paling atas), dan halaman detail.

## Aturan ketat (dicek di aplikasi DAN di server)
- Judul 2-120 huruf, tanpa `<` `>`, tidak boleh kembar dengan anime buatan lain; juga ditolak kalau judul yang sama persis sudah ada di API.
- Poster: link `https://` langsung ke gambar (.jpg .png .webp .gif .avif).
- Sinopsis 30-2000 huruf, tanpa tag HTML. Genre 1-5, tidak dobel.
- Maksimal 500 anime buatan. Tabel tertutup; tulis/ubah/hapus hanya developer lewat fungsi server.
- Anime baru yang disimpan otomatis mengirim notifikasi "Anime baru" ke semua pengguna. Mengubah anime tidak mengirim notifikasi. Menghapus anime juga menghapus episode tambahan dan notifikasinya.

## New Eps Anime di beranda
- Anime baru (tab Anime Baru) langsung masuk daftar. Episode baru yang disimpan di tab Upload Anime (nomor yang belum pernah diupload) juga membuat anime itu muncul di "New Eps Anime" selama 14 hari, lengkap dengan lencana "Eps N", walau anime itu berasal dari API.
- Wajib: jalankan ulang `supabase/anime-baru-notif.sql` (membuat tabel `new_eps_feed` + fungsi `new_eps_latest`). Tanpa ini beranda tetap jalan, tapi episode tambahan tidak masuk "New Eps Anime".
- Beranda mengambil data ulang setiap kamu kembali ke beranda, jadi tidak perlu restart aplikasi.
