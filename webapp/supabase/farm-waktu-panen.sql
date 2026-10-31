-- Kebun Waku: waktu berbuah dipercepat (menit per panen). Jalankan sekali di SQL Editor Supabase. Aman diulang.
-- L1 60 | L2 60 | L3 50 | L4 45 | L5 40 | L6 35 | L7 30 | L8 25 | L9 20 | L10 15
update public.farm_levels set interval_min = v.m
from (values (1,60),(2,60),(3,50),(4,45),(5,40),(6,35),(7,30),(8,25),(9,20),(10,15)) as v(l, m)
where farm_levels.level = v.l;
