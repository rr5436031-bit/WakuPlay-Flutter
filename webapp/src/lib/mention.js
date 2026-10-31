export const MENTION_RE = /(^|[^A-Za-z0-9_@])@([1-9][0-9]{0,8})(?![A-Za-z0-9_])/g
export const MAX_TAGS = 5

export function mentionSeqs(text) {
  const out = []
  const re = new RegExp(MENTION_RE.source, 'g')
  let m
  while ((m = re.exec(String(text || '')))) { if (!out.includes(m[2])) out.push(m[2]) }
  return out
}

export function splitMentions(text, mentions) {
  const str = String(text || '')
  if (!Array.isArray(mentions) || !mentions.length || !str.includes('@')) return [{ t: str }]
  const map = new Map(mentions.map((x) => [String(x.seq), x]))
  const re = new RegExp(MENTION_RE.source, 'g')
  const parts = []
  let last = 0, m
  while ((m = re.exec(str))) {
    const hit = map.get(m[2])
    if (!hit) continue
    const start = m.index + m[1].length
    if (start > last) parts.push({ t: str.slice(last, start) })
    parts.push({ tag: hit, raw: '@' + m[2] })
    last = m.index + m[0].length
  }
  if (last < str.length) parts.push({ t: str.slice(last) })
  return parts
}
