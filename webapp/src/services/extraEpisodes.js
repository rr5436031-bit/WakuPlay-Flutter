import { supabase } from '../lib/supabase'

const cache = new Map()
export const clearExtraCache = (animeId) => { if (animeId == null) cache.clear(); else cache.delete(String(animeId)) }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function extraOf(animeId) {
  if (!supabase || animeId == null) return []
  const k = String(animeId)
  const hit = cache.get(k)
  if (hit && Date.now() - hit.t < 60000) return hit.rows
  try {
    const { data, error } = await supabase.rpc('extra_episodes_of', { p_anime: k })
    if (error) throw error
    const rows = Array.isArray(data) ? data : []
    cache.set(k, { t: Date.now(), rows })
    return rows
  } catch { return hit ? hit.rows : [] }
}

const feed = { t: 0, rows: [] }
export const newEpsCached = () => feed.rows
export const clearNewEpsCache = () => { feed.t = 0 }
export async function newEpsLatest(n = 20) {
  if (!supabase) return []
  if (Date.now() - feed.t < 20000) return feed.rows
  try {
    const { data, error } = await supabase.rpc('new_eps_latest', { p_limit: n })
    if (error) throw error
    feed.rows = (Array.isArray(data) ? data : []).filter((r) => r && r.id && r.title).map((r) => ({
      id: String(r.id), title: r.title, poster: r.poster || null, cover: r.poster || null,
      episode: r.number != null ? Number(r.number) : undefined, isNew: true, t: Date.parse(r.updated_at) || 0,
    }))
    feed.t = Date.now()
    return feed.rows
  } catch { return feed.rows }
}

export const isExtraId = (id) => typeof id === 'string' && id.startsWith('x_')

export function mergeExtra(list, rows) {
  if (!rows || !rows.length) return list
  const byNum = new Map(list.map((e) => [Number(e.number), e]))
  for (const r of rows) {
    const n = Number(r.number)
    if (!Number.isFinite(n)) continue
    const id = r.kind === 'api' ? r.ref : 'x_' + r.id
    if (id == null || id === '') continue
    const old = byNum.get(n)
    byNum.set(n, { ...(old || {}), id, number: n, title: r.title || old?.title || `Episode ${n}`, _extra: true, _auto: false })
  }
  return [...byNum.values()].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
}

export async function extraStream(epId) {
  const id = String(epId).slice(2)
  if (!supabase || !UUID.test(id)) throw Object.assign(new Error('404'), { kind: 'notfound' })
  const { data, error } = await supabase.rpc('extra_episode_stream', { p_id: id })
  if (error) throw Object.assign(new Error(error.message), { kind: 'server' })
  if (!data) throw Object.assign(new Error('404'), { kind: 'notfound' })
  return [{ url: String(data), quality: 'Auto' }]
}

const rpc = async (fn, args) => { const { data, error } = await supabase.rpc(fn, args); if (error) throw new Error(error.message); return data }
export const devExtraList = (animeId) => rpc('dev_extra_list', { p_anime: String(animeId) })
let lastSave = { notified: null, isNew: null, newest: null }
export const lastExtraSave = () => lastSave
export const devExtraSave = async (animeId, rows, meta = {}) => {
  let r
  try {
    r = await rpc('dev_extra_save', { p_anime: String(animeId), p_rows: rows, p_title: meta.title || null, p_poster: meta.poster || null, p_notify: meta.notify !== false, p_all: meta.all === true })
  } catch (e) {
    if (/could not find the function|schema cache/i.test(e.message || '')) throw new Error('Fungsi database belum diperbarui. Jalankan supabase/episode-notif-fix.sql di SQL Editor Supabase, lalu coba lagi.')
    throw e
  }
  const saved = typeof r === 'number' ? r : Number(r?.saved || 0)
  lastSave = typeof r === 'number' ? { notified: null, isNew: null, newest: null }
    : { notified: (lastSave.notified || 0) * (meta.batch ? 1 : 0) + Number(r?.notified || 0), isNew: !!(r?.is_new || (meta.batch && lastSave.isNew)), newest: r?.newest ?? lastSave.newest }
  clearExtraCache(animeId); clearNewEpsCache(); return saved
}
export const devExtraDelete = async (id, animeId) => { await rpc('dev_extra_delete', { p_id: id }); clearExtraCache(animeId) }
export const devExtraClear = async (animeId) => { const n = await rpc('dev_extra_clear', { p_anime: String(animeId) }); clearExtraCache(animeId); return n }
