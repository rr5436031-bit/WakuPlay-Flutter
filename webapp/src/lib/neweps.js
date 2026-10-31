const KEY = 'wp_eps_seen'
const KEEP_MS = 7 * 24 * 3600 * 1000
const MAX = 800

const num = (v) => {
  const m = String(v ?? '').match(/\d+(\.\d+)?/g)
  return m ? parseFloat(m[m.length - 1]) : NaN
}

function load() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {} } catch { return {} }
}

export function stampEpisodes(lists) {
  const seen = load()
  const now = Date.now()
  let dirty = false
  for (const list of lists) {
    for (const a of list || []) {
      if (!a || a.id == null || a.episode == null || a.episode === '') continue
      const id = String(a.id), ep = String(a.episode), old = seen[id]
      if (!old) { seen[id] = [ep, 0]; dirty = true; continue }
      if (old[0] !== ep) {
        const up = Number.isFinite(num(ep)) && Number.isFinite(num(old[0])) ? num(ep) > num(old[0]) : true
        seen[id] = [ep, up ? now : old[1]]
        dirty = true
      }
    }
  }
  if (!dirty) return
  const keys = Object.keys(seen)
  if (keys.length > MAX) keys.slice(0, keys.length - MAX).forEach((k) => { delete seen[k] })
  try { localStorage.setItem(KEY, JSON.stringify(seen)) } catch { }
}

export function bumpReader() {
  const seen = load(), now = Date.now()
  return (id) => { const e = seen[String(id)]; return e && e[1] && now - e[1] < KEEP_MS ? e[1] : 0 }
}
