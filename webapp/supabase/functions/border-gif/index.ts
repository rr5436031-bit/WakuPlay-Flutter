import { createClient } from 'npm:@supabase/supabase-js@2'

const REPO = 'rr5436031-bit/wakuplay-avatar-borders'
const DIR = 'borders'                      // folder LAMA (border lama tetap bekerja, file lama tidak dipindah)
const BORDER_ROOT = 'Border'               // folder BARU: Border/<rarity>/nama.gif
const RARITIES = ['basic', 'standard', 'premium']
const ROOT_DIRS = ['Wallpaper', 'Emblem', 'Pet']
const SYNC_VALIDATE_MAX = 60               // maks file BARU yang diperiksa isinya per sekali sinkronisasi (sisanya 'pending', jalankan lagi)
// Nama file bebas (huruf apa pun, angka, spasi, kurung, tanda — dll). Hanya karakter yang merusak path / link yang ditolak: / \ ? # % @ < > " | * : dan karakter kontrol.
const FILE_NAME_RE = /^[^\/\\?#%@<>"|*:\u0000-\u001f\u007f]{1,120}\.gif$/i
const WALL_DIR = 'Wallpaper'
const PET_DIR = 'Pet'
const MAX_PET = 5 * 1024 * 1024
const PET_MIN = 64
const PET_MAX = 2048
const EMB_DIR = 'Emblem'
const MAX_EMB = 2 * 1024 * 1024
const EMB_MIN = 64
const EMB_MAX = 1024
const MAX_WALL = 10 * 1024 * 1024

const MAX_UPLOAD = 10 * 1024 * 1024
const MIN_SIDE = 96
const MAX_SIDE = 1024
const SQUARE_TOLERANCE = 0.05
const BORDER_URL_RE = /^https:\/\/([a-z0-9-]+\.)+[a-z]{2,}\/[^\s?#@]*\.gif(\?[^\s#]*)?$/i
const MAX_URL = 500

// ---------------------------------------------------------------------------------------------
// PEMBERSIHAN NAMA FILE (semua kategori: Border, Wallpaper, Emblem, Pet). Salinan dari src/lib/cleanName.js, ubah keduanya bersamaan.
// Hanya NAMA yang berubah. Byte gambar (animasi, kualitas, transparansi) tidak disentuh.
// ---------------------------------------------------------------------------------------------
const EXT_RE = /\.(gif|png|jpe?g|webp)$/i
const JUNK: RegExp[] = [
  // keterangan dalam kurung yang berisi teks sumber / promosi
  /[\[(（【][^\])）】]*(discord|avatar\s*decoration|download|free\s|source|credit|www\.|\.com|\.net|\.gg|nitro|watermark)[^\])）】]*[\])）】]/gi,
  /\b(discord\s+)?avatar\s*decorations?\b/gi,
  /\bdiscord\s+(profile\s+)?(effects?|decorations?|nameplates?|borders?|avatars?)\b/gi,
  /\b(free\s+download|download\s+free|download\s+now|get\s+it\s+on)\b/gi,
  /\b[a-z0-9-]+\.(com|net|org|io|gg|app|co|me|xyz|id)\b/gi,
  /\b(source|credits?|credit\s+to|courtesy\s+of)\b.*$/gi,
  /\b(made|created|uploaded|ripped|edited|posted)\s+by\b.*$/gi,
  /\b(subscribe|follow\s+(me|us)|join\s+(our|my)|link\s+in\s+bio|sponsored|watermark(ed)?)\b.*$/gi,
  /@[A-Za-z0-9_.]+/g,
  /^\s*copy\s+of\s+/gi,
  /\s*[-–—]\s*copy(\s*\(?\d+\)?)?\s*$/gi,
  /\s*\(\d{1,3}\)\s*$/g,
  /(^|[\s\-–—|_])discord\s*$/gi,
  /^\s*discord[\s\-–—|_]+/gi,
]
const splitExt = (name: string): [string, string] => { const m = EXT_RE.exec(name || ''); return m ? [name.slice(0, m.index), m[1].toLowerCase()] : [name || '', ''] }
function cleanStem(raw: unknown): string {
  let s = String(raw || '')
  try { s = decodeURIComponent(s) } catch { /* biarkan */ }
  const orig = s
  for (const re of JUNK) s = s.replace(re, ' ')
  const slug = (t: string) => t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return slug(s) || slug(orig) || 'file'
}
function cleanFileName(name: string): string {
  const [stem, ext] = splitExt(name)
  return cleanStem(stem) + (ext ? '.' + ext : '')
}


const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors })
const fail = (status: number, code: string, error: string) => json(status, { ok: false, code, error })
class Fail extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code }
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'wakuplay-border-gif',
  }
}
async function ghFail(res: Response, what: string): Promise<Fail> {
  let msg = ''
  try { msg = String((await res.json())?.message || '') } catch { }
  const s = res.status
  if (s === 401) return new Fail(502, 'token_invalid', 'GitHub menolak token (tidak valid / kedaluwarsa). Perbarui secret GITHUB_TOKEN di Supabase.')
  if (s === 403 || s === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit|abuse|secondary/i.test(msg)) return new Fail(503, 'rate_limited', 'GitHub membatasi permintaan (rate limit). Tunggu beberapa menit lalu coba lagi.')
    return new Fail(502, 'token_forbidden', 'Token GitHub tidak punya izin menulis ke repository border (butuh izin Contents: Read and write).')
  }
  if (s === 404) return new Fail(502, 'repo_not_found', `Repository ${REPO} tidak ditemukan atau token tidak punya akses ke sana.`)
  if (s === 409 || s === 422) return new Fail(409, 'conflict', `GitHub menolak ${what} (konflik: ${msg || 'file sudah berubah'}). Coba lagi.`)
  if (s >= 500) return new Fail(502, 'github_down', 'GitHub sedang bermasalah. Coba lagi nanti.')
  return new Fail(502, 'github_error', `GitHub membalas kode ${s}${msg ? `: ${msg}` : ''}`)
}
async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`https://api.github.com${path}`, { ...init, headers: { ...ghHeaders(token), ...(init.headers || {}) } })
  } catch {
    throw new Fail(502, 'network', 'Tidak bisa menghubungi GitHub (koneksi gagal). Coba lagi.')
  }
}
let cachedBranch = ''
async function repoInfo(token: string) {
  const res = await gh(token, `/repos/${REPO}`)
  if (!res.ok) throw await ghFail(res, 'akses repository')
  const r = await res.json()
  const push = !!r?.permissions?.push
  const branch = (Deno.env.get('GITHUB_BRANCH') || '').trim() || String(r?.default_branch || 'main')
  cachedBranch = branch
  return { branch, push, private: !!r?.private }
}
async function branchOf(token: string) {
  return cachedBranch || (await repoInfo(token)).branch
}
const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/')
const rawUrl = (branch: string, path: string) => `https://raw.githubusercontent.com/${REPO}/${branch}/${path}`

function b64(u: Uint8Array): string {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode(...u.subarray(i, i + CH))
  return btoa(s)
}

function checkGif(u8: Uint8Array) {
  if (u8.length === 0) throw new Fail(400, 'empty', 'File kosong')
  if (u8.length >= MAX_UPLOAD) throw new Fail(413, 'too_large', `Ukuran file harus di bawah 10 MB (ini ${(u8.length / 1048576).toFixed(1)} MB)`)
  const sig = String.fromCharCode(...u8.subarray(0, 6))
  if (u8.length < 14 || (sig !== 'GIF87a' && sig !== 'GIF89a')) throw new Fail(400, 'not_gif', 'Isi file bukan GIF yang valid')
  const w = u8[6] | (u8[7] << 8)
  const h = u8[8] | (u8[9] << 8)
  if (!w || !h) throw new Fail(400, 'not_gif', 'GIF tidak terbaca (ukuran 0)')
  if (Math.min(w, h) < MIN_SIDE) throw new Fail(400, 'bad_size', `Gambar terlalu kecil (${w}x${h}). Minimal ${MIN_SIDE}px`)
  if (Math.max(w, h) > MAX_SIDE) throw new Fail(400, 'bad_size', `Gambar terlalu besar (${w}x${h}). Maksimal ${MAX_SIDE}px`)
  if (Math.abs(w - h) / Math.max(w, h) > SQUARE_TOLERANCE) throw new Fail(400, 'bad_size', `Gambar harus persegi (1:1), ini ${w}x${h}`)
}

function checkWallpaper(u8: Uint8Array): string {
  if (u8.length === 0) throw new Fail(400, 'empty', 'File kosong')
  if (u8.length > MAX_WALL) throw new Fail(413, 'too_large', `Ukuran file maksimal 10 MB (ini ${(u8.length / 1048576).toFixed(1)} MB)`)
  const at = (i: number) => u8[i]
  const asc = (a: number, b: number) => String.fromCharCode(...u8.subarray(a, b))
  if (u8.length >= 14 && (asc(0, 6) === 'GIF87a' || asc(0, 6) === 'GIF89a')) return 'gif'
  if (u8.length >= 12 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg'
  if (u8.length >= 12 && at(0) === 0x89 && asc(1, 4) === 'PNG') return 'png'
  if (u8.length >= 16 && asc(0, 4) === 'RIFF' && asc(8, 12) === 'WEBP') return 'webp'
  throw new Fail(400, 'not_image', 'Isi file bukan gambar .gif / .jpg / .png / .webp yang valid')
}

function imageSize(u8: Uint8Array, ext: string): [number, number] | null {
  const asc = (a: number, b: number) => String.fromCharCode(...u8.subarray(a, b))
  if (ext === 'png' && u8.length >= 24) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
    return [dv.getUint32(16), dv.getUint32(20)]
  }
  if (ext === 'gif') return [u8[6] | (u8[7] << 8), u8[8] | (u8[9] << 8)]
  if (ext === 'jpg') {
    let i = 2
    while (i + 9 < u8.length) {
      if (u8[i] !== 0xff) { i++; continue }
      const m = u8[i + 1]
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue }
      const len = (u8[i + 2] << 8) | u8[i + 3]
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [(u8[i + 7] << 8) | u8[i + 8], (u8[i + 5] << 8) | u8[i + 6]]
      i += 2 + len
    }
    return null
  }
  if (ext === 'webp' && u8.length >= 30) {
    const t = asc(12, 16)
    if (t === 'VP8 ') return [(u8[26] | (u8[27] << 8)) & 0x3fff, (u8[28] | (u8[29] << 8)) & 0x3fff]
    if (t === 'VP8L') return [1 + (((u8[22] & 0x3f) << 8) | u8[21]), 1 + (((u8[24] & 0xf) << 10) | (u8[23] << 2) | ((u8[22] & 0xc0) >> 6))]
    if (t === 'VP8X') return [1 + (u8[24] | (u8[25] << 8) | (u8[26] << 16)), 1 + (u8[27] | (u8[28] << 8) | (u8[29] << 16))]
  }
  return null
}
function pngHasAlpha(u8: Uint8Array): boolean {
  if (u8.length < 33) return false
  const ct = u8[25]
  if (ct === 4 || ct === 6) return true
  if (ct !== 3) return false
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let pos = 8
  while (pos + 12 <= u8.length) {
    const len = dv.getUint32(pos)
    const type = String.fromCharCode(u8[pos + 4], u8[pos + 5], u8[pos + 6], u8[pos + 7])
    if (type === 'tRNS') return true
    if (type === 'IDAT' || type === 'IEND') return false
    pos += 12 + len
  }
  return false
}
function checkPet(u8: Uint8Array): string {
  if (u8.length > MAX_PET) throw new Fail(413, 'too_large', `Ukuran pet maksimal 5 MB (ini ${(u8.length / 1048576).toFixed(1)} MB)`)
  const ext = checkWallpaper(u8)
  if (ext === 'jpg') throw new Fail(400, 'not_transparent', 'Pet harus PNG / WebP / GIF transparan. JPG tidak bisa transparan')
  if (ext === 'png' && !pngHasAlpha(u8)) throw new Fail(400, 'not_transparent', 'PNG ini tidak transparan (masih punya latar). Ekspor ulang dengan latar transparan')
  if (ext === 'webp') {
    const t = String.fromCharCode(...u8.subarray(12, 16))
    if (t === 'VP8 ' || (t === 'VP8X' && !(u8[20] & 0x10))) throw new Fail(400, 'not_transparent', 'WebP ini tidak transparan. Ekspor ulang dengan latar transparan')
  }
  const sz = imageSize(u8, ext)
  if (!sz || !sz[0] || !sz[1]) throw new Fail(400, 'not_image', 'Ukuran gambar tidak terbaca')
  const [w, h] = sz
  if (Math.min(w, h) < PET_MIN) throw new Fail(400, 'bad_size', `Pet terlalu kecil (${w}x${h}). Minimal ${PET_MIN}px`)
  if (Math.max(w, h) > PET_MAX) throw new Fail(400, 'bad_size', `Pet terlalu besar (${w}x${h}). Maksimal ${PET_MAX}px`)
  return ext
}
function checkEmblem(u8: Uint8Array): string {
  if (u8.length > MAX_EMB) throw new Fail(413, 'too_large', `Ukuran emblem maksimal 2 MB (ini ${(u8.length / 1048576).toFixed(1)} MB)`)
  const ext = checkWallpaper(u8)
  const sz = imageSize(u8, ext)
  if (!sz || !sz[0] || !sz[1]) throw new Fail(400, 'not_image', 'Ukuran gambar tidak terbaca')
  const [w, h] = sz
  if (Math.min(w, h) < EMB_MIN) throw new Fail(400, 'bad_size', `Emblem terlalu kecil (${w}x${h}). Minimal ${EMB_MIN}px`)
  if (Math.max(w, h) > EMB_MAX) throw new Fail(400, 'bad_size', `Emblem terlalu besar (${w}x${h}). Maksimal ${EMB_MAX}px`)
  if (Math.max(w, h) / Math.min(w, h) > 3) throw new Fail(400, 'bad_size', `Rasio emblem terlalu ekstrem (${w}x${h}). Maksimal 3:1`)
  return ext
}

async function requireDeveloper(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) throw new Fail(401, 'no_auth', 'Login diperlukan')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) throw new Fail(401, 'no_auth', 'Sesi login tidak valid. Login ulang lalu coba lagi.')
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || ''
  const asUser = createClient(SUPABASE_URL, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: isDev, error: e2 } = await asUser.rpc('is_developer')
  if (e2) throw new Fail(500, 'auth_check', 'Gagal memeriksa akses developer')
  if (isDev !== true) throw new Fail(403, 'forbidden', 'Akses ditolak: khusus developer')
  return { user: data.user, asUser }
}

async function upload(file: File, token: string, kind: string, opts: { rarity?: string; name?: string } = {}) {
  const wall = kind === 'wallpaper'
  const emb = kind === 'emblem'
  const pet = kind === 'pet'
  const bor = !wall && !emb && !pet
  const rarity = String(opts.rarity || '').toLowerCase()
  if (bor && !RARITIES.includes(rarity)) throw new Fail(400, 'bad_rarity', 'Rarity border wajib dipilih (basic, standard, premium)')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = pet ? checkPet(bytes) : emb ? checkEmblem(bytes) : wall ? checkWallpaper(bytes) : (checkGif(bytes), 'gif')
  const dir = pet ? PET_DIR : emb ? EMB_DIR : wall ? WALL_DIR : `${BORDER_ROOT}/${rarity}`
  const branch = await branchOf(token)
  const content = b64(bytes)            // byte file dikirim apa adanya: tidak dikompres / diubah, animasi dan transparansi utuh
  // Nama file dibersihkan (buang "Discord avatar decoration", sumber, promosi) lalu diberi angka kalau kembar.
  // Border: dari nama border. Jenis lain: dari nama file asli kalau dikirim aplikasi, kalau tidak -> nama acak seperti dulu.
  const rawName = String(opts.name || '').trim()
  const base = bor ? cleanStem(rawName || file.name) : rawName ? cleanStem(splitExt(rawName)[0]) : ''
  let last: Fail | null = null
  for (let i = 0; i < 8; i++) {
    const name = base
      ? `${i === 0 ? base : `${base}-${i + 1}`}.${ext}`
      : `${Date.now().toString(36)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}.${ext}`
    const path = `${dir}/${name}`
    const res = await gh(token, `/repos/${REPO}/contents/${encPath(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `${pet ? 'pet' : emb ? 'emblem' : wall ? 'wallpaper' : 'border'}: tambah ${path}`, content, branch }),
    })
    if (res.ok) {
      const url = rawUrl(branch, path)
      if (url.length > MAX_URL || (bor && !BORDER_URL_RE.test(url))) throw new Fail(500, 'bad_url', 'Link hasil unggah tidak memenuhi aturan link')
      return { ok: true, url, path, size: bytes.length, rarity: bor ? rarity : undefined }
    }
    last = await ghFail(res, 'unggahan')
    if (last.code !== 'conflict') break      // 422 = nama sudah ada (GitHub tidak pernah menimpa) -> coba nama-2, nama-3, ...
    await new Promise((r) => setTimeout(r, 200))
  }
  throw last ?? new Fail(502, 'github_error', 'Unggah ke GitHub gagal')
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function pathFromUrl(url: string, branch: string): { path: string; kind: 'border' | 'wallpaper' | 'emblem' | 'pet' } | null {
  const base = `^https://raw\\.githubusercontent\\.com/${esc(REPO)}/${esc(branch)}/`
  const mb = new RegExp(`${base}(${DIR}/[A-Za-z0-9._-]+\\.gif)$`).exec(url)
  if (mb) return { path: mb[1], kind: 'border' }
  const mn = new RegExp(`${base}(${BORDER_ROOT}/(?:${RARITIES.join('|')})/[A-Za-z0-9._%-]+\\.gif)$`).exec(url)
  if (mn) { try { return { path: decodeURIComponent(mn[1]), kind: 'border' } } catch { return null } }
  const mw = new RegExp(`${base}(${WALL_DIR}/[A-Za-z0-9._-]+\\.(?:gif|jpg|jpeg|png|webp))$`).exec(url)
  if (mw) return { path: mw[1], kind: 'wallpaper' }
  const me = new RegExp(`${base}(${EMB_DIR}/[A-Za-z0-9._-]+\\.(?:gif|jpg|jpeg|png|webp))$`).exec(url)
  if (me) return { path: me[1], kind: 'emblem' }
  const mp = new RegExp(`${base}(${PET_DIR}/[A-Za-z0-9._-]+\\.(?:gif|png|webp))$`).exec(url)
  if (mp) return { path: mp[1], kind: 'pet' }
  return null
}
async function remove(url: unknown, token: string) {
  if (typeof url !== 'string' || url.length > MAX_URL) throw new Fail(400, 'bad_url', 'Link file tidak valid')
  const branch = await branchOf(token)
  const hit = pathFromUrl(url.trim(), branch)
  if (!hit) throw new Fail(400, 'not_ours', 'Link ini bukan file di repository kita, tidak dihapus')
  const { path, kind } = hit
  const u = url.trim()
  if (kind === 'border') {
    const { data: used, error } = await admin.from('avatar_borders').select('id').eq('image_url', u).limit(1)
    if (error) throw new Fail(500, 'db', 'Gagal memeriksa pemakaian file')
    if (used && used.length) throw new Fail(409, 'in_use', 'File masih dipakai oleh border lain, tidak dihapus')
  } else if (kind === 'pet') {
    const { data: used, error } = await admin.from('pets').select('id').eq('image_url', u).limit(1)
    if (error) throw new Fail(500, 'db', 'Gagal memeriksa pemakaian file')
    if (used && used.length) throw new Fail(409, 'in_use', 'File masih dipakai oleh pet lain, tidak dihapus')
  } else if (kind === 'emblem') {
    const { data: used, error } = await admin.from('clan_emblems').select('id').eq('image_url', u).limit(1)
    if (error) throw new Fail(500, 'db', 'Gagal memeriksa pemakaian file')
    if (used && used.length) throw new Fail(409, 'in_use', 'File masih dipakai oleh emblem lain, tidak dihapus')
  } else {
    const { data: used, error } = await admin.from('gacha_wallpapers').select('id').eq('image_url', u).limit(1)
    if (error) throw new Fail(500, 'db', 'Gagal memeriksa pemakaian file')
    if (used && used.length) throw new Fail(409, 'in_use', 'File masih dipakai oleh wallpaper lain, tidak dihapus')
    const { data: ban, error: e2 } = await admin.from('profiles').select('user_id').eq('banner_url', u).limit(1)
    if (e2) throw new Fail(500, 'db', 'Gagal memeriksa pemakaian file')
    if (ban && ban.length) throw new Fail(409, 'in_use', 'File masih dipakai sebagai banner profil, tidak dihapus')
  }
  const get = await gh(token, `/repos/${REPO}/contents/${encPath(path)}?ref=${encodeURIComponent(branch)}`)
  if (get.status === 404) return { ok: true, deleted: false, notFound: true }
  if (!get.ok) throw await ghFail(get, 'pembacaan file')
  const sha = String((await get.json())?.sha || '')
  if (!sha) throw new Fail(502, 'github_error', 'GitHub tidak mengembalikan sha file')
  const del = await gh(token, `/repos/${REPO}/contents/${encPath(path)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `${kind}: hapus ${path.slice(path.indexOf('/') + 1)}`, sha, branch }),
  })
  if (del.status === 404) return { ok: true, deleted: false, notFound: true }
  if (!del.ok) throw await ghFail(del, 'penghapusan')
  return { ok: true, deleted: true }
}

// ---------------------------------------------------------------------------------------------
// FOLDER & SINKRONISASI GITHUB (upload manual lewat website GitHub -> terdaftar di Shop)
// ---------------------------------------------------------------------------------------------
type Entry = { type: string; name: string; path: string; size: number; sha: string }

async function listDir(token: string, branch: string, dir: string): Promise<Entry[] | null> {
  const res = await gh(token, `/repos/${REPO}/contents/${dir ? encPath(dir) : ''}?ref=${encodeURIComponent(branch)}`)
  if (res.status === 404) return null
  if (!res.ok) throw await ghFail(res, 'pembacaan folder')
  const j = await res.json()
  return Array.isArray(j) ? j.map((e: any) => ({ type: String(e.type), name: String(e.name), path: String(e.path), size: Number(e.size || 0), sha: String(e.sha || '') })) : []
}
async function putKeep(token: string, branch: string, dir: string) {
  const res = await gh(token, `/repos/${REPO}/contents/${encPath(`${dir}/.gitkeep`)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `folder: buat ${dir}`, content: btoa('WakuPlay folder placeholder\n'), branch }),
  })
  if (res.ok || res.status === 422) return   // 422 = sudah ada
  throw await ghFail(res, `pembuatan folder ${dir}`)
}
// Git tidak punya folder kosong: folder dibuat dengan file penanda .gitkeep. Hanya membuat yang BELUM ada, tidak pernah menimpa.
async function ensureFolders(token: string, branch: string) {
  const created: string[] = []
  const root = (await listDir(token, branch, '')) ?? []
  const rootDirs = new Set(root.filter((e) => e.type === 'dir').map((e) => e.name.toLowerCase()))
  let borderDirs: Entry[] | null = rootDirs.has(BORDER_ROOT.toLowerCase()) ? await listDir(token, branch, root.find((e) => e.name.toLowerCase() === BORDER_ROOT.toLowerCase())!.name) : null
  const have = new Map<string, string>()   // rarity (huruf kecil) -> nama folder asli
  for (const e of borderDirs ?? []) if (e.type === 'dir' && RARITIES.includes(e.name.toLowerCase())) have.set(e.name.toLowerCase(), e.name)
  for (const r of RARITIES) {
    if (have.has(r)) continue
    await putKeep(token, branch, `${BORDER_ROOT}/${r}`)
    have.set(r, r); created.push(`${BORDER_ROOT}/${r}`)
  }
  for (const d of ROOT_DIRS) {
    if (rootDirs.has(d.toLowerCase())) continue
    await putKeep(token, branch, d)
    created.push(d)
  }
  return { have, created, borderEntries: borderDirs ?? [] }
}

function gifHeadReason(u8: Uint8Array, size: number): string {
  if (u8.length < 14) return 'File terlalu kecil / tidak terbaca'
  const sig = String.fromCharCode(...u8.subarray(0, 6))
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return 'Isi file bukan GIF yang valid'
  const w = u8[6] | (u8[7] << 8)
  const h = u8[8] | (u8[9] << 8)
  if (!w || !h) return 'GIF tidak terbaca (ukuran 0)'
  if (size >= MAX_UPLOAD) return `Ukuran file harus di bawah 10 MB (ini ${(size / 1048576).toFixed(1)} MB)`
  if (Math.min(w, h) < MIN_SIDE) return `Gambar terlalu kecil (${w}x${h}). Minimal ${MIN_SIDE}px`
  if (Math.max(w, h) > MAX_SIDE) return `Gambar terlalu besar (${w}x${h}). Maksimal ${MAX_SIDE}px`
  if (Math.abs(w - h) / Math.max(w, h) > SQUARE_TOLERANCE) return `Gambar harus persegi (1:1), ini ${w}x${h}`
  return ''
}
// Hanya 32 byte pertama yang dibaca (cukup untuk tanda tangan + ukuran GIF). File tidak diunduh penuh dan TIDAK diubah.
async function readHead(token: string, url: string, sha: string): Promise<Uint8Array> {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-31' } })
    if (r.ok && r.body) {
      const rd = r.body.getReader()
      const got: number[] = []
      while (got.length < 32) {
        const { done, value } = await rd.read()
        if (done || !value) break
        for (const b of value) { got.push(b); if (got.length >= 32) break }
      }
      try { await rd.cancel() } catch { }
      if (got.length >= 14) return new Uint8Array(got)
    } else { try { await r.body?.cancel() } catch { } }
  } catch { }
  const res = await gh(token, `/repos/${REPO}/git/blobs/${sha}`)
  if (!res.ok) throw await ghFail(res, 'pembacaan file')
  const j = await res.json()
  const bin = atob(String(j?.content || '').replace(/\s/g, '').slice(0, 44))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

// ---------------------------------------------------------------------------------------------
// BERSIHKAN NAMA FILE DI GITHUB (semua subfolder Border/, Wallpaper/, Emblem/, Pet/)
// Rename = commit Git (blob SAMA, path baru): isi file tidak diunduh / diubah. File yang sedang dipakai di database TIDAK diganti
// (link-nya akan putus). File baru / belum terdaftar aman diganti.
// ---------------------------------------------------------------------------------------------
const IMG_EXT_RE = /\.(gif|png|jpe?g|webp)$/i
const pathKey = (u: string) => {
  const m = new RegExp(`^https://raw\\.githubusercontent\\.com/${esc(REPO)}/[^/]+/(.+)$`, 'i').exec(u.trim())
  if (!m) return ''
  let p = m[1]; try { p = decodeURIComponent(p) } catch { }
  return p.toLowerCase()
}
async function usedPathKeys(): Promise<Set<string>> {
  const set = new Set<string>()
  const like = `https://raw.githubusercontent.com/${REPO}/%`
  const srcs: [string, string][] = [['avatar_borders', 'image_url'], ['gacha_wallpapers', 'image_url'], ['clan_emblems', 'image_url'], ['pets', 'image_url'], ['profiles', 'banner_url']]
  for (const [t, c] of srcs) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(t).select(c).like(c, like).range(from, from + 999)
      if (error) throw new Fail(500, 'db', `Gagal memeriksa pemakaian file (${t})`)
      for (const r of (data || []) as Record<string, unknown>[]) { const k = pathKey(String(r[c] || '')); if (k) set.add(k) }
      if (!data || data.length < 1000) break
    }
  }
  return set
}
async function commitRenames(token: string, branch: string, moves: { from: string; to: string; sha: string; mode: string }[]) {
  const ref = await gh(token, `/repos/${REPO}/git/ref/heads/${encPath(branch)}`)
  if (!ref.ok) throw await ghFail(ref, 'pembacaan branch')
  const head = String((await ref.json())?.object?.sha || '')
  const cm = await gh(token, `/repos/${REPO}/git/commits/${head}`)
  if (!cm.ok) throw await ghFail(cm, 'pembacaan commit')
  const baseTree = String((await cm.json())?.tree?.sha || '')
  const tree: unknown[] = []
  for (const m of moves) {
    tree.push({ path: m.to, mode: m.mode, type: 'blob', sha: m.sha })
    tree.push({ path: m.from, mode: m.mode, type: 'blob', sha: null })
  }
  const jh = { 'Content-Type': 'application/json' }
  const tr = await gh(token, `/repos/${REPO}/git/trees`, { method: 'POST', headers: jh, body: JSON.stringify({ base_tree: baseTree, tree }) })
  if (!tr.ok) throw await ghFail(tr, 'pembuatan tree')
  const treeSha = String((await tr.json())?.sha || '')
  const nc = await gh(token, `/repos/${REPO}/git/commits`, { method: 'POST', headers: jh, body: JSON.stringify({ message: `bersihkan nama file (${moves.length})`, tree: treeSha, parents: [head] }) })
  if (!nc.ok) throw await ghFail(nc, 'pembuatan commit')
  const newSha = String((await nc.json())?.sha || '')
  const up = await gh(token, `/repos/${REPO}/git/refs/heads/${encPath(branch)}`, { method: 'PATCH', headers: jh, body: JSON.stringify({ sha: newSha }) })
  if (!up.ok) throw await ghFail(up, 'pembaruan branch')
}
async function cleanAssets(token: string, opts: { apply: boolean; roots?: string[] }) {
  const info = await repoInfo(token)
  const branch = info.branch
  const res = await gh(token, `/repos/${REPO}/git/trees/${encodeURIComponent(branch)}?recursive=1`)
  if (!res.ok) throw await ghFail(res, 'pembacaan isi repository')
  const j = await res.json()
  const truncated = !!j?.truncated
  const roots = (opts.roots ?? [BORDER_ROOT, ...ROOT_DIRS]).map((r) => r.toLowerCase())
  const blobs = ((j?.tree || []) as any[]).filter((t) => t.type === 'blob' && roots.includes(String(t.path).split('/')[0].toLowerCase()))
  const taken = new Map<string, Set<string>>()                     // folder -> nama file (huruf kecil) yang sudah ada / sudah direncanakan
  for (const t of blobs) {
    const i = String(t.path).lastIndexOf('/')
    const d = String(t.path).slice(0, i)
    if (!taken.has(d)) taken.set(d, new Set())
    taken.get(d)!.add(String(t.path).slice(i + 1).toLowerCase())
  }
  const used = await usedPathKeys()
  const moves: { from: string; to: string; sha: string; mode: string }[] = []
  const skipped: { path: string; reason: string }[] = []
  let unchanged = 0, scanned = 0
  for (const t of blobs.sort((a, b) => String(a.path).localeCompare(String(b.path)))) {
    const path = String(t.path)
    if (!IMG_EXT_RE.test(path)) continue
    scanned++
    const i = path.lastIndexOf('/')
    const dir = path.slice(0, i), name = path.slice(i + 1)
    const target = cleanFileName(name)
    if (target === name) { unchanged++; continue }
    if (used.has(path.toLowerCase())) { skipped.push({ path, reason: 'sedang dipakai di aplikasi, tidak diganti (link akan putus)' }); continue }
    const set = taken.get(dir)!
    set.delete(name.toLowerCase())
    const [stem, ext] = splitExt(target)
    let n = 1, cand = target
    while (set.has(cand.toLowerCase())) { n++; cand = `${stem}-${n}.${ext}` }
    set.add(cand.toLowerCase())
    moves.push({ from: path, to: `${dir}/${cand}`, sha: String(t.sha), mode: String(t.mode || '100644') })
  }
  let applied = 0
  const failed: string[] = []
  if (opts.apply) {
    for (let i = 0; i < moves.length; i += 80) {
      const chunk = moves.slice(i, i + 80)
      try { await commitRenames(token, branch, chunk); applied += chunk.length }
      catch (e) { failed.push(e instanceof Fail ? e.message : 'Gagal mengganti nama sekelompok file'); break }
    }
  }
  return { ok: true, branch, scanned, unchanged, planned: moves.length, planned_list: moves.slice(0, 200).map((m) => ({ from: m.from, to: m.to })),
    skipped: skipped.length, skipped_list: skipped.slice(0, 100), applied, failed, truncated, dry_run: !opts.apply }
}

async function syncBorders(token: string, asUser: any) {
  const info = await repoInfo(token)
  if (!info.push) throw new Fail(502, 'token_forbidden', 'Token GitHub tidak punya izin menulis ke repository border (butuh izin Contents: Read and write).')
  const branch = info.branch
  const { have, created } = await ensureFolders(token, branch)
  // Nama file hasil upload manual dibersihkan dulu (hanya yang belum terdaftar), supaya nama border & link rapi
  let cleaned = 0, cleanSkipped = 0, cleanError = ''
  try { const c = await cleanAssets(token, { apply: true, roots: [BORDER_ROOT] }); cleaned = c.applied; cleanSkipped = c.skipped; if (c.failed.length) cleanError = c.failed[0] }
  catch (e) { cleanError = e instanceof Fail ? e.message : 'Pembersihan nama file gagal' }

  const failed: { path: string; reason: string }[] = []
  const ignoredList: string[] = []
  let ignored = 0
  let complete = true
  const allPaths: string[] = []
  type Cand = { path: string; rarity: string; file: string; url: string; sha: string; size: number }
  const cands: Cand[] = []

  const top = (await listDir(token, branch, BORDER_ROOT)) ?? []
  for (const e of top) {
    if (e.type === 'dir' && RARITIES.includes(e.name.toLowerCase())) continue
    if (e.name === '.gitkeep') continue
    ignored++; if (ignoredList.length < 50) ignoredList.push(`${e.path}: ${e.type === 'dir' ? 'folder bukan rarity' : 'file di luar folder rarity'}`)
  }
  for (const [rarity, folder] of have) {
    const dir = `${BORDER_ROOT}/${folder}`
    if (created.includes(`${BORDER_ROOT}/${rarity}`)) continue            // baru dibuat, isinya hanya .gitkeep
    const files = (await listDir(token, branch, dir)) ?? []
    if (files.length >= 1000) complete = false                            // batas listing GitHub 1000 file / folder
    for (const e of files) {
      if (e.type !== 'file') { ignored++; if (ignoredList.length < 50) ignoredList.push(`${e.path}: subfolder diabaikan`); continue }
      const lower = e.name.toLowerCase()
      if (lower === '.gitkeep' || lower === 'readme.md') continue
      if (!lower.endsWith('.gif')) { ignored++; if (ignoredList.length < 50) ignoredList.push(`${e.path}: bukan file .gif, diabaikan`); continue }
      allPaths.push(e.path)
      if (!FILE_NAME_RE.test(e.name)) { failed.push({ path: e.path, reason: 'Nama file mengandung karakter yang tidak diizinkan (/ \\ ? # % @ < > " | * :) atau lebih dari 120 karakter. Ganti nama file di GitHub' }); continue }
      if (e.size <= 0) { failed.push({ path: e.path, reason: 'File kosong' }); continue }
      if (e.size >= MAX_UPLOAD) { failed.push({ path: e.path, reason: `Ukuran file harus di bawah 10 MB (ini ${(e.size / 1048576).toFixed(1)} MB)` }); continue }
      const url = rawUrl(branch, e.path.split('/').map(encodeURIComponent).join('/'))
      if (url.length > MAX_URL || !BORDER_URL_RE.test(url)) { failed.push({ path: e.path, reason: 'Link file melebihi 500 karakter / tidak memenuhi aturan link' }); continue }
      cands.push({ path: e.path, rarity, file: e.name, url, sha: e.sha, size: e.size })
    }
  }

  const { data: known, error: ke } = await asUser.rpc('dev_border_sync_known')
  if (ke) throw new Fail(500, 'db', `Gagal membaca daftar border: ${ke.message}`)
  const kp = new Set<string>((known?.paths || []) as string[])
  const ku = new Set<string>((known?.urls || []) as string[])
  const items: Cand[] = []
  const fresh: Cand[] = []
  for (const c of cands) (kp.has(c.path.toLowerCase()) || ku.has(c.url.toLowerCase()) ? items : fresh).push(c)
  const toCheck = fresh.slice(0, SYNC_VALIDATE_MAX)
  const pending = fresh.length - toCheck.length

  for (let i = 0; i < toCheck.length; i += 6) {
    await Promise.all(toCheck.slice(i, i + 6).map(async (c) => {
      try {
        const reason = gifHeadReason(await readHead(token, c.url, c.sha), c.size)
        if (reason) failed.push({ path: c.path, reason }); else items.push(c)
      } catch (e) {
        failed.push({ path: c.path, reason: e instanceof Fail ? e.message : 'File tidak bisa dibaca dari GitHub' })
      }
    }))
  }

  const { data, error } = await asUser.rpc('dev_border_sync_apply', {
    p_items: items.map((c) => ({ path: c.path, rarity: c.rarity, url: c.url, file: cleanFileName(c.file) })),
    p_all_paths: allPaths,
    p_complete: complete,
    p_meta: { failed: failed.slice(0, 100), ignored, ignored_list: ignoredList, pending },
  })
  if (error) throw new Fail(500, 'db', `Gagal menyimpan hasil sinkronisasi: ${error.message}`)
  return { ...(data as object), ok: true, branch, created_folders: created, failed_total: failed.length, cleaned, clean_skipped: cleanSkipped, clean_error: cleanError }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail(405, 'method', 'Metode tidak didukung')
  try {
    const { asUser } = await requireDeveloper(req)
    const token = (Deno.env.get('GITHUB_TOKEN') || '').trim()
    if (!token) throw new Fail(500, 'no_token', 'Secret GITHUB_TOKEN belum diisi di Supabase Edge Functions')

    const ct = req.headers.get('content-type') || ''
    if (ct.includes('multipart/form-data')) {
      const len = Number(req.headers.get('content-length') || 0)
      if (len > MAX_WALL + 256 * 1024) throw new Fail(413, 'too_large', 'Ukuran file terlalu besar')
      const form = await req.formData()
      const k = String(form.get('kind') || 'border')
      const kind = k === 'wallpaper' ? 'wallpaper' : k === 'emblem' ? 'emblem' : k === 'pet' ? 'pet' : 'border'
      if (kind === 'pet' && len > MAX_PET + 256 * 1024) throw new Fail(413, 'too_large', 'Ukuran pet maksimal 5 MB')
      if (kind === 'emblem' && len > MAX_EMB + 256 * 1024) throw new Fail(413, 'too_large', 'Ukuran emblem maksimal 2 MB')
      if (kind === 'border' && len > MAX_UPLOAD + 256 * 1024) throw new Fail(413, 'too_large', 'Ukuran file harus di bawah 10 MB')
      const f = form.get('file')
      if (!(f instanceof File)) throw new Fail(400, 'no_file', 'File tidak ditemukan di permintaan')
      return json(200, await upload(f, token, kind, { rarity: String(form.get('rarity') || ''), name: String(form.get('name') || '') }))
    }
    let body: any = null
    try { body = await req.json() } catch { }
    if (body?.action === 'delete') return json(200, await remove(body.url, token))
    if (body?.action === 'clean') return json(200, await cleanAssets(token, { apply: body.apply === true }))
    if (body?.action === 'sync') return json(200, await syncBorders(token, asUser))
    if (body?.action === 'init') {
      const info = await repoInfo(token)
      if (!info.push) throw new Fail(502, 'token_forbidden', 'Token GitHub tidak punya izin menulis ke repository border (butuh izin Contents: Read and write).')
      const r = await ensureFolders(token, info.branch)
      return json(200, { ok: true, created_folders: r.created })
    }
    if (body?.action === 'check') {
      const info = await repoInfo(token)
      if (!info.push) throw new Fail(502, 'token_forbidden', 'Token GitHub tidak punya izin menulis ke repository border (butuh izin Contents: Read and write).')
      return json(200, { ok: true, repo: REPO, branch: info.branch, private: info.private, dir: DIR, border_dir: BORDER_ROOT, rarities: RARITIES, wallpaper_dir: WALL_DIR, emblem_dir: EMB_DIR, pet_dir: PET_DIR })
    }
    throw new Fail(400, 'bad_request', 'Permintaan tidak dikenali')
  } catch (e) {
    if (e instanceof Fail) return fail(e.status, e.code, e.message)
    console.error('border-gif error', e)
    return fail(500, 'internal', 'Terjadi kesalahan di server')
  }
})
