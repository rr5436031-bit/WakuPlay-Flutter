import { createClient } from 'npm:@supabase/supabase-js@2'

const BASE = (Deno.env.get('ANIME_API_BASE') || 'https://animeinweb-api.vercel.app/api').replace(/\/+$/, '')
const SECRET = Deno.env.get('PUSH_SECRET') ?? ''
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function safeEq(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

const pick = (o: any, keys: string[]) => { if (!o || typeof o !== 'object') return undefined; for (const k of keys) { const v = o[k]; if (v !== undefined && v !== null && v !== '') return v } return undefined }
const unwrap = (r: any) => (r && typeof r === 'object' && 'data' in r && r.data != null ? r.data : r)
function listFrom(x: any): any[] {
  if (Array.isArray(x)) return x
  if (!x || typeof x !== 'object') return []
  for (const k of ['results', 'items', 'list', 'data', 'animes', 'anime', 'episodes', 'rows']) {
    if (Array.isArray(x[k])) return x[k]
    if (x[k] && typeof x[k] === 'object') { const inner = listFrom(x[k]); if (inner.length) return inner }
  }
  for (const v of Object.values(x)) if (Array.isArray(v)) return v
  return []
}
const IMG_ORIGIN = 'https://api.animein.net'
const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i
function fixUrl(u: string): string | undefined {
  u = u.trim().replace(/([^:])\/{2,}/g, '$1/')
  if (!u) return undefined
  if (u.startsWith('//')) return 'https:' + u
  if (u.startsWith('http://')) return 'https://' + u.slice(7)
  if (/^https:\/\//i.test(u)) return u
  if (u.startsWith('/')) return IMG_ORIGIN + u
  if (/^(assets|assets_xyz|images|uploads)\//i.test(u) || IMG_EXT.test(u)) return IMG_ORIGIN + '/' + u
  return undefined
}
function asUrl(v: any): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return fixUrl(v)
  if (Array.isArray(v)) { for (const x of v) { const r = asUrl(x); if (r) return r } return undefined }
  if (typeof v === 'object') return asUrl(pick(v, ['url', 'src', 'large', 'original', 'medium', 'small', 'path', 'link']))
  return undefined
}
function findPoster(o: any): string | undefined {
  for (const k of ['image_poster', 'poster', 'poster_url', 'posterUrl', 'image', 'image_url', 'thumbnail', 'thumb', 'img', 'cover']) { const r = asUrl(o[k]); if (r) return r }
  for (const [k, v] of Object.entries(o)) if (/(poster|image|img|cover|thumb)/i.test(k)) { const r = asUrl(v); if (r) return r }
  return undefined
}
function findTitle(o: any): string | undefined {
  const t = pick(o, ['title', 'name', 'title_english', 'title_en', 'title_romaji', 'judul', 'anime_title', 'animeTitle', 'series_title'])
  if (typeof t === 'string') return t
  if (t && typeof t === 'object') { const x = pick(t, ['english', 'romaji', 'default', 'native', 'en', 'id']); if (typeof x === 'string') return x }
  for (const [k, v] of Object.entries(o)) if (/(title|name|judul)/i.test(k) && typeof v === 'string' && v.trim()) return v
  return undefined
}
function toItem(raw: any) {
  if (!raw || typeof raw !== 'object') return null
  const o = raw.anime && typeof raw.anime === 'object' ? { ...raw, ...raw.anime } : raw
  const id = pick(o, ['id', 'anime_id', 'animeId'])
  if (id === undefined || id === null) return null
  const e = pick(o, ['episode', 'episode_number', 'latest_episode', 'last_episode', 'eps', 'episodes', 'total_episodes', 'episode_count'])
  const m = String(e ?? '').match(/\d+(?:\.\d+)?/)
  return { id: String(id), title: findTitle(o) || 'Anime', poster: findPoster(o), ep: m ? Number(m[0]) : null }
}

async function get(path: string) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000)
  try {
    const res = await fetch(BASE + path, { headers: { Accept: 'application/json' }, signal: ctl.signal })
    if (!res.ok) throw new Error('API ' + res.status + ' ' + path)
    return await res.json()
  } finally { clearTimeout(t) }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false })
  if (!SECRET) return json(503, { ok: false, error: 'belum dikonfigurasi' })
  if (!safeEq(req.headers.get('x-push-secret') ?? '', SECRET)) return json(401, { ok: false, error: 'secret salah' })
  const body: any = await req.json().catch(() => ({}))

  const items = new Map<string, any>()
  const add = (arr: any[]) => {
    for (const r of arr) {
      const it = toItem(r)
      if (!it || !it.ep) continue
      const old = items.get(it.id)
      items.set(it.id, old ? { id: it.id, ep: Math.max(old.ep, it.ep), poster: it.poster || old.poster, title: old.title !== 'Anime' ? old.title : it.title } : it)
    }
  }
  try {
    const home = unwrap(await get('/homepage')) || {}
    for (const keys of [['new', 'new_anime', 'newAnime', 'latest'], ['today']]) { for (const k of keys) if (home[k]) { add(listFrom(home[k])); break } }
  } catch (e) { console.error(String(e)); return json(502, { ok: false, error: 'API anime tidak bisa dibuka' }) }
  try {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Jakarta' }).format(new Date()).toUpperCase()
    add(listFrom(unwrap(await get('/schedule?day=' + day))))
  } catch { }

  const list = [...items.values()].map((i) => ({ id: i.id, title: i.title, poster: i.poster ?? null, ep: i.ep }))
  if (body?.dry) return json(200, { ok: true, dry: true, count: list.length, sample: list.slice(0, 15) })
  if (!list.length) return json(200, { ok: true, count: 0, notified: 0 })
  const { data, error } = await admin.rpc('episode_watch_apply', { p_items: list })
  if (error) { console.error('apply', error.message); return json(500, { ok: false }) }
  return json(200, { ok: true, count: list.length, notified: data })
})
