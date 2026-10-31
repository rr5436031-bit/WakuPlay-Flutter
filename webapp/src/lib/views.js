import { useEffect, useState } from 'react'
import { getAnimeViews, getEpisodeViews } from '../services/db'

const KEY = 'wp_views_v1'
const store = (() => { try { const j = JSON.parse(localStorage.getItem(KEY)); return { a: j?.a || {}, e: j?.e || {} } } catch { return { a: {}, e: {} } } })()
const subs = new Set()
const pending = { a: new Set(), e: new Set() }
const fresh = new Map()
let timer = null
let saveT = null
let notifyT = null

const notify = () => { if (notifyT) return; notifyT = setTimeout(() => { notifyT = null; subs.forEach((f) => f()) }, 30) }
function persist() {
  clearTimeout(saveT)
  saveT = setTimeout(() => {
    try {
      const trim = (o) => { const k = Object.keys(o); return k.length > 1500 ? Object.fromEntries(k.slice(-1500).map((x) => [x, o[x]])) : o }
      localStorage.setItem(KEY, JSON.stringify({ a: trim(store.a), e: trim(store.e) }))
    } catch { }
  }, 600)
}

function queue(kind, id) {
  const k = kind + id
  if (fresh.has(k) && Date.now() - fresh.get(k) < 60000) return
  pending[kind].add(String(id))
  if (!timer) timer = setTimeout(flush, 120)
}

async function flush() {
  timer = null
  for (const kind of ['a', 'e']) {
    const ids = [...pending[kind]]
    pending[kind].clear()
    for (let i = 0; i < ids.length; i += 250) {
      const chunk = ids.slice(i, i + 250)
      try {
        const rows = await (kind === 'a' ? getAnimeViews(chunk) : getEpisodeViews(chunk))
        const got = {}
        rows.forEach((r) => { got[String(r.id)] = Number(r.views) || 0 })
        chunk.forEach((id) => { store[kind][id] = got[id] || 0; fresh.set(kind + id, Date.now()) })
        notify()
      } catch { }
    }
  }
  persist()
}

function useViews(kind, id) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (id === undefined || id === null || id === '') return
    queue(kind, id)
    const f = () => tick((n) => n + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [kind, id])
  return id === undefined || id === null ? 0 : store[kind][String(id)] || 0
}

export const useAnimeViews = (id) => useViews('a', id)
export const useEpisodeViews = (id) => useViews('e', id)

export function bumpView(animeId, episodeId) {
  const a = String(animeId), e = String(episodeId)
  store.a[a] = (store.a[a] || 0) + 1
  store.e[e] = (store.e[e] || 0) + 1
  fresh.delete('a' + a); fresh.delete('e' + e)
  notify(); persist()
}
