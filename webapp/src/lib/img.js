import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { idbGet, idbSet, idbAll } from './store'

const UA = 'Mozilla/5.0 (Linux; Android 13; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const VARIANTS = [
  { 'User-Agent': UA, Referer: 'https://animein.net/' },
  { 'User-Agent': UA, Referer: 'https://animein.net/', Origin: 'https://animein.net' },
  { 'User-Agent': UA, Referer: 'https://www.animein.net/' },
]

const cache = new Map()
const resolved = new Map()
export function keyOf(url) {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\/(?:assets|assets_xyz)\/(.+)$/)
    if (m) return 'animein:' + m[1]
    return u.origin + u.pathname + u.search
  } catch { return url }
}
const SNAP = 'wp_snap_v1'
let snap = {}
try { snap = JSON.parse(localStorage.getItem(SNAP) || '{}') || {} } catch { snap = {} }
let snapT = null
function saveSnap() {
  clearTimeout(snapT)
  snapT = setTimeout(() => {
    for (let n = 0; n < 4; n++) {
      try { localStorage.setItem(SNAP, JSON.stringify(snap)); return } catch {
        const ks = Object.keys(snap); ks.slice(0, Math.ceil(ks.length / 2)).forEach((k) => delete snap[k])
      }
    }
  }, 800)
}
export function snapshotImages(urls, width = 360, max = 40) {
  ;(urls || []).filter(Boolean).slice(0, max).forEach((u) => {
    const k = keyOf(u)
    if (snap[k] && snap[k].w >= width) return
    const src = resolved.get(k)
    if (!src || src.startsWith('data:')) return
    const im = new Image()
    im.onload = () => {
      try {
        const w = Math.min(width, im.naturalWidth), h = Math.round((im.naturalHeight * w) / im.naturalWidth)
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d').drawImage(im, 0, 0, w, h)
        snap[k] = { w, d: c.toDataURL('image/jpeg', 0.8) }
        const ks = Object.keys(snap)
        if (ks.length > 70) ks.slice(0, ks.length - 70).forEach((x) => delete snap[x])
        saveSnap()
      } catch { }
    }
    im.src = src
  })
}
export const peekImage = (url) => {
  if (!url) return null
  const k = keyOf(url)
  return resolved.get(k) || (snap[k] && snap[k].d) || null
}
const hasFull = (url) => resolved.has(keyOf(url))
const listeners = new Set()
let notifyT = null
export function subscribeImages(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function put(url, objUrl) {
  resolved.set(keyOf(url), objUrl)
  if (notifyT) return
  notifyT = setTimeout(() => { notifyT = null; listeners.forEach((f) => f()) }, 30)
}
let running = 0
const jobs = new Map()
const queue = []
const MAX = 12
let goodVariant = 0
export const imgStats = { ok: 0, fail: 0, last: '' }

function pump() {
  while (running < MAX && queue.length) {
    const job = queue.shift()
    running++
    job().finally(() => { running--; pump() })
  }
}

function mimeOf(url, headers) {
  const h = headers && (headers['Content-Type'] || headers['content-type'])
  if (h && h.startsWith('image/')) return h.split(';')[0]
  if (/\.png/i.test(url)) return 'image/png'
  if (/\.webp/i.test(url)) return 'image/webp'
  return 'image/jpeg'
}

function b64ToBlob(b64, mime) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function fetchOnce(url, headers) {
  const r = await CapacitorHttp.get({
    url,
    responseType: 'blob',
    headers: { ...headers, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    connectTimeout: 15000,
    readTimeout: 20000,
  })
  const ct = (r.headers && (r.headers['Content-Type'] || r.headers['content-type'])) || ''
  const info = `status ${r.status}, type ${ct || '-'}, data ${typeof r.data}${typeof r.data === 'string' ? ' len ' + r.data.length : ''}`
  if (r.status >= 200 && r.status < 300 && typeof r.data === 'string' && r.data.length > 100 && (!ct || ct.startsWith('image/'))) {
    const blob = b64ToBlob(r.data, mimeOf(url, r.headers))
    return { url: URL.createObjectURL(blob), blob, info }
  }
  return { url: null, info }
}

export function candidates(url) {
  const out = [url]
  try {
    const u = new URL(url)
    if (u.hostname === 'api.animein.net' && u.pathname.startsWith('/assets/')) {
      out.push('https://xyz-api.animein.net/assets_xyz/' + u.pathname.slice('/assets/'.length))
    } else if (u.hostname === 'xyz-api.animein.net' && u.pathname.startsWith('/assets_xyz/')) {
      out.push('https://api.animein.net/assets/' + u.pathname.slice('/assets_xyz/'.length))
    } else if (!/animein\.net$/.test(u.hostname) && u.pathname.startsWith('/assets/')) {
      out.push('https://api.animein.net' + u.pathname)
    }
  } catch { }
  return out
}

async function fetchImage(url) {
  let info = ''
  for (const cand of candidates(url)) {
    const r = await fetchImageFrom(cand)
    if (r.url) {
      put(url, r.url)
      if (r.blob) idbSet('img', keyOf(url), { t: Date.now(), blob: r.blob })
      return r.url
    }
    info = r.info
  }
  imgStats.fail++
  imgStats.last = 'GAGAL: ' + info
  return null
}

async function fetchImageFrom(url) {
  let info = ''
  const order = [goodVariant, ...VARIANTS.map((_, i) => i).filter((i) => i !== goodVariant)]
  for (const vi of order) {
    const h = VARIANTS[vi]
    try {
      const res = await fetchOnce(url, h)
      info = res.info
      if (res.url) { goodVariant = vi; imgStats.ok++; imgStats.last = 'OK: ' + info; return { url: res.url, blob: res.blob, info } }
    } catch (e) {
      info = 'error: ' + (e?.message || e)
    }
  }
  return { url: null, info }
}

export function loadImageNative(url, low = false) {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(null)
  if (hasFull(url)) return Promise.resolve(resolved.get(keyOf(url)))
  const ck = keyOf(url)
  if (cache.has(ck)) {
    if (!low) { const j = jobs.get(ck); const i = j ? queue.indexOf(j) : -1; if (i > 0) { queue.splice(i, 1); queue.unshift(j) } }
    return cache.get(ck)
  }
  const p = (async () => {
    const hit = (await idbGet('img', ck)) || (await idbGet('img', url))
    if (hit && hit.blob) {
      const u = URL.createObjectURL(hit.blob)
      put(url, u)
      return u
    }
    return new Promise((resolve) => {
      const job = () => { jobs.delete(ck); return fetchImage(url).then(resolve) }
      jobs.set(ck, job)
      if (low) queue.push(job); else queue.unshift(job)
      pump()
    })
  })()
  cache.set(ck, p)
  p.then((v) => { if (!v) cache.delete(ck) })
  return p
}

export async function testImage() {
  const u = 'https://api.animein.net/assets/images/movie/cover/73f33e42be21d8bcdf8e45f544aea7a0.jpg'
  if (!Capacitor.isNativePlatform()) return 'Hanya jalan di aplikasi Android'
  const out = []
  for (const [i, h] of VARIANTS.entries()) {
    try { out.push(`#${i + 1}: ` + (await fetchOnce(u, h)).info) } catch (e) { out.push(`#${i + 1}: error ${e?.message || e}`) }
  }
  out.push(`Statistik: ${imgStats.ok} berhasil, ${imgStats.fail} gagal. Terakhir: ${imgStats.last || '-'}`)
  return out.join('\n')
}

export async function warmImages(limit = 1500) {
  if (!Capacitor.isNativePlatform()) return
  try {
    const rows = await idbAll('img')
    rows
      .filter(([, v]) => v && v.blob)
      .sort((a, b) => (b[1].t || 0) - (a[1].t || 0))
      .slice(0, limit)
      .forEach(([url, v]) => { if (!hasFull(url)) put(url, URL.createObjectURL(v.blob)) })
  } catch { }
}

export function prefetchImages(urls, low = true) {
  if (!Capacitor.isNativePlatform()) return
  const seen = new Set()
  ;(urls || []).forEach((u) => {
    if (!u || seen.has(u) || hasFull(u)) return
    seen.add(u)
    loadImageNative(u, low).catch(() => {})
  })
}

export function collectUrls(data) {
  const urls = []
  const walk = (v, d) => {
    if (!v || d > 5) return
    if (Array.isArray(v)) { v.forEach((x) => walk(x, d + 1)); return }
    if (typeof v !== 'object') return
    for (const k of ['poster', 'cover']) if (typeof v[k] === 'string' && /^https?:/i.test(v[k])) urls.push(v[k])
    for (const k in v) if (v[k] && typeof v[k] === 'object') walk(v[k], d + 1)
  }
  try { walk(data, 0) } catch { }
  return urls
}

export function prefetchSlow(urls, per = 6, every = 450) {
  if (!Capacitor.isNativePlatform()) return () => {}
  const q = [...new Set((urls || []).filter(Boolean))].filter((u) => !hasFull(u))
  let t = null
  const step = () => {
    q.splice(0, per).forEach((u) => { if (!hasFull(u)) loadImageNative(u, true).catch(() => {}) })
    if (q.length) t = setTimeout(step, every)
  }
  if (q.length) t = setTimeout(step, every)
  return () => clearTimeout(t)
}

export function prefetchDeep(data) {
  prefetchSlow(collectUrls(data))
  return data
}

export async function ensureImages(urls, ms = 3500) {
  if (!Capacitor.isNativePlatform()) return
  const list = [...new Set((urls || []).filter(Boolean))].filter((u) => !hasFull(u))
  if (!list.length) return
  let timer
  const limit = new Promise((r) => { timer = setTimeout(r, ms) })
  const all = Promise.all(list.slice().reverse().map((u) => loadImageNative(u, false).catch(() => null)))
  await Promise.race([all, limit])
  clearTimeout(timer)
}

export async function warmImagesFor(urls) {
  if (!Capacitor.isNativePlatform()) return
  const list = [...new Set((urls || []).filter(Boolean))].filter((u) => !hasFull(u))
  await Promise.all(list.map(async (u) => {
    try {
      const hit = (await idbGet('img', keyOf(u))) || (await idbGet('img', u))
      if (hit && hit.blob) put(u, URL.createObjectURL(hit.blob))
    } catch { }
  }))
}
