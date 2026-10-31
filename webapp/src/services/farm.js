import { supabase } from '../lib/supabase'

async function rpc(name, args) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message || 'Terjadi kesalahan')
  return data
}
export const farmState = () => rpc('farm_state')
export const farmView = (uid) => rpc('farm_view', { p_uid: uid })
export const farmHarvest = () => rpc('farm_harvest')
export const farmUpgrade = () => rpc('farm_upgrade')
export const farmBuy = (id) => rpc('farm_buy', { p_item: id })
export const farmEquip = (cat, id) => rpc('farm_equip', { p_cat: cat, p_item: id || null })

export const CATS = [
  { id: 'fence', label: 'Pagar' },
  { id: 'lamp', label: 'Lampu' },
  { id: 'tree', label: 'Pohon' },
  { id: 'pet', label: 'Pet' },
  { id: 'person', label: 'Orang' },
]
export const RAR = {
  common: { label: 'Biasa', color: '#9ca3af' },
  rare: { label: 'Langka', color: '#4a8cff' },
  epic: { label: 'Epik', color: '#b26bff' },
  legendary: { label: 'Legendaris', color: '#f5b50a' },
}
export const FENCE_COLOR = { fence_wood: '#b9803f', fence_white: '#f1f1f4', fence_stone: '#9aa0a8', fence_gold: '#f5c542' }

export function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`
}
export const fmtDur = (min) => (min >= 60 ? `${Math.round((min / 60) * 10) / 10} jam`.replace('.', ',') : `${min} mnt`)
