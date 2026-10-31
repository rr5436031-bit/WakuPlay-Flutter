# WakuPlay v1.0.5

Build pertama (Termux, dari folder home, BUKAN /storage/emulated/0):
    bash setup.sh

Update berikutnya (setelah mengubah source):
    bash update.sh

Cek response API asli:
    bash scripts/test-api.sh

Database: jalankan supabase/schema.sql di Supabase SQL Editor.
Edge Function WAJIB: supabase/functions/anime-api (semua permintaan API anime lewat sini; alamat API anime disimpan sebagai secret ANIME_API_BASE di Supabase, tidak ada di APK).
Premium + pembayaran Pakasir (API v2): ikuti PANDUAN-PREMIUM.md (supabase/premium.sql + 2 Edge Function: premium & premium-webhook).

Fitur Teman & Chat Pribadi:
    Jalankan supabase/teman-chat.sql di Supabase SQL Editor (sekali, aman diulang).

Daily Clan (klaim WakuGold harian anggota clan):
    Jalankan supabase/clan-daily.sql di Supabase SQL Editor (sekali, aman diulang). Atur hadiah di Panel Developer -> Clan -> Daily Clan.
