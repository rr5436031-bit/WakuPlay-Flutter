-- 1) Batas impor GIF border: di bawah 10 MB (sebelumnya 5 MB)
update storage.buckets set file_size_limit = 10485759 where id = 'avatar-border';

-- 2) Rentang harga Basic: 1.500 sampai 5.600 WakuGold
insert into public.avatar_border_tiers (rarity, min_price, max_price) values ('basic', 1500, 5600)
on conflict (rarity) do update set min_price = excluded.min_price, max_price = excluded.max_price;

-- harga rarity Basic tersimpan yang di luar rentang digeser ke batas bawah (1.500); yang sudah dalam rentang tidak disentuh
update public.avatar_border_prices set price = 1500, updated_at = now()
 where rarity = 'basic' and (price < 1500 or price > 5600);
