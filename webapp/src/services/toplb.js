import { supabase } from '../lib/supabase'

export async function monthlyTopOf(uid) {
  if (!supabase || !uid) return null
  const { data, error } = await supabase.rpc('monthly_top_of', { p_user: uid })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : null
}

async function rpc(name, args) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message || 'Terjadi kesalahan')
  return data
}
export const devLbList = (period, q, offset = 0, limit = 40) => rpc('dev_lb_list', { p_period: period, p_q: q || null, p_limit: limit, p_offset: offset })
export const devLbSet = (uid, period, value) => rpc('dev_lb_set', { p_target: uid, p_period: period, p_value: value })
export const devLbReset = (uid, period) => rpc('dev_lb_reset', { p_target: uid, p_period: period })
