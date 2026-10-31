
export const pick = (o, keys) => {
  if (!o || typeof o !== 'object') return undefined
  for (const k of keys) {
    const v = o[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

export const unwrap = (r) => (r && typeof r === 'object' && 'data' in r && r.data != null ? r.data : r)

export function listFrom(x) {
  if (Array.isArray(x)) return x
  if (!x || typeof x !== 'object') return []
  for (const k of ['results', 'items', 'list', 'data', 'animes', 'anime', 'episodes', 'rows']) {
    if (Array.isArray(x[k])) return x[k]
    if (x[k] && typeof x[k] === 'object') {
      const inner = listFrom(x[k])
      if (inner.length) return inner
    }
  }
  for (const v of Object.values(x)) if (Array.isArray(v)) return v
  return []
}

const IMG_ORIGIN = 'https://api.animein.net'
const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i
const IMG_KEY = /(image_poster|image_cover|poster|image|img|cover|thumb|photo|pic|banner|artwork|backdrop|wallpaper|portrait|landscape)/i

function fixUrl(u) {
  u = u.trim().replace(/([^:])\/{2,}/g, '$1/')
  if (!u) return undefined
  if (u.startsWith('//')) return 'https:' + u
  if (u.startsWith('http://')) return 'https://' + u.slice(7)
  if (/^https:\/\//i.test(u) || u.startsWith('data:image')) return u
  if (u.startsWith('/')) return IMG_ORIGIN + u
  if (/^(assets|assets_xyz|images|uploads)\//i.test(u) || IMG_EXT.test(u)) return IMG_ORIGIN + '/' + u
  return undefined
}

export function asUrl(v) {
  if (!v) return undefined
  if (typeof v === 'string') return fixUrl(v)
  if (Array.isArray(v)) { for (const x of v) { const r = asUrl(x); if (r) return r } return undefined }
  if (typeof v === 'object') return asUrl(pick(v, ['url', 'src', 'large', 'original', 'medium', 'small', 'path', 'link']))
  return undefined
}

export function findImage(o, preferKeys = [], depth = 0) {
  if (!o || typeof o !== 'object' || depth > 2) return undefined
  for (const k of preferKeys) { const r = asUrl(o[k]); if (r) return r }
  for (const [k, v] of Object.entries(o)) {
    if (IMG_KEY.test(k)) { const r = asUrl(v); if (r) return r }
  }
  for (const v of Object.values(o)) {
    if (typeof v === 'string' && IMG_EXT.test(v)) { const r = asUrl(v); if (r) return r }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') { const r = findImage(v, [], depth + 1); if (r) return r }
  }
  return undefined
}

function findTitle(o) {
  const t = pick(o, ['title', 'name', 'title_english', 'title_en', 'title_romaji', 'judul', 'anime_title', 'animeTitle', 'series_title'])
  if (typeof t === 'string') return t
  if (t && typeof t === 'object') { const x = pick(t, ['english', 'romaji', 'default', 'native', 'en', 'id']); if (typeof x === 'string') return x }
  for (const [k, v] of Object.entries(o)) if (/(title|name|judul)/i.test(k) && typeof v === 'string' && v.trim()) return v
  return undefined
}

const num = (v) => {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return isFinite(n) ? n : undefined
}

function toGenres(v) {
  if (!v) return []
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean)
  if (Array.isArray(v)) return v.map((g) => (typeof g === 'string' ? g : pick(g, ['name', 'title', 'label']))).filter(Boolean)
  return []
}

export function toAnime(raw) {
  if (!raw || typeof raw !== 'object') return { id: undefined }
  const o = raw.anime && typeof raw.anime === 'object' ? { ...raw, ...raw.anime } : raw
  const flag = pick(o, ['is_new', 'isNew', 'new'])
  return {
    id: pick(o, ['id', 'anime_id', 'animeId']),
    title: findTitle(o) || 'Tanpa judul',
    poster: findImage(o, ['image_poster', 'poster', 'poster_url', 'posterUrl', 'image', 'image_url', 'thumbnail', 'thumb', 'img', 'cover']),
    cover: findImage(o, ['image_cover', 'cover', 'cover_url', 'banner', 'banner_url', 'backdrop', 'wallpaper', 'poster', 'image']),
    rating: num(pick(o, ['score', 'rating', 'mean', 'rate'])),
    views: pick(o, ['views', 'view', 'view_count', 'viewCount', 'total_views']),
    episode: pick(o, ['episode', 'episode_number', 'latest_episode', 'last_episode', 'eps', 'episodes', 'total_episodes', 'episode_count']),
    status: pick(o, ['status']),
    type: pick(o, ['type', 'format']),
    synopsis: pick(o, ['synopsis', 'sinopsis', 'description', 'overview', 'desc']),
    genres: toGenres(pick(o, ['genres', 'genre'])),
    isNew: flag === true || flag === 1 || flag === '1' || flag === 'true',
    time: pick(o, ['time', 'release_time', 'broadcast_time', 'airing_time', 'jam', 'aired_at', 'airing_at']),
  }
}

const list = (x) => listFrom(x).map(toAnime).filter((a) => a.id !== undefined && a.id !== null)

export function toHome(res) {
  const d = unwrap(res) || {}
  const sec = (...keys) => {
    for (const k of keys) if (d[k]) return list(d[k])
    return []
  }
  return {
    slider: sec('slider', 'sliders', 'banner', 'banners'),
    hot: sec('hot', 'hot_anime', 'hotAnime'),
    fresh: sec('new', 'new_anime', 'newAnime', 'latest'),
    today: sec('today'),
    popular: sec('popular'),
    trailer: sec('trailer', 'trailers'),
    random: sec('random'),
    waiting: sec('waiting'),
  }
}

export function toPage(res) {
  const d = unwrap(res)
  const items = list(d)
  const pg = (res && (res.pagination || res.meta)) || (d && (d.pagination || d.meta)) || null
  let hasNext = items.length > 0
  if (pg) {
    const explicit = pick(pg, ['has_next', 'hasNext', 'has_next_page', 'hasNextPage', 'next'])
    const cur = num(pick(pg, ['page', 'current_page', 'currentPage']))
    const total = num(pick(pg, ['total_pages', 'totalPages', 'last_page', 'lastPage']))
    if (explicit !== undefined) hasNext = !!explicit
    else if (cur !== undefined && total !== undefined) hasNext = cur < total
  }
  return { items, hasNext }
}

export function pageMeta(res) {
  const d = unwrap(res)
  const pg = (res && (res.pagination || res.meta)) || (d && (d.pagination || d.meta)) || null
  if (!pg) return {}
  const explicit = pick(pg, ['has_next', 'hasNext', 'has_next_page', 'hasNextPage', 'next'])
  const cur = num(pick(pg, ['page', 'current_page', 'currentPage']))
  const total = num(pick(pg, ['total_pages', 'totalPages', 'last_page', 'lastPage']))
  let hasNext
  if (explicit !== undefined) hasNext = !!explicit
  else if (cur !== undefined && total !== undefined) hasNext = cur < total
  return { hasNext, totalPages: total }
}

export function toAnimeDetail(res) {
  const d = unwrap(res) || {}
  const o = (d.anime && typeof d.anime === 'object' && d.anime) || (d.detail && typeof d.detail === 'object' && d.detail) || d
  return toAnime(o)
}

export function toEpisodes(res, offset = 0) {
  const arr = listFrom(unwrap(res))
  const eps = arr.map((o, i) => {
    let n = pick(o, ['number', 'episode', 'episode_number', 'eps', 'ep', 'no'])
    const title = pick(o, ['title', 'name'])
    if (n === undefined && typeof title === 'string') {
      const m = title.match(/\b(?:episode|eps?)\.?\s*(\d+(?:\.\d+)?)/i)
      if (m) n = m[1]
    }
    return {
      id: pick(o, ['id', 'episode_id', 'episodeId']),
      number: n !== undefined ? n : offset + i + 1,
      _auto: n === undefined,
      _pos: offset + i,
      title,
      thumbnail: asUrl(pick(o, ['thumbnail', 'thumb', 'image', 'poster'])),
      views: pick(o, ['views', 'view', 'view_count', 'viewCount', 'total_views']),
      date: pick(o, ['created_at', 'createdAt', 'date', 'aired', 'aired_at', 'release_date', 'released_at', 'published_at', 'updated_at', 'upload_date', 'time']),
    }
  }).filter((e) => e.id !== undefined && e.id !== null)
  eps.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
  return eps
}

const SKIP = new Set(['subtitle', 'subtitles', 'caption', 'captions', 'tracks', 'thumbnail', 'thumb', 'poster', 'image', 'cover'])
const URL_KEYS = ['url', 'src', 'file', 'link', 'stream', 'stream_url', 'streamUrl', 'hls', 'm3u8', 'mp4', 'embed']
const Q_KEYS = ['quality', 'label', 'resolution', 'res', 'name', 'size']

export function toStream(res) {
  const out = []
  const push = (u, q) => {
    if (typeof u === 'string' && /^https?:\/\//i.test(u)) out.push({ url: u, quality: q ? String(q) : 'Auto' })
  }
  const walk = (v, q) => {
    if (!v) return
    if (typeof v === 'string') return push(v, q)
    if (Array.isArray(v)) return v.forEach((x) => walk(x, q))
    if (typeof v !== 'object') return
    const u = pick(v, URL_KEYS)
    const ql = pick(v, Q_KEYS)
    if (typeof u === 'string') return push(u, ql !== undefined ? ql : q)
    for (const [k, val] of Object.entries(v)) {
      if (SKIP.has(k)) continue
      if (val && typeof val === 'object') walk(val, /^\d{3,4}p?$/.test(k) ? k : q)
      else if (typeof val === 'string' && /^\d{3,4}p?$/.test(k)) push(val, k)
    }
  }
  walk(unwrap(res))
  const seen = new Set()
  const uniq = out.filter((s) => (seen.has(s.url) ? false : seen.add(s.url)))
  const qn = (s) => parseInt(String(s.quality).replace(/\D/g, ''), 10) || 0
  uniq.sort((a, b) => qn(b) - qn(a))
  return uniq
}

export function toSchedule(res) {
  return list(unwrap(res))
    .map((a) => ({ ...a }))
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
}

export function toGenreList(res) {
  const arr = listFrom(unwrap(res))
  return arr
    .map((g) => {
      if (typeof g === 'string') return { id: g, name: g }
      const name = pick(g, ['name', 'title', 'label'])
      return { id: pick(g, ['id', 'slug', 'value']) ?? name, name }
    })
    .filter((g) => g.name)
}
