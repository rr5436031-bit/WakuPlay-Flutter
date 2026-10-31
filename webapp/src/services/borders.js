import { supabase } from '../lib/supabase'
import { registerBorderImages } from '../lib/borderArt'
import { checkBorderFile, BORDER_BUCKET, BORDER_GITHUB_RE } from '../lib/borderUrl'

async function rpc(name, args) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message || 'Terjadi kesalahan')
  return data
}
export const borderShop = async () => { const r = await rpc('border_shop'); registerBorderImages(r?.list); return r }
export const borderBuy = (id) => rpc('border_buy', { p_id: id })
export const borderEquip = (id) => rpc('border_equip', { p_id: id || null })
export const borderOf = async (uids) => { const r = await rpc('border_of', { p_uids: uids }); registerBorderImages((r || []).map((x) => ({ id: x.border_id, image_url: x.image_url }))); return r }

export const devBorderList = () => rpc('dev_border_list')
// price kosong = harga otomatis sesuai rarity (dihitung server). path = lokasi file di GitHub (Border/<rarity>/x.gif) kalau diunggah lewat Panel.
export const devBorderImport = ({ name, rarity, url, price, path }) => rpc('dev_border_import', { p_name: name, p_rarity: rarity, p_url: url, p_price: price ? Number(price) : null, p_path: path || null })
export const devBorderPriceSet = (rarity, price) => rpc('dev_border_price_set', { p_rarity: rarity, p_price: Number(price) })
export const devBorderPriceApply = (rarity, scope, apply) => rpc('dev_border_price_apply', { p_rarity: rarity, p_scope: scope, p_apply: !!apply })
export const devBorderUpdate = ({ id, name, rarity, url, price, active = true }) => rpc('dev_border_update', { p_id: id, p_name: name, p_rarity: rarity, p_url: url, p_price: Number(price), p_active: active })
export const devBorderSave = (id, price, active) => rpc('dev_border_save', { p_id: id, p_price: Number(price), p_active: active })
export const devBorderDelete = (id) => rpc('dev_border_delete', { p_id: id })

const FN = (import.meta.env.VITE_BORDER_FN || 'border-gif').trim()

export async function callFn(body) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  let res
  try { res = await supabase.functions.invoke(FN, { body }) }
  catch { throw new Error('Koneksi gagal. Cek internet lalu coba lagi.') }
  const { data, error } = res
  if (error) {
    const r = error.context
    if (r && typeof r.status === 'number') {
      let detail = ''
      try { const j = await r.json(); detail = j?.error || j?.message || '' } catch { }
      if (r.status === 404 && !detail) throw new Error(`Edge Function "${FN}" belum di-deploy (kode 404)`)
      if (r.status === 401 && !detail) throw new Error('Sesi login tidak valid. Login ulang lalu coba lagi.')
      if (r.status === 413 && !detail) throw new Error('Ukuran file harus di bawah 10 MB')
      throw new Error(detail ? `${detail} (kode ${r.status})` : `Server membalas kode ${r.status}`)
    }
    throw new Error('Koneksi gagal. Cek internet lalu coba lagi.')
  }
  if (!data?.ok) throw new Error(data?.error || 'Terjadi kesalahan')
  return data
}

// Mengunggah GIF apa adanya (tanpa kompres) ke Border/<rarity>/ di GitHub. Mengembalikan { url, path }.
export async function uploadBorderGif(file, { rarity, name } = {}) {
  const bad = checkBorderFile(file)
  if (bad) throw new Error(bad)
  const head = new Uint8Array(await file.slice(0, 6).arrayBuffer())
  const sig = String.fromCharCode(...head)
  if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('Isi file bukan GIF yang valid')
  const fd = new FormData()
  fd.append('file', file, 'border.gif')
  fd.append('rarity', rarity || '')
  fd.append('name', name || '')
  const d = await callFn(fd)
  if (!d.url) throw new Error('Server tidak mengembalikan link GIF')
  return { url: d.url, path: d.path }
}
export async function removeBorderGif(url) {
  if (BORDER_GITHUB_RE.test(url || '')) {
    try { await callFn({ action: 'delete', url }); return true } catch { return false }
  }
  const m = /\/storage\/v1\/object\/public\/avatar-border\/([A-Za-z0-9._-]+\.gif)$/.exec(url || '')
  if (!m) return true
  try {
    const { error } = await supabase.storage.from(BORDER_BUCKET).remove([m[1]])
    return !error
  } catch { return false }
}
export const checkBorderStorage = () => callFn({ action: 'check' })
export const syncBorderGithub = () => callFn({ action: 'sync' })
// apply=false: hanya pratinjau rencana ganti nama. apply=true: jalankan (semua folder aset GitHub, semua subfolder)
export const cleanGithubNames = (apply) => callFn({ action: 'clean', apply: !!apply })
export const initBorderFolders = () => callFn({ action: 'init' })
