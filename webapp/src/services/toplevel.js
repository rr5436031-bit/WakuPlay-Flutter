import { supabase } from '../lib/supabase'

export async function getTopLevels(limit = 100) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.rpc('get_top_levels', { p_limit: limit })
  if (error) throw new Error(error.message || 'Gagal memuat Top Level')
  return data || []
}

export async function getMyTopLevel() {
  if (!supabase) return { rank: null, total_xp: 0 }
  const { data, error } = await supabase.rpc('get_my_top_level')
  if (error) throw new Error(error.message || 'Gagal memuat peringkat')
  return (data && data[0]) || { rank: null, total_xp: 0 }
}

export async function topLevelOf(uid) {
  if (!supabase || !uid) return null
  const { data, error } = await supabase.rpc('top_level_of', { p_user: uid })
  if (error) throw new Error(error.message)
  return Number.isInteger(data) && data >= 1 && data <= 10 ? data : null
}
