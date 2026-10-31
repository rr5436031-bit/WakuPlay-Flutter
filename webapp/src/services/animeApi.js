import { supabase } from '../lib/supabase'
import { idbGet, idbSet, idbKeys } from '../lib/store'
import { prefetchDeep } from '../lib/img'
import { extraOf, mergeExtra, extraStream, isExtraId, newEpsLatest, newEpsCached } from './extraEpisodes'
import { isCustomId, customGet, customLatest, customCached, customSearch } from './customAnime'
import { stampEpisodes } from '../lib/neweps'
import { pageMeta, toHome, toPage, toAnimeDetail, toEpisodes, toStream, toSchedule, toGenreList } from './normalize'

export class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind }
}

const cache = new Map()

const PERSIST = /^\/(homepage|genres|schedule|anime\/[^/?]+(\/episodes(\?.*)?)?$)/
const WARM = /^\/(homepage|genres|schedule|anime\/[^/?]+$)/
const disk = new Map()

export async function warmCache() {
  try {
    const keys = (await idbKeys('api')).filter((k) => WARM.test(k))
    await Promise.all(keys.map(async (k) => { const v = await idbGet('api', k); if (v && v.data) disk.set(k, v) }))
  } catch { }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function once(path) {
  if (!supabase) throw new ApiError('network', 'Supabase belum dikonfigurasi')
  let res
  try { res = await supabase.functions.invoke('anime-api', { body: { path } }) }
  catch (e) { throw new ApiError('network', e?.message || 'network') }
  const { data, error } = res
  if (error) {
    const st = error.context && error.context.status
    if (st === 404) throw new ApiError('notfound', '404')
    if (error.name === 'FunctionsFetchError') throw new ApiError('network', error.message || 'network')
    throw new ApiError('server', String(st || error.message || 'server'))
  }
  if (typeof data === 'string') { try { return JSON.parse(data) } catch { throw new ApiError('server', 'JSON tidak valid') } }
  return data
}

async function request(path, { ttl = 0, signal, retries = 2, diskTtl = 0 } = {}) {
  const hit = cache.get(path)
  if (ttl && hit && Date.now() - hit.t < ttl) return hit.p
  if (diskTtl) { const d = disk.get(path); if (d && d.data && Date.now() - d.t < diskTtl) return d.data }
  const p = (async () => {
    let last
    for (let i = 0; i <= retries; i++) {
      try {
        const data = await once(path)
        if (PERSIST.test(path)) { const entry = { t: Date.now(), data }; disk.set(path, entry); idbSet('api', path, entry) }
        return data
      } catch (e) {
        if (e?.name === 'AbortError' || e?.kind === 'notfound') throw e
        last = e
        if (i < retries) await wait(600 * (i + 1))
      }
    }
    const old = PERSIST.test(path) ? (disk.get(path) || (await idbGet('api', path))) : null
    if (old && old.data) { if (ttl) cache.set(path, { t: Date.now() - ttl + 60000, p }); return old.data }
    throw last
  })()
  if (ttl) {
    cache.set(path, { t: Date.now(), p })
    p.catch(() => cache.delete(path))
  }
  return p
}

const MIN = 60 * 1000
const SESSION = 24 * 60 * MIN
export const resetApiSession = () => { cache.clear() }
const qs = (o) => {
  const parts = []
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`) })
  return parts.length ? '?' + parts.join('&') : ''
}

const norm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const STOP = new Set(['wa', 'ga', 'no', 'ni', 'wo', 'to', 'de', 'ha', 'the', 'of', 'a', 'in', 'on'])
const PARAMS = ['q', 'keyword', 'query', 'search']

const rawSearch = (param, text, extra, signal) =>
  request('/search' + qs({ [param]: text, ...extra }), { ttl: 2 * MIN, signal, retries: 1 }).then(toPage)

function rankByQuery(items, q) {
  const toks = norm(q).split(' ').filter(Boolean)
  const key = toks.filter((t) => !STOP.has(t))
  const need = key.length ? key : toks
  const scored = items.map((a) => {
    const t = norm(a.title)
    const hit = need.filter((w) => t.includes(w)).length
    return { a, hit, full: t.includes(norm(q)) ? 1 : 0 }
  })
  return scored.filter((x) => x.hit > 0).sort((x, y) => y.full - x.full || y.hit - x.hit).map((x) => x.a)
}

async function smartSearch({ q, page = 1, genre_in }, signal) {
  const text = String(q || '').trim().replace(/\s+/g, ' ')
  const extra = { page: page > 1 ? page : undefined, genre_in }
  if (!text) return request('/search' + qs({ page: extra.page, genre_in }), { ttl: 2 * MIN, signal }).then(toPage)

  let firstErr
  for (const param of PARAMS) {
    try {
      const r = await rawSearch(param, text, extra, signal)
      if (r.items.length) return r
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      if (param === 'q') firstErr = e
      if (e?.kind === 'network') throw e
    }
  }
  if (page > 1) return { items: [], hasNext: false }

  const words = norm(text).split(' ').filter(Boolean)
  const tries = []
  const add = (t) => { if (t && !tries.includes(t) && t !== norm(text)) tries.push(t) }
  if (words.length > 1) {
    add(words.slice(0, -1).join(' '))
    add(words.slice(0, 2).join(' '))
    add(words.filter((w) => !STOP.has(w)).sort((a, b) => b.length - a.length)[0])
    add(words[0])
  } else if (words[0] && words[0].length > 4) {
    add(words[0].slice(0, -1))
    add(words[0].slice(0, 4))
  }
  const seen = new Map()
  for (const t of tries.slice(0, 4)) {
    try {
      const r = await rawSearch('q', t, { genre_in }, signal)
      r.items.forEach((a) => { if (!seen.has(String(a.id))) seen.set(String(a.id), a) })
      const ranked = rankByQuery([...seen.values()], text)
      if (ranked.length >= 1) return { items: ranked, hasNext: false }
    } catch (e) { if (e?.name === 'AbortError') throw e }
  }
  if (firstErr && !seen.size) throw firstErr
  return { items: rankByQuery([...seen.values()], text), hasNext: false }
}

async function allEpisodes(id, signal, onPartial) {
  const base = `/anime/${encodeURIComponent(id)}/episodes`
  const seen = new Map()
  let pageSize = 0
  let newestFirst = false
  const merge = (res, page) => {
    let added = 0
    for (const e of toEpisodes(res, (page - 1) * pageSize)) { const k = String(e.id); if (!seen.has(k)) { seen.set(k, e); added++ } }
    return added
  }
  const snapshot = () => {
    const list = [...seen.values()]
    const top = list.reduce((m, e) => Math.max(m, e._pos), 0)
    list.forEach((e) => { if (e._auto) e.number = newestFirst ? top + 1 - e._pos : e._pos + 1 })
    return list.sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
  }
  const fetchPage = (p) => request(`${base}?page=${p}`, { ttl: 5 * MIN, signal, retries: 1 })
    .catch((e) => { if (e?.name === 'AbortError') throw e; return null })

  const first = await request(base, { ttl: 5 * MIN, signal })
  const firstList = toEpisodes(first)
  pageSize = firstList.length
  const byPos = [...firstList].sort((a, b) => a._pos - b._pos)
  const d1 = Date.parse(byPos[0]?.date), d2 = Date.parse(byPos[byPos.length - 1]?.date)
  newestFirst = Number.isFinite(d1) && Number.isFinite(d2) && d1 > d2
  merge(first, 1)
  if (onPartial) onPartial(snapshot())
  const meta = pageMeta(first)

  if (meta.totalPages > 1) {
    const pages = Array.from({ length: Math.min(meta.totalPages, 200) - 1 }, (_, i) => i + 2)
    const failed = []
    for (let i = 0; i < pages.length; i += 5) {
      const batch = pages.slice(i, i + 5)
      const rs = await Promise.all(batch.map(fetchPage))
      rs.forEach((r, j) => { if (r) merge(r, batch[j]); else failed.push(batch[j]) })
      if (onPartial) onPartial(snapshot())
    }
    for (let t = 0; t < 3 && failed.length; t++) {
      await wait(900 * (t + 1))
      const again = failed.splice(0)
      for (const p of again) { const r = await fetchPage(p); if (r) merge(r, p); else failed.push(p) }
      if (onPartial) onPartial(snapshot())
    }
  } else if (meta.hasNext !== false && pageSize > 0) {
    for (let p = 2; p <= 200; p++) {
      let r = await fetchPage(p)
      if (!r) { await wait(800); r = await fetchPage(p) }
      if (!r || merge(r, p) === 0) break
      if (onPartial) onPartial(snapshot())
      if (pageMeta(r).hasNext === false) break
    }
  }
  return snapshot()
}

const withNew = (h, fe, cu) => {
  const add = [...(fe || []), ...(cu || [])].sort((a, b) => (b.t || 0) - (a.t || 0))
  if (!add.length) return h
  const seen = new Set(), front = []
  for (const a of add) { const k = String(a.id); if (!seen.has(k)) { seen.add(k); front.push(a) } }
  return { ...h, fresh: [...front, ...(h.fresh || []).filter((a) => !seen.has(String(a.id)))] }
}

export const api = {
  home: (signal) => request('/homepage', { ttl: 3 * MIN, signal }).then(toHome)
    .then((h) => { stampEpisodes(Object.values(h)); return h })
    .then(async (h) => { const [cu, fe] = await Promise.all([customLatest(12), newEpsLatest(20)]); return withNew(h, fe, cu) })
    .then(prefetchDeep),
  search: async (params, signal) => {
    const q = String(params?.q || '').trim()
    const wantCustom = q.length >= 2 && !(params?.page > 1) && !params?.genre_in
    const [r, cu] = await Promise.all([smartSearch(params, signal).catch((e) => e), wantCustom ? customSearch(q) : []])
    if (r instanceof Error) {
      if (cu.length && r?.name !== 'AbortError') return prefetchDeep({ items: cu, hasNext: false })
      throw r
    }
    if (cu.length) { const ids = new Set(cu.map((a) => String(a.id))); return prefetchDeep({ ...r, items: [...cu, ...r.items.filter((a) => !ids.has(String(a.id)))] }) }
    return prefetchDeep(r)
  },
  anime: (id, signal) => (isCustomId(id) ? customGet(id).then(prefetchDeep) : request(`/anime/${encodeURIComponent(id)}`, { ttl: SESSION, signal }).then(toAnimeDetail).then(prefetchDeep)),
  episodes: async (id, signal, onPartial) => {
    const extras = await extraOf(id)
    if (isCustomId(id)) return mergeExtra([], extras)
    let list
    try { list = await allEpisodes(id, signal, onPartial && extras.length ? (p) => onPartial(mergeExtra(p, extras)) : onPartial) } catch (e) {
      if (extras.length && e?.name !== 'AbortError') return mergeExtra([], extras)
      throw e
    }
    return mergeExtra(list, extras)
  },
  stream: (episodeId, signal) => isExtraId(episodeId) ? extraStream(episodeId) : request(`/episode/${encodeURIComponent(episodeId)}/stream`, { ttl: 2 * MIN, signal }).then(toStream),
  weekSchedule: (signal) => Promise.all(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((d) =>
    request('/schedule' + qs({ day: d }), { ttl: 5 * MIN, diskTtl: 10 * MIN, signal, retries: 1 }).then(toSchedule).then((l) => { stampEpisodes([l]); return l }).catch((e) => { if (e?.name === 'AbortError') throw e; return [] }))),
  schedule: (day, signal) => request('/schedule' + qs({ day }), { ttl: SESSION, diskTtl: 3 * 60 * MIN, signal }).then(toSchedule).then(prefetchDeep),
  genres: (signal) => request('/genres', { ttl: SESSION, diskTtl: 6 * 60 * MIN, signal }).then(toGenreList),
}

export function errorMessage(e) {
  if (e?.kind === 'network') return 'Tidak ada koneksi internet. Periksa jaringanmu lalu coba lagi.'
  if (e?.kind === 'notfound') return 'Data tidak ditemukan.'
  if (e?.kind === 'server') return 'Server sedang bermasalah. Coba lagi beberapa saat.'
  const m = String(e?.message || '')
  const code = String(e?.code || '')
  if (code === 'PGRST205' || code === '42P01' || /relation .* does not exist|Could not find the table/i.test(m))
    return 'Tabel database belum dibuat. Jalankan supabase/schema.sql di Supabase (SQL Editor).'
  if (code === '42501' || /row-level security|permission denied/i.test(m))
    return 'Akses database ditolak (RLS). Jalankan ulang supabase/schema.sql.'
  if (/JWT|invalid api key|apikey/i.test(m))
    return 'Kunci Supabase tidak valid. Cek VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di .env.'
  if (/Supabase belum dikonfigurasi/i.test(m)) return m
  if (/Failed to fetch|NetworkError|Load failed/i.test(m))
    return 'Tidak bisa terhubung ke Supabase. Periksa internet atau VITE_SUPABASE_URL.'
  if (m && (code || e?.details !== undefined || e?.hint !== undefined)) return 'Database: ' + m
  return 'Terjadi kesalahan. Coba lagi.'
}

const peek = (path, map) => () => {
  const e = disk.get(path)
  if (!e) return null
  try { return map(e.data) } catch { return null }
}
export const peekApi = {
  home: peek('/homepage', (d) => withNew(toHome(d), newEpsCached(), customCached())),
  genres: peek('/genres', toGenreList),
  schedule: (day) => peek('/schedule' + qs({ day }), toSchedule),
  anime: (id) => peek(`/anime/${encodeURIComponent(id)}`, toAnimeDetail),
}
