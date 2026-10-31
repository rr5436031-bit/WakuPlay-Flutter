import { supabase } from '../lib/supabase'
import { callFn } from './borders'

async function rpc(name, args) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message || 'Terjadi kesalahan')
  return data
}

export const PET_RARITY = {
  mythic: { label: 'Mythic', short: 'M', color: '#ff3d7f' },
  legendary: { label: 'Legend', short: 'L', color: '#f5a30a' },
  epic: { label: 'Epic', short: 'E', color: '#a855f7' },
  rare: { label: 'Rare', short: 'R', color: '#3b82f6' },
  common: { label: 'Common', short: 'C', color: '#9ca3af' },
}
export const PET_RARITY_ORDER = ['mythic', 'legendary', 'epic', 'rare', 'common']

export const petInfo = () => rpc('pet_info')
export const petInventory = () => rpc('pet_inventory_me')
export const petSummon = (n) => rpc('pet_summon', { p_count: n })

export const petHabitat = () => rpc('pet_habitat_me')
export const petPlace = (petId) => rpc('pet_place', { p_pet: petId })
export const petStore = (unit) => rpc('pet_store', { p_unit: unit })
export const petClaim = (unit) => rpc('pet_claim', { p_unit: unit })
export const petSell = (petId, expected) => rpc('pet_sell', { p_pet: petId, p_expected: expected })
export const petClaimAll = () => rpc('pet_claim_all')
export const petView = (uid) => rpc('pet_view', { p_uid: uid })

export const petDevList = () => rpc('pet_dev_list')
export const petDevSave = ({ id, name, rarity, weight, url, active = true, incomeMin, incomeMax }) =>
  rpc('pet_dev_save', { p_id: id ?? null, p_name: name, p_rarity: rarity, p_weight: Number(weight), p_url: url, p_active: active, p_income_min: Math.floor(Number(incomeMin)), p_income_max: Math.floor(Number(incomeMax)) })
export const petDevDelete = (id) => rpc('pet_dev_delete', { p_id: id })

export const PET_MAX = 5 * 1024 * 1024
export const PET_GITHUB_RE = /^https:\/\/raw\.githubusercontent\.com\/rr5436031-bit\/wakuplay-avatar-borders\/.+\/Pet\/[A-Za-z0-9._-]+\.(gif|png|webp)$/
export async function uploadPetImage(file) {
  if (!file) throw new Error('Pilih file dulu')
  if (!['image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Pet harus PNG / WebP / GIF transparan (JPG tidak bisa transparan)')
  if (file.size <= 0) throw new Error('File kosong')
  if (file.size > PET_MAX) throw new Error(`Ukuran pet maksimal 5 MB (ini ${(file.size / 1048576).toFixed(1)} MB)`)
  const ext = file.type.split('/')[1]
  const fd = new FormData()
  fd.append('kind', 'pet')
  fd.append('file', file, `pet.${ext}`)
  fd.append('name', file.name || '')          // nama asli -> server membersihkannya jadi nama file rapi
  const d = await callFn(fd)
  if (!d.url) throw new Error('Server tidak mengembalikan link gambar')
  return d.url
}
export async function removePetImage(url) {
  if (!PET_GITHUB_RE.test(url || '')) return true
  try { await callFn({ action: 'delete', url }); return true } catch { return false }
}
