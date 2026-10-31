import { supabase } from '../lib/supabase'

export const isCustomId = (id) => typeof id === 'string' && /^c_[a-f0-9]{12}$/.test(id)

const toApp = (r) => ({
  id: r.id, title: r.title, poster: r.poster, cover: r.poster, synopsis: r.synopsis,
  genres: Array.isArray(r.genres) ? r.genres : [], status: r.status, type: r.type, isNew: r.status !== 'Completed',
  t: Date.parse(r.created_at) || 0,
})

const notFound = () => Object.assign(new Error('404'), { kind: 'notfound' })

export async function customGet(id) {
  if (!supabase || !isCustomId(id)) throw notFound()
  const { data, error } = await supabase.rpc('custom_anime_get', { p_id: id })
  if (error) throw Object.assign(new Error(error.message), { kind: 'server' })
  const r = Array.isArray(data) ? data[0] : data
  if (!r) throw notFound()
  return toApp(r)
}

const cache = { t: 0, rows: [] }
export async function customLatest(n = 12) {
  if (!supabase) return []
  if (Date.now() - cache.t < 20000) return cache.rows
  try {
    const { data, error } = await supabase.rpc('custom_anime_latest', { p_limit: n })
    if (error) throw error
    cache.rows = (Array.isArray(data) ? data : []).map(toApp); cache.t = Date.now()
    return cache.rows
  } catch { return cache.rows }
}
export const customCached = () => cache.rows
export const clearCustomCache = () => { cache.t = 0 }

export async function customSearch(q) {
  if (!supabase || String(q || '').trim().length < 2) return []
  try {
    const { data, error } = await supabase.rpc('custom_anime_search', { p_q: String(q).trim() })
    if (error) throw error
    return (Array.isArray(data) ? data : []).map(toApp)
  } catch { return [] }
}

const rpc = async (fn, args) => { const { data, error } = await supabase.rpc(fn, args); if (error) throw new Error(error.message); return data }
export const devAnimeList = () => rpc('dev_anime_list', {})
export const devAnimeSave = async (a) => {
  const id = await rpc('dev_anime_save', {
    p_title: a.title, p_poster: a.poster, p_synopsis: a.synopsis, p_genres: a.genres,
    p_status: a.status, p_type: a.type, p_id: a.id || null,
  })
  clearCustomCache()
  return id
}
export const devAnimeDelete = async (id) => { await rpc('dev_anime_delete', { p_id: id }); clearCustomCache() }
