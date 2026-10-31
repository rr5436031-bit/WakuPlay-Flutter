import { supabase } from '../lib/supabase'

export async function getTopGivers(period = 'all', limit = 100) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.rpc('get_top_givers', { p_period: period, p_limit: limit })
  if (error) throw new Error(error.message || 'Gagal memuat Top Giver')
  return data || []
}

export async function getMyTopGiver(period = 'all') {
  if (!supabase) return { rank: null, days: 0, people: 0 }
  const { data, error } = await supabase.rpc('get_my_top_giver', { p_period: period })
  if (error) throw new Error(error.message || 'Gagal memuat peringkat')
  return (data && data[0]) || { rank: null, days: 0, people: 0 }
}

export async function monthlyGiverOf(uid) {
  if (!supabase || !uid) return null
  const { data, error } = await supabase.rpc('monthly_giver_of', { p_user: uid })
  if (error) throw new Error(error.message)
  return Number.isInteger(data) && data >= 1 && data <= 10 ? data : null
}
