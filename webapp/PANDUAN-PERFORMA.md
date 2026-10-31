# Performa (efek & animasi tetap, cara menggambarnya lebih murah)

- **Cahaya badge clan**: tidak lagi pakai CSS `filter: drop-shadow` (digambar ulang tiap frame kilau, berat kalau banyak badge). Sekarang gradien radial statis di dalam SVG
  (`.cb-halo` di `ClanBadge.jsx`), lebih lembut. Atur kekuatan di variabel `haloA` (rare .16, legend .22, mythic .30, tier 4-10 .16, 11-14 .20, 15+ .24).
- **ClanBadge** dibungkus `React.memo`: tidak digambar ulang kalau datanya sama.
- **Animasi dijeda otomatis** saat aplikasi di latar belakang / layar mati (kelas `app-bg`, `lib/perf.js`).
- **Pesan chat** di luar layar tidak digambar (`content-visibility`), kilau badge hanya jalan di pesan terakhir.
- **Kode dipecah**: halaman Jadwal, Riwayat, Favorit, Akun, Cari, Detail, Player ikut dimuat malas (lazy) dan disiapkan saat aplikasi tenang; pustaka besar (react, supabase, capacitor) dipisah jadi chunk sendiri
  (`vite.config.js`). Awal buka aplikasi lebih cepat karena JavaScript yang harus diproses di awal lebih sedikit.
