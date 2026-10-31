import { supabase } from '../lib/supabase'
import { callFn } from './borders'

async function rpc(name, args) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message || 'Terjadi kesalahan')
  return data
}

export const RARITY = {
  mythic: { label: 'Mythic', color: '#ff3d7f' },
  legendary: { label: 'Legendary', color: '#f5a30a' },
  epic: { label: 'Epic', color: '#a855f7' },
  rare: { label: 'Rare', color: '#3b82f6' },
  common: { label: 'Common', color: '#9ca3af' },
}
export const RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'common']

export const gachaInfo = () => rpc('gacha_info')
export const gachaInventory = () => rpc('gacha_inventory_me')
export const gachaSummon = (n) => rpc('gacha_summon', { p_count: n })

export const gachaDevList = () => rpc('gacha_dev_list')
export const gachaDevSave = ({ id, name, rarity, weight, url, active = true }) =>
  rpc('gacha_dev_save', { p_id: id ?? null, p_name: name, p_rarity: rarity, p_weight: Number(weight), p_url: url, p_active: active })
export const gachaDevDelete = (id) => rpc('gacha_dev_delete', { p_id: id })

export const WALL_MAX = 10 * 1024 * 1024
export const WALL_GITHUB_RE = /^https:\/\/raw\.githubusercontent\.com\/rr5436031-bit\/wakuplay-avatar-borders\/.+\/Wallpaper\/[A-Za-z0-9._-]+\.(gif|jpe?g|png|webp)$/
export async function uploadGachaImage(file) {
  if (!file) throw new Error('Pilih file dulu')
  if (!['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('File harus .gif / .jpg / .png / .webp')
  if (file.size <= 0) throw new Error('File kosong')
  if (file.size > WALL_MAX) throw new Error(`Ukuran file maksimal 10 MB (ini ${(file.size / 1048576).toFixed(1)} MB)`)
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const fd = new FormData()
  fd.append('kind', 'wallpaper')
  fd.append('file', file, `wallpaper.${ext}`)
  fd.append('name', file.name || '')
  const d = await callFn(fd)
  if (!d.url) throw new Error('Server tidak mengembalikan link gambar')
  return d.url
}
export async function removeGachaImage(url) {
  if (!WALL_GITHUB_RE.test(url || '')) return true
  try { await callFn({ action: 'delete', url }); return true } catch { return false }
}
