# Notifikasi WakuPlay TANPA Firebase (hanya Supabase)

Jenis notifikasi: **tag (mention), balasan komentar, anime baru, episode baru, permintaan teman (dan diterima), permintaan masuk clan (untuk pengurus), chat pribadi**.

## Cara kerja
```
kejadian -> baris baru di tabel notifications (trigger database)
  - aplikasi terbuka / masih hidup di latar : Realtime Supabase -> langsung muncul (notifikasi sistem kalau aplikasi di latar)
  - aplikasi ditutup                         : plugin Android "wp-notify" bertanya ke server tiap ~5 menit (RPC notif_poll)
                                               memakai KUNCI PERANGKAT, lalu menampilkan notifikasi di panel notifikasi / control center
anime & episode baru: pg_cron tiap 10 menit -> Edge Function episode-watch -> episode_watch_apply (SQL)
```
- **Kunci perangkat**: dibuat server saat login (`notif_device_register`), disimpan hanya di HP; server hanya menyimpan hash-nya. Dicabut saat logout. Tidak memakai token login, jadi tidak kedaluwarsa dan tidak mengganggu sesi aplikasi.
- Tanpa Firebase berarti **tidak ada kiriman instan saat aplikasi benar-benar mati**: notifikasi datang dalam kira-kira 5 menit (Android bisa menunda sampai ~15 menit saat HP diam / hemat baterai). Saat aplikasi terbuka atau masih di latar, notifikasi instan.
- Notifikasi yang sudah ditampilkan aplikasi tidak ditampilkan dua kali; yang sudah dibaca tidak dimunculkan.

## Pasang (urutan)
1. **SQL** (Supabase > SQL Editor): jalankan `supabase/notifikasi-supabase.sql` PALING AKHIR (setelah `notifikasi.sql`, `push.sql`, `lapor-request-tag.sql`, `balasan.sql`, `wakugames-clan.sql`, `clan-role.sql`). Aman diulang. File ini juga mematikan push Firebase lama.
2. **Anime & episode baru** (kalau belum pernah): deploy Edge Function `supabase/functions/episode-watch/index.ts` (matikan Verify JWT), isi secret `PUSH_SECRET`, isi `push_config` (`watch_url`, `push_secret`) dan jadwalkan pg_cron tiap 10 menit seperti di bawah. Fungsi `push-send` (Firebase) sudah dihapus; kalau pernah di-deploy, hapus saja di Dashboard.
```sql
insert into public.push_config (key, value) values
  ('watch_url',   'URL_ASLI_FUNGSI_episode-watch'),
  ('push_secret', 'ISI_SAMA_DENGAN_PUSH_SECRET')
on conflict (key) do update set value = excluded.value;
create extension if not exists pg_cron;
select cron.schedule('episode-watch', '*/10 * * * *', $cron$
  select net.http_post(
    url := (select value from public.push_config where key = 'watch_url'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', (select value from public.push_config where key = 'push_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
$cron$);
```
3. **Build ulang APK**: `bash update.sh`. Tidak perlu `google-services.json`; skrip membersihkannya kalau ada.
4. Pasang APK, login, izinkan notifikasi saat diminta.
5. **Penting di HP**: Pengaturan > Notifikasi > "Notifikasi saat aplikasi ditutup" > pilih WakuPlay > **Tidak dibatasi / Jangan optimalkan**. Di Xiaomi/Oppo/Vivo/Realme/Samsung aktifkan juga "Mulai otomatis" dan kunci aplikasi di recent. Tanpa ini sistem Android bisa menghentikan pengecekan.

## Uji
1. Akun A tutup aplikasi (swipe dari recent). Akun B menambahkan A sebagai teman -> tunggu ~5 menit -> notifikasi muncul. Ketuk -> buka daftar teman.
2. Tag: B menandai A di Chat Global. Balasan: B membalas komentar A di sebuah episode. Clan: B minta masuk clan A (A pengurus). Chat pribadi: B kirim pesan ke A.
3. Cek di SQL: `select user_id, device_id, last_poll_at from public.notif_devices;` -> `last_poll_at` harus terus bergerak.

## Pilihan di Pengaturan
Tiap jenis bisa dimatikan sendiri-sendiri (tag, balasan, teman, clan, chat pribadi, anime baru, episode baru). Pilihan dikirim ke server dan dipakai saat pengecekan di latar.

## Keamanan
- Tabel `notif_devices` tertutup untuk akses langsung; hanya fungsi `notif_device_*` dan `notif_poll`.
- `notif_poll` hanya mengembalikan notifikasi milik pemilik kunci, belum dibaca, maksimal 15 per pengecekan dan 3 hari terakhir.
- Maksimal 5 perangkat per akun; perangkat 90 hari tidak aktif dibersihkan otomatis.

## Pembaruan v1.5.2
- **Notifikasi sistem walau aplikasi dibuka**: notifikasi baru (tag, balasan, chat, teman, clan, anime/episode baru) selalu muncul di panel notifikasi / control center HP, baik aplikasi dibuka maupun di latar. Banner di dalam aplikasi hanya cadangan kalau izin notifikasi belum diberikan.
- **Lebih cepat & tahan putus**: Realtime menyambung ulang otomatis kalau terputus, ditambah pengecekan ringan tiap 15 detik saat aplikasi terbuka (hanya mengambil yang lebih baru).
- **Popup izin** muncul setiap aplikasi dibuka selama izin belum diberikan ("Nanti saja" hanya sampai aplikasi ditutup). Kalau izin terlanjur diblokir, tombolnya membuka pengaturan notifikasi HP (paling sering sekali tiap 3 hari). Perlu build APK ulang karena ada tambahan di plugin native.
- **Pengaturan**: tombol per jenis dihapus, diganti SATU tombol Notifikasi (hidup = semua jenis). Menyalakannya sekaligus meminta izin HP.
- **Episode baru dari Panel Developer**: menyimpan episode di tab Upload Anime otomatis memberi notifikasi ke yang memfavoritkan / menonton anime itu (satu notifikasi untuk nomor baru tertinggi; ada kotak centang untuk mematikan). Jalankan `supabase/anime-baru-notif.sql`.
- Perbaikan kecil: nomor episode kelipatan 10 (10, 20, 100) di notifikasi server sebelumnya tertulis "Episode 1/2". Jalankan ulang `supabase/notifikasi-supabase.sql` untuk memperbaikinya.

## Pembaruan v1.5.5 (perbaikan izin & tombol notifikasi)
- **Masalah**: izin notifikasi sudah dinyalakan di pengaturan HP, tetapi tombol Notifikasi di dalam aplikasi tetap mati, tidak bisa dinyalakan, dan popup izin tidak muncul. Penyebab: pengecekan izin bisa gagal/menggantung (pemuatan modul notifikasi atau panggilan native tidak menjawab), sehingga status izin tidak pernah terbaca.
- **Perbaikan**:
  - Pengecekan izin sekarang tidak pernah melempar error dan tidak pernah menggantung (batas waktu 2,5 detik per panggilan native); modul notifikasi dimuat langsung (bukan impor dinamis).
  - Tombol Notifikasi di Pengaturan mengikuti pilihan pengguna; hanya mati kalau izin HP memang belum aktif. Menyalakannya meminta izin; kalau diblokir sistem, otomatis membuka pengaturan notifikasi HP. Status diperbarui otomatis saat kembali ke aplikasi.
  - Muncul baris "Buka pengaturan notifikasi HP" di Pengaturan selama izin belum aktif.
  - Popup izin muncul setiap aplikasi dibuka selama izin belum aktif (termasuk saat sudah diblokir; tombolnya "Buka Pengaturan"). "Nanti saja" hanya sampai aplikasi ditutup.
- Build ulang APK: `bash update.sh` (versi APK 1.5.5, versionCode 10505).

## Pembaruan v1.5.6 (notifikasi saat aplikasi ditutup tidak lagi telat)
- **Masalah**: notifikasi baru datang setelah lebih dari 1 jam. Penyebab: pengecekan saat aplikasi ditutup memakai alarm Android biasa yang ditunda Doze / penghemat baterai (terutama ColorOS/Oppo).
- **Perbaikan**: plugin `wp-notify` sekarang punya **layanan latar permanen** (`PollService`, foreground service) yang menanyakan server **tiap 5 detik** walau aplikasi ditutup. Akibatnya ada notifikasi kecil senyap "WakuPlay aktif" di panel notifikasi (wajib dari Android untuk layanan latar; bisa disembunyikan lewat pengaturan saluran "WakuPlay aktif di latar").
- Alarm 5 menit tetap ada sebagai **penjaga** yang menghidupkan layanan kalau sempat dimatikan sistem. Layanan juga hidup lagi setelah HP restart / aplikasi diperbarui.
- **Pengaturan > Kecepatan notifikasi**: Cepat (5 detik, bawaan), Normal (30 detik), Hemat (~5 menit, tanpa layanan latar, bisa tertunda lama). Pilih Hemat kalau baterai terasa boros.
- Setelah izin notifikasi diberikan, aplikasi sekali meminta izin "berjalan di latar / Tidak dibatasi". Tombol "Notifikasi saat aplikasi ditutup" membuka dialog yang sama lagi.
- **Di HP Oppo/Realme/Xiaomi/Vivo**: aktifkan juga "Mulai otomatis" (Auto-start) untuk WakuPlay dan kunci aplikasi di recent, kalau tidak sistem bisa tetap mematikan layanan.
- Notifikasi yang sama dari aplikasi dan dari layanan latar memakai ID yang sama, jadi tidak muncul dobel.
- **SQL (disarankan)**: jalankan ulang `supabase/notifikasi-supabase.sql` agar `last_poll_at` hanya ditulis maksimal 1x/menit (pengecekan 5 detik jadi tidak membebani database).
- Perlu **build APK ulang** (`bash update.sh`, versi 1.5.6, versionCode 10506) karena ada perubahan di plugin native dan manifest.

## Pembaruan v1.5.7 (notifikasi episode baru dari Panel Developer)
- **Masalah**: menambah episode baru di Panel Developer > Upload Anime tidak memunculkan notifikasi. Penyebab yang ditangani: (1) penerima hanya yang memfavoritkan / menonton anime itu, jadi kalau tidak ada, hasilnya diam-diam 0 penerima dan developer sendiri tidak dapat apa-apa; (2) kalau pengguna pernah dapat notifikasi nomor yang sama (mis. episode dihapus lalu ditambah lagi), notifikasi baru dilewati tanpa kabar; (3) tidak ada keterangan jumlah penerima.
- **Perbaikan** (WAJIB jalankan `supabase/episode-notif-fix.sql` di SQL Editor Supabase; aman diulang):
  - Developer yang menyimpan ikut menerima notifikasinya (bukti terkirim). Penerima lain: yang memfavoritkan dan yang menonton anime itu dalam 180 hari terakhir.
  - Kotak centang baru "Kirim ke SEMUA pengguna" di tab Upload Anime.
  - Nomor episode yang pernah dikirim akan dimunculkan lagi (bukan dilewati).
  - Setelah simpan, panel menampilkan jumlah penerima, atau alasan kalau tidak ada notifikasi (semua nomor sudah pernah ada = hanya mengganti episode).
  - Kalau fungsi database belum diperbarui, panel menampilkan pesan jelas untuk menjalankan SQL di atas.
- Notifikasi episode hanya dikirim untuk nomor yang BELUM pernah ada di daftar episode tambahan anime itu. Mengganti link episode lama tidak memicu notifikasi.
- Versi APK 1.5.7 (versionCode 10507). Build ulang: `bash update.sh`.
