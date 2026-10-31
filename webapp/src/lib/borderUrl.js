export const IMG_SCALE = 1.2
export const BORDER_URL_RE = /^https:\/\/([a-z0-9-]+\.)+[a-z]{2,}\/[^\s?#@]*\.gif(\?[^\s#]*)?$/i
export const MAX_URL = 500
export const MAX_UPLOAD = 10 * 1024 * 1024
export const BORDER_BUCKET = 'avatar-border'
export const BORDER_REPO = 'rr5436031-bit/wakuplay-avatar-borders'
// Link file milik repository kita: folder lama `borders/` dan folder baru `Border/<rarity>/`
export const BORDER_GITHUB_RE = /^https:\/\/raw\.githubusercontent\.com\/rr5436031-bit\/wakuplay-avatar-borders\/[^/]+\/(?:borders\/[A-Za-z0-9._-]+|Border\/(?:basic|standard|premium)\/[A-Za-z0-9._%-]+)\.gif$/
export const BORDER_ROOT = 'Border'

// Harga bawaan per rarity (WakuGold). Hanya NILAI AWAL / cadangan tampilan.
// Sumber kebenaran ada di database (tabel avatar_border_prices) dan diubah Developer dari Panel > Border > Harga rarity.
export const BORDER_PRICES = {
  basic: 1500,
  standard: 6500,
  premium: 10500,
}
export const MAX_PRICE = 100000000
export const MIN_SIDE = 96
export const MAX_SIDE = 1024
export const SQUARE_TOLERANCE = 0.05

export function checkBorderName(v) {
  const s = (v || '').replace(/\s+/g, ' ').trim()
  if (!s) return 'Nama wajib diisi'
  if (s.length > 40) return 'Nama maksimal 40 karakter'
  if (/[<>\u0000-\u001f\u007f]/.test(s)) return 'Nama tidak boleh berisi < > atau karakter aneh'
  return ''
}
export function checkBorderUrl(v) {
  const s = (v || '').trim()
  if (!s) return 'Link .gif wajib diisi'
  if (s.length > MAX_URL) return `Link maksimal ${MAX_URL} karakter`
  if (!/^https:\/\//i.test(s)) return 'Link harus diawali https://'
  if (!BORDER_URL_RE.test(s)) return 'Link harus https://domain/.../nama.gif (tanpa IP, port, atau user:pass@)'
  return ''
}
export function checkBorderPrice(v, tier) {
  const n = Number(v)
  if (!/^\d+$/.test(String(v ?? '')) || !Number.isInteger(n) || n < 1) return 'Harga harus bilangan bulat, minimal 1'
  if (n > MAX_PRICE) return 'Harga maksimal 100.000.000'
  if (tier && (n < tier[0] || n > tier[1])) return `Harga rarity ini harus ${tier[0].toLocaleString('id-ID')} sampai ${tier[1].toLocaleString('id-ID')}`
  return ''
}
export function checkBorderSize(w, h) {
  if (!w || !h) return 'Gambar tidak terbaca'
  if (Math.min(w, h) < MIN_SIDE) return `Gambar terlalu kecil (${w}x${h}). Minimal ${MIN_SIDE}px`
  if (Math.max(w, h) > MAX_SIDE) return `Gambar terlalu besar (${w}x${h}). Maksimal ${MAX_SIDE}px`
  if (Math.abs(w - h) / Math.max(w, h) > SQUARE_TOLERANCE) return `Gambar harus persegi (1:1), ini ${w}x${h}`
  return ''
}
export function checkBorderFile(f) {
  if (!f) return 'Pilih file dulu'
  if (f.type !== 'image/gif' || !/\.gif$/i.test(f.name || '')) return 'File harus berformat .gif'
  if (f.size <= 0) return 'File kosong'
  if (f.size >= MAX_UPLOAD) return `Ukuran file harus di bawah 10 MB (ini ${(f.size / 1048576).toFixed(1)} MB)`
  return ''
}
