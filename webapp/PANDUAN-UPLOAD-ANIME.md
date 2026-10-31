# Upload Anime (Panel Developer > tab "Upload Anime")

Tidak ada file mp4 yang diunggah. Kamu hanya menyimpan petunjuk episode di Supabase; aplikasi tetap memutar lewat API anime.

## Pasang (sekali)
1. Supabase > SQL Editor > jalankan `supabase/anime-tambahan.sql` (aman diulang).
2. Build ulang APK. Buka Panel Developer > tab **Upload Anime**; tutorial ada di bagian atas tab itu.

## Cara pakai
1. Cari anime tujuan (mis. Jujutsu Kaisen / Beelzebub). Panel menampilkan jumlah episode dan nomor yang kosong.
2. Pilih cara:
   - **Salin dari anime lain**: cari entri anime yang sama di API yang episodenya lengkap, isi rentang nomor sumber dan nomor tujuan. Beelzebub 1-30: sumber 1 sampai 30, tujuan mulai 1.
   - **ID episode API**: buka `https://animeinweb-api.vercel.app/api/anime/ID_ANIME/episodes` di browser, ambil "id" tiap episode, tulis `7 id-episode` per baris (Jujutsu Kaisen ep 7). Link `.../api/episode/ID/stream` utuh juga boleh ditempel.
   - **Link stream** (https, m3u8 / embed): `7 https://...`, atau pakai template dengan `{n}` lalu "Isi otomatis".
3. Simpan. Nomor yang sama MENGGANTIKAN episode dari API; hapus dengan tombol ✕ atau "Hapus semua tambahan".

## Aturan ketat (dicek di server)
- Hanya developer yang bisa menulis/menghapus; tabel tertutup untuk akses langsung.
- Nomor 1-99999, maksimal 200 episode per kirim, nomor dobel ditolak.
- ID episode API hanya huruf/angka/`_ : . -`; link wajib `https://` tanpa spasi atau tanda kutip.
- Kalau tabel belum dibuat atau offline, daftar episode API tetap tampil seperti biasa.
