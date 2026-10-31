
export const NEWS = [
  { date: '2026-10-28', text: 'Pet kini menghasilkan WakuGold! Pasang pet di habitat, klaim hasilnya, dan lihat peliharaan pemain lain dari profilnya.' },
  { date: '2026-10-28', text: 'Pet hadir di WakuGames: gacha pet dengan WakuGold, lalu lihat pet-mu berdiri di habitat.' },
  { date: '2026-10-27', text: 'Info! kini punya panduan Badge Profil, dan tombol Info ada di menu WakuGames.' },
  { date: '2026-10-26', text: 'Halaman Info! hadir: tutorial semua game WakuGames dalam satu tempat.' },
  { date: '2026-10-26', text: 'Avatar Border kini bertambah dari waktu ke waktu. Urutkan Shop dengan "Terbaru" untuk melihat yang paling baru.' },
]

export const GAME_INFO = [
  {
    id: 'start', title: 'Mulai di Sini', tagline: 'WakuGold, XPGold, dan cara kerjanya', accent: '#f5b50a', updated: '2026-10-26',
    topics: [
      {
        id: 'wakugold', title: 'WakuGold: mata uang utama',
        summary: 'Dipakai di hampir semua game.',
        steps: [
          'WakuGold adalah mata uang WakuGames. Saldomu selalu tampil di kartu atas halaman WakuGames.',
          '**Cara dapat:** panen wortel di Kebun Waku, klaim Daily Clan, dan pengembalian otomatis saat gacha wallpaper memberi duplikat.',
          '**Dipakai untuk:** buat clan, setor ke clan, upgrade kebun dan beli dekorasi, summon wallpaper, serta beli Avatar Border.',
        ],
        tips: ['Klaim Daily Clan dan panen kebun rutin: itu cara paling stabil mengumpulkan WakuGold.'],
      },
      {
        id: 'xpgold', title: 'XPGold: kas milik clan',
        summary: 'Bukan saldo pribadi, tapi saldo bersama satu clan.',
        steps: [
          'XPGold masuk ke clan saat anggota **menyetor WakuGold**. Tarif setor tertera di layar Setor Gold.',
          'XPGold dipakai **Leader** untuk menambah slot anggota, menaikkan tier badge, dan Gacha Warna.',
          'Memakai XPGold **tidak mengurangi Total XP**, jadi peringkat Top Clans tetap aman.',
        ],
      },
      {
        id: 'adil', title: 'Soal peluang dan keamanan',
        steps: [
          'Hasil gacha diundi secara adil oleh sistem WakuPlay. Peluang yang ditampilkan adalah angka sebenarnya.',
          'Pembelian penting meminta konfirmasi dulu. WakuGold baru berkurang setelah kamu menyetujui.',
          'Pratinjau (misalnya Avatar Border) selalu gratis.',
        ],
      },
    ],
  },

  {
    id: 'clans', route: 'clans', title: 'Clan', tagline: 'Bangun tim, naik ke Top Clans', accent: '#7c8cff', updated: '2026-10-26',
    topics: [
      {
        id: 'buat', title: 'Buat Clan',
        summary: 'Jadi Leader clanmu sendiri.',
        steps: [
          'Buka **WakuGames > Clan**. Tombol **Buat Clan** (lengkap dengan biayanya) muncul kalau kamu belum punya clan.',
          'Isi **Tag** (2 sampai 6 huruf atau angka, otomatis kapital) dan **Nama** (3 sampai 20 karakter: huruf, angka, spasi, - _ .).',
          'Lihat pratinjau badge, tekan **Buat Clan**, lalu setujui pembayaran di konfirmasi.',
          'Selesai! Kamu otomatis menjadi **Leader**.',
        ],
        tips: ['Satu akun hanya bisa berada di satu clan.'],
        warn: 'Biaya pembuatan dipotong sekali dan tidak bisa dibatalkan.',
      },
      {
        id: 'gabung', title: 'Gabung Clan',
        summary: 'Cari clan yang cocok dan masuk.',
        steps: [
          'Di halaman Clan, pilih clan dari daftar **Top Clans** atau tekan **Cari Clan** lalu ketik tag atau namanya.',
          'Ketuk clan untuk melihat level dan jumlah anggota (anggota/slot). Pastikan masih ada slot kosong.',
          '**Clan terbuka:** tekan tombol gabung, kamu langsung masuk.',
          '**Clan perlu persetujuan:** tekan **Minta bergabung** dan tunggu Leader menerima. Kamu bisa **Batalkan permintaan** kapan saja.',
        ],
      },
      {
        id: 'daily', title: 'Daily Clan',
        summary: 'Hadiah WakuGold rutin untuk anggota.',
        steps: [
          'Kartu **Daily Clan** ada di halaman clanmu. Saat timer habis tombolnya berubah jadi **Klaim**.',
          'Klaim bisa dilakukan sekali tiap beberapa jam. Ketuk kartunya untuk melihat **Aturan Daily Clan** dan tabel hadiah per level.',
          '**Baru masuk clan?** Tunggu dulu sampai waktu tunggu pertama selesai.',
          'Keluar atau pindah clan **tidak mereset** timer, jadi tidak ada trik untuk klaim lebih cepat.',
          'Besar hadiah mengikuti **level clan** saat kamu klaim. Waktu mengikuti jam sistem.',
        ],
        tips: ['Clan yang levelnya tinggi memberi hadiah harian lebih besar, jadi ajak teman untuk menyetor.'],
      },
      {
        id: 'setor', title: 'Setor Gold dan Top Clans',
        summary: 'Cara menaikkan XP clan.',
        steps: [
          'Di halaman clan, tekan **Setor Gold**, isi jumlah WakuGold (ada minimal setor), lalu konfirmasi.',
          'WakuGold berubah menjadi **XPGold** sesuai tarif yang tertera. XPGold masuk ke kas clan.',
          'Setoran menambah **Total XP**. Peringkat **Top Clans** diurutkan dari Total XP.',
          'Riwayat setoran dan perubahan XPGold bisa dilihat di halaman clan.',
        ],
      },
      {
        id: 'shop', title: 'Shop Clan (Leader)',
        summary: 'Slot anggota, tier badge, warna clan.',
        steps: [
          '**Slot anggota:** tekan **Beli slot** untuk menambah kapasitas anggota, sampai batas maksimal.',
          '**Tier badge:** mengubah bentuk emblem clan di komentar, chat, dan profil. Naik satu tier setiap kali.',
          '**Warna clan:** tekan **Gacha Warna** untuk memutar warna badge dengan XPGold (lihat topik berikutnya).',
          '**Bubarkan clan:** hanya bisa saat tidak ada anggota lain. Sisa XPGold hangus.',
        ],
        warn: 'Hanya Leader yang bisa memakai Shop Clan. Anggota lain bisa melihat hasilnya.',
      },
      {
        id: 'warna', title: 'Gacha Warna Clan',
        steps: [
          'Buka **Shop Clan > Gacha Warna**. Pilih **Spin ×1** atau **Spin ×5** (lebih hemat).',
          'Warna punya tingkat **Common, Rare, Legend, Mythic**. Makin langka makin cerah dan mengkilap.',
          'Dapat warna yang sama? Sebagian XPGold dikembalikan.',
          'Tekan warna di koleksi untuk memakainya sebagai warna badge clan.',
        ],
      },
      {
        id: 'kelola', title: 'Kelola Anggota (Leader)',
        steps: [
          'Atur mode gabung: **Terbuka** (siapa saja langsung masuk) atau **Perlu persetujuan Leader**.',
          'Di tab permintaan, ketuk **Terima** atau tolak calon anggota.',
          'Ketuk anggota untuk **mengeluarkan** atau **memindahkan kepemimpinan**.',
          'Anggota biasa bisa keluar lewat tombol **Keluar dari clan** di bagian bawah halaman clan.',
        ],
      },
    ],
  },

  {
    id: 'farm', route: 'farm', title: 'Kebun Waku', tagline: 'Panen wortel jadi WakuGold', accent: '#3fc46c', updated: '2026-10-26',
    topics: [
      {
        id: 'mulai', title: 'Mulai Menanam',
        steps: [
          'Kebun awalnya kosong. Tekan **Tanam** (upgrade ke level 1) dan bayar dengan WakuGold untuk mulai menanam wortel.',
          'Wortel berbuah **tiap beberapa menit** dan menumpuk di keranjang, **walau aplikasi ditutup**.',
        ],
      },
      {
        id: 'panen', title: 'Panen',
        steps: [
          'Tekan **Panen** untuk menukar semua wortel di keranjang menjadi WakuGold. Nilai tukarnya tertera di tombol dan di Cara main.',
          '**Keranjang penuh = produksi berhenti.** Jadi panen sebelum penuh supaya tidak ada waktu terbuang.',
        ],
        tips: ['Makin besar keranjang, makin lama kamu boleh meninggalkan kebun.'],
      },
      {
        id: 'upgrade', title: 'Upgrade Kebun',
        steps: [
          'Tekan **Upgrade**. Layar perbandingan menampilkan kondisi sekarang dan sesudah upgrade.',
          'Tiap level: **waktu berbuah lebih singkat**, **wortel per panen lebih banyak**, dan **keranjang lebih besar**.',
          'Bayar dengan WakuGold. Saat tombol bertuliskan **MAX**, kebunmu sudah level tertinggi.',
        ],
      },
      {
        id: 'dekor', title: 'Toko Dekorasi',
        steps: [
          'Tekan **Toko** untuk membuka dekorasi. Pilih kategori: **Pagar, Lampu, Pohon, Pet, Orang**.',
          'Ketuk item untuk **pratinjau** langsung di kebunmu. Tiap item punya tingkat kelangkaan.',
          'Tekan **Beli** (kalau WakuGold cukup). Item yang sudah dimiliki bisa **Pasang** atau **Copot**.',
        ],
      },
    ],
  },

  {
    id: 'gacha', route: 'gacha', title: 'Gacha Wallpaper', tagline: 'Koleksi banner profil impianmu', accent: '#4a8dff', updated: '2026-10-26',
    topics: [
      {
        id: 'summon', title: 'Summon Wallpaper',
        steps: [
          'Buka **WakuGames > Gacha Wallpaper**, lalu pilih **Summon 1x** atau **Summon 10x** (biayanya tertera di tombol).',
          'Hasil diundi secara adil oleh sistem. Ada 5 tingkat: **Common, Rare, Epic, Legendary, Mythic**.',
          'Wallpaper yang kamu dapat langsung masuk ke koleksi.',
        ],
      },
      {
        id: 'peluang', title: 'Peluang dan Duplikat',
        steps: [
          'Peluang tiap tingkat tampil di bagian **Peluang Summon**. Ketuk **Peluang tiap wallpaper** untuk melihat rincian per gambar.',
          'Dapat wallpaper yang **sudah dimiliki**? Sebagian WakuGold dikembalikan otomatis (persentasenya tertera).',
          'Jumlah duplikat ditandai **x2, x3, dst.** di kartu koleksi.',
        ],
      },
      {
        id: 'banner', title: 'Pasang Jadi Banner Profil',
        steps: [
          'Ketuk wallpaper di koleksi untuk memperbesarnya.',
          'Tekan **Pasang jadi banner profil**. Banner langsung tampil di profilmu.',
        ],
        tips: ['Wallpaper bergerak (GIF) juga bisa dikoleksi dan dipasang.'],
        warn: 'Memasang banner profil hanya untuk akun **Premium** (dan tim WakuPlay). Mengoleksi wallpaper tetap bebas untuk semua.',
      },
    ],
  },

  {
    id: 'pet', route: 'pet', title: 'Pet', tagline: 'Kumpulkan pet, lihat di habitat', accent: '#2fd6a6', added: '2026-10-28', updated: '2026-10-28',
    topics: [
      {
        id: 'gacha', title: 'Gacha Pet', isNew: true,
        steps: [
          'Buka **WakuGames > Pet** lalu tekan tombol **Gacha**.',
          'Pilih **1x** atau **10x**. Harga tertera di tombol dan WakuGold langsung berkurang saat telur dibuka.',
          'Hasil diundi di server. Peluang tiap rarity tertera di **Katalog** dan itu angka sebenarnya.',
          'Dapat pet yang sama lagi? Jumlahnya bertambah (tertulis **×2**, **×3**, dst).',
        ],
        tips: ['Hasil 10x ditampilkan sekaligus, pet langka berada di urutan rarity tertinggi.'],
      },
      {
        id: 'habitat', title: 'Habitat: Pasang dan Simpan', isNew: true,
        steps: [
          'Pet hasil gacha masuk ke **Penyimpanan**. Buka **Kelola** lalu tekan **Pasang** supaya pet berdiri di habitat.',
          'Pet kembar di Penyimpanan ditumpuk (**×2**, **×3**), tapi di habitat tiap pet berdiri **sendiri-sendiri**.',
          'Habitat punya jumlah slot terbatas (tertera di tombol **Kelola**). Penuh? **Simpan** satu pet dulu.',
          'Pet di habitat berjalan bebas ke segala arah. Gerakan berhenti saat popup terbuka atau di mode Hemat.',
        ],
      },
      {
        id: 'income', title: 'WakuGold dari Pet', isNew: true,
        steps: [
          'Pet yang **terpasang** menghasilkan WakuGold. Hitung mundur mulai saat pet dipasang (lihat di **Kelola**).',
          'Pet yang sudah waktunya **berkoin**. Ketuk pet itu, atau tekan **Klaim** di Kelola, atau **Klaim semua WakuGold** untuk sekaligus.',
          'Jumlahnya **diundi server** di antara pendapatan minimum dan maksimum pet itu, jadi tiap klaim bisa berbeda.',
          'Setelah klaim, hitung mundur mulai lagi dari saat klaim. Hadiah yang telat diambil **tidak menumpuk**.',
        ],
        tips: ['Pet yang sudah siap klaim tidak bisa disimpan sebelum diklaim. Pet yang disimpan tidak menghitung waktu.'],
      },
      {
        id: 'katalog', title: 'Katalog dan Lihat Pet Orang', isNew: true,
        steps: [
          'Buka **Katalog** untuk semua pet. Pet yang belum dimiliki tampil sebagai **?** sampai kamu mendapatkannya.',
          'Di profil orang lain, tekan **Lihat Peliharaan** untuk melihat pet yang mereka pasang. Ini **mode lihat saja**.',
          'Pemain lain tidak bisa melihat WakuGold, waktu klaim, atau isi Penyimpanan-mu, dan tidak bisa mengubah apa pun.',
        ],
      },
    ],
  },

  {
    id: 'avborder', route: 'avatarborder', title: 'Avatar Border', tagline: 'Percantik foto profilmu', accent: '#d9a0ff', updated: '2026-10-26',
    topics: [
      {
        id: 'beli', title: 'Beli Border',
        steps: [
          'Buka **WakuGames > Avatar Border** dan masuk ke tab **Shop**.',
          'Cari lewat kolom pencarian, saring berdasarkan **rarity**, atau pilih **Urutkan**: **Terbaru, Harga termurah, Harga termahal, Rarity**.',
          'Ketuk border untuk **pratinjau gratis** di foto profilmu.',
          'Tekan **Beli** dan setujui konfirmasi. WakuGold baru berkurang setelah kamu menyetujui.',
        ],
        tips: ['Border baru ditambahkan dari waktu ke waktu. Pilih urutan **Terbaru** untuk melihatnya duluan.'],
      },
      {
        id: 'pakai', title: 'Pakai dan Lepas',
        steps: [
          'Buka tab **Koleksi** untuk melihat semua border yang kamu miliki.',
          'Ketuk border lalu tekan **Pakai**. Hanya satu border yang aktif pada satu waktu.',
          'Mau melepasnya? Tekan **Lepas**.',
        ],
      },
      {
        id: 'tampil', title: 'Di Mana Border Tampil?',
        steps: [
          'Border mengitari fotomu di **komentar, chat, profil, daftar teman, dan clan**, dan bisa dilihat pemain lain.',
          'Foto yang sangat kecil tidak diberi border supaya tetap rapi.',
        ],
      },
    ],
  },

  {
    id: 'badge', title: 'Badge Profil', tagline: 'Arti semua lencana di profilmu', accent: '#ffcf5a', updated: '2026-10-27', added: '2026-10-27',
    topics: [
      {
        id: 'centang', title: 'Centang di Samping Nama',
        summary: 'Warna centang menunjukkan peran akun.',
        steps: [
          '**Merah:** tim pengelola WakuPlay (Developer atau Admin).',
          '**Ungu:** Moderator.',
          '**Biru:** akun Premium yang masih aktif.',
          'Tidak ada centang berarti akun biasa tanpa Premium.',
        ],
        tips: ['Angka **#** di samping nama adalah nomor urut akun, dibagikan sesuai urutan daftar.'],
      },
      {
        id: 'level', title: 'Badge Level',
        summary: 'Ikon level berubah mengikuti tingkatanmu.',
        steps: [
          'Badge **Lvl** ada di bawah nama dan naik seiring XP-mu bertambah.',
          'Ikonnya berganti tiap tingkat: **Batu Bara, Tembaga, Besi, Zamrud, Berlian, Netherite, Totem, Nether Star, Ember Lava,** lalu **Bedrock**.',
          'Ikon naik makin lama makin sulit. Level awal tiap tingkat bisa dilihat di **Level Progress**.',
          'Ketuk badge level untuk membuka **Level Progress**: lihat tingkat sekarang dan rentang level tiap tingkat.',
          'XP juga didapat dari **Gift Premium**: tiap hari Premium yang kamu berikan lewat gift memberi XP, dan tiap hari dari **giveaway yang diklaim** juga memberi XP (jumlahnya tampil di popup dan ditentukan server, rata, tidak makin naik; hadiah yang tidak diklaim = 0 XP, dan klaim berulang dari akun yang sama dihitung sekali per hari). XP gift dan giveaway menambah level, tetapi **tidak masuk Leaderboard**, dan ada batas harian.',
        ],
      },
      {
        id: 'clan', title: 'Badge Clan',
        summary: 'Tag dan emblem clan di profilmu.',
        steps: [
          'Kalau kamu punya clan, **tag clan** dengan emblemnya tampil di samping badge level.',
          'Bentuk emblem mengikuti **Tier badge** clan, dari Basic sampai Omega.',
          'Warna dan kilaunya berasal dari **Gacha Warna** clan. Semua anggota ikut memakai tampilan yang sama.',
        ],
        tips: ['Mau badge yang lebih keren? Ajak anggota menyetor WakuGold supaya Leader bisa menaikkan tier.'],
      },
      {
        id: 'top', title: 'Badge TOP Bulanan',
        summary: 'Lencana untuk 10 besar bulan ini.',
        steps: [
          '**TOP n LB BULANAN:** muncul di atas profil kalau XP-mu bulan ini masuk **10 besar** (sama dengan Leaderboard > Bulanan).',
          '**TOP n GIVER BULANAN:** muncul kalau kamu masuk **10 besar Top Giver** bulan ini, dari hari Premium giveaway yang diklaim orang lain.',
          '**n** adalah peringkatmu (1 sampai 10). Peringkat selalu dihitung ulang, jadi badge bisa naik, turun, atau hilang.',
          'Badge dihitung ulang tiap bulan. Di bulan baru semua mulai dari nol lagi.',
        ],
      },
      {
        id: 'premium', title: 'Badge Premium',
        steps: [
          'Pil biru **PREMIUM** tampil di profilmu selama Premium aktif.',
          'Premium berakhir, badge ikut hilang. Perpanjang kapan saja lewat tombol **Beli Premium**.',
        ],
      },
      {
        id: 'hias', title: 'Border dan Banner Profil',
        summary: 'Hiasan foto dan latar profil.',
        steps: [
          '**Avatar Border** mengitari fotomu. Lihat bagian Avatar Border untuk cara membeli dan memakainya.',
          '**Banner profil** adalah gambar latar profil. Dapatkan wallpapernya dari Gacha Wallpaper, lalu pasang lewat **Pasang jadi banner profil** (khusus akun Premium).',
        ],
      },
    ],
  },
]

export const hasGameInfo = (id) => GAME_INFO.some((g) => g.id === id)
export const lastUpdated = () => GAME_INFO.reduce((m, g) => (g.updated > m ? g.updated : m), '')
export const isNewGame = (g, days = 21) => !!g.added && Date.now() - new Date(g.added).getTime() < days * 86400000
