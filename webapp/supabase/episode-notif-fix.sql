-- Jalankan di Supabase Dashboard -> SQL Editor -> New query -> Run (aman dijalankan berulang)
-- PERBAIKAN v1.5.7: notifikasi episode baru dari Panel Developer.
--  * Developer yang menyimpan juga ikut dapat notifikasinya (bukti terkirim), selain yang memfavoritkan / menonton anime itu (180 hari).
--  * Opsi kirim ke SEMUA pengguna (p_all).
--  * Notifikasi tidak lagi diam-diam dilewati kalau nomor episode yang sama pernah dikirim (dimunculkan lagi).
--  * Hasil simpan memuat jumlah penerima, jadi kelihatan kalau penerimanya 0.
-- Syarat: anime-tambahan.sql, notifikasi.sql dan anime-baru-notif.sql sudah pernah dijalankan.
-- ============================================================ 2) EPISODE BARU dari Panel Developer -> notifikasi otomatis
-- Hanya SATU notifikasi per simpan (nomor episode baru TERTINGGI) supaya mengisi episode lama tidak membanjiri notifikasi.
-- Nomor yang sudah pernah ada / hanya mengganti episode rusak TIDAK memicu notifikasi.
-- Penerima: yang memfavoritkan, yang menonton anime itu (180 hari terakhir), dan developer yang menyimpan (sebagai bukti terkirim).
-- p_all = true -> kirim ke SEMUA pengguna. Kalau pengguna sudah pernah dapat notifikasi nomor yang sama (mis. episode dihapus lalu ditambah lagi),
-- notifikasinya dimunculkan lagi (bukan diam-diam dilewati). Mengembalikan jsonb: saved, notified, is_new, newest.
drop function if exists public.dev_extra_save(text, jsonb);
drop function if exists public.dev_extra_save(text, jsonb, text, text, boolean);
create or replace function public.dev_extra_save(p_anime text, p_rows jsonb, p_title text default null, p_poster text default null, p_notify boolean default true, p_all boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n numeric; k text; f text; t text; cnt int := 0; seen numeric[] := '{}'; existed boolean; newmax numeric := null; ttl text; pos text; epl text; sent int := 0;
begin
  if not public.is_developer() then raise exception 'Hanya developer'; end if;
  if p_anime is null or p_anime !~ '^[A-Za-z0-9_:.-]{1,120}$' then raise exception 'ID anime tidak valid'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Data episode tidak valid'; end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 200 then raise exception 'Kirim 1 sampai 200 episode sekali simpan'; end if;
  if (select count(*) from public.extra_episodes where anime_id = p_anime) > 3000 then raise exception 'Terlalu banyak episode tambahan untuk anime ini'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin n := (r ->> 'number')::numeric; exception when others then raise exception 'Nomor episode tidak valid'; end;
    k := r ->> 'kind'; f := btrim(coalesce(r ->> 'ref', '')); t := nullif(btrim(coalesce(r ->> 'title', '')), '');
    if n is null or n <= 0 or n > 99999 then raise exception 'Nomor episode harus 1 sampai 99999'; end if;
    if n = any(seen) then raise exception 'Nomor episode % dobel dalam satu kiriman', n; end if;
    seen := seen || n;
    if k = 'api' then
      if f !~ '^[A-Za-z0-9_:.-]{1,120}$' then raise exception 'Episode %: ID episode API tidak valid', n; end if;
    elsif k = 'link' then
      if char_length(f) > 600 or f !~ '^https://[^\s"''<>]+$' then raise exception 'Episode %: link harus diawali https:// tanpa spasi', n; end if;
    else raise exception 'Episode %: jenis harus api atau link', n; end if;
    if t is not null and char_length(t) > 120 then raise exception 'Judul episode % terlalu panjang', n; end if;
    select exists (select 1 from public.extra_episodes where anime_id = p_anime and number = n) into existed;
    insert into public.extra_episodes (anime_id, number, title, kind, ref)
    values (p_anime, n, t, k, f)
    on conflict (anime_id, number) do update set title = excluded.title, kind = excluded.kind, ref = excluded.ref, created_by = auth.uid(), created_at = now();
    cnt := cnt + 1;
    if not existed and (newmax is null or n > newmax) then newmax := n; end if;
  end loop;

  if newmax is not null then
    ttl := left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), (select a.title from public.custom_anime a where a.id = p_anime), 'Anime'), 120);
    pos := case when char_length(btrim(coalesce(p_poster, ''))) <= 600 and btrim(coalesce(p_poster, '')) ~ '^https://[^\s"''<>]+$' then btrim(p_poster)
                else (select a.poster from public.custom_anime a where a.id = p_anime) end;
    epl := case when newmax = trunc(newmax) then trunc(newmax)::text else trim(trailing '0' from newmax::text) end;
    -- Catat untuk "New Eps Anime" di beranda (selalu, tidak tergantung pilihan notifikasi)
    insert into public.new_eps_feed (anime_id, title, poster, number, updated_at)
    values (p_anime, ttl, pos, newmax, now())
    on conflict (anime_id) do update set
      title = excluded.title,
      poster = coalesce(excluded.poster, public.new_eps_feed.poster),
      number = case when public.new_eps_feed.updated_at > now() - interval '14 days' then greatest(public.new_eps_feed.number, excluded.number) else excluded.number end,
      updated_at = now();
  end if;
  if coalesce(p_notify, true) and newmax is not null then
    insert into public.notifications (user_id, type, title, body, data, dedupe_key)
    select u.user_id, 'episode', ttl, 'Episode ' || epl || ' sudah tayang di WakuPlay!',
           jsonb_build_object('anime_id', p_anime, 'episode_id', null, 'poster', pos, 'number', newmax::text),
           'ep-' || left(p_anime, 80) || '-' || newmax::text
      from (select user_id from public.favorites where anime_id = p_anime
            union
            select user_id from public.watch_history where anime_id = p_anime and updated_at > now() - interval '180 days'
            union
            select auth.uid()
            union
            select user_id from public.profiles where coalesce(p_all, false)) u
    where u.user_id is not null
    on conflict (user_id, dedupe_key) where dedupe_key is not null
    do update set created_at = now(), read_at = null, title = excluded.title, body = excluded.body, data = excluded.data;
    get diagnostics sent = row_count;
  end if;
  return jsonb_build_object('saved', cnt, 'notified', sent, 'is_new', newmax is not null, 'newest', epl);
end; $$;
revoke all on function public.dev_extra_save(text, jsonb, text, text, boolean, boolean) from public, anon;
grant execute on function public.dev_extra_save(text, jsonb, text, text, boolean, boolean) to authenticated;
