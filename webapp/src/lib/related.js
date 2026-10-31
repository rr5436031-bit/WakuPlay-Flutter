const STOP = new Set(['wa', 'ga', 'no', 'ni', 'wo', 'to', 'de', 'ha', 'the', 'of', 'a', 'in', 'on', 'and', 'na', 'o'])

const clean = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  .replace(/\b(\d+(st|nd|rd|th)|second|third|final|last)\s+season\b/g, ' ')
  .replace(/\b(season|part|cour|s)\s*\d+\b/g, ' ')
  .replace(/\b(season|part|cour|movie|ova|ona|special|sub|indo|dub)\b/g, ' ')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

export const words = (t) => clean(t).split(' ').filter((w) => w && !STOP.has(w) && !/^(\d+|i{1,3}|iv|v)$/.test(w))

export function relatedQueries(title) {
  const w = words(title)
  if (!w.length) return []
  const qs = [w.slice(0, 2).join(' ')]
  if (w[0].length >= 4 && qs[0] !== w[0]) qs.push(w[0])
  return qs
}

export function rankRelated(title, id, lists) {
  const w = words(title)
  if (!w.length) return []
  const base = w.join(' '), first = w[0]
  const seen = new Set([String(id)]), out = []
  for (const a of lists.flat()) {
    if (!a || a.id == null || seen.has(String(a.id)) || !a.title) continue
    const cw = words(a.title)
    if (!cw.includes(first)) continue
    seen.add(String(a.id))
    const cb = cw.join(' ')
    const common = cw.filter((x) => w.includes(x)).length
    const score = (cb.startsWith(base) || base.startsWith(cb) ? 100 : 0) + (cw[0] === first ? 20 : 0) + common
    out.push({ a, score })
  }
  return out.sort((x, y) => y.score - x.score || String(x.a.title).localeCompare(String(y.a.title))).slice(0, 14).map((x) => x.a)
}
