// Pembersihan nama file aset. HARUS sama dengan cleanStem / cleanFileName di supabase/functions/border-gif/index.ts
// (salinan; kalau salah satu diubah, ubah keduanya). Hanya mengubah NAMA, tidak pernah isi gambar.
const EXT_RE = /\.(gif|png|jpe?g|webp)$/i
const JUNK = [
  // keterangan dalam kurung yang berisi teks sumber / promosi
  /[\[(（【][^\])）】]*(discord|avatar\s*decoration|download|free\s|source|credit|www\.|\.com|\.net|\.gg|nitro|watermark)[^\])）】]*[\])）】]/gi,
  /\b(discord\s+)?avatar\s*decorations?\b/gi,
  /\bdiscord\s+(profile\s+)?(effects?|decorations?|nameplates?|borders?|avatars?)\b/gi,
  /\b(free\s+download|download\s+free|download\s+now|get\s+it\s+on)\b/gi,
  /\b[a-z0-9-]+\.(com|net|org|io|gg|app|co|me|xyz|id)\b/gi,
  /\b(source|credits?|credit\s+to|courtesy\s+of)\b.*$/gi,
  /\b(made|created|uploaded|ripped|edited|posted)\s+by\b.*$/gi,
  /\b(subscribe|follow\s+(me|us)|join\s+(our|my)|link\s+in\s+bio|sponsored|watermark(ed)?)\b.*$/gi,
  /@[A-Za-z0-9_.]+/g,
  /^\s*copy\s+of\s+/gi,
  /\s*[-–—]\s*copy(\s*\(?\d+\)?)?\s*$/gi,
  /\s*\(\d{1,3}\)\s*$/g,
  /(^|[\s\-–—|_])discord\s*$/gi,
  /^\s*discord[\s\-–—|_]+/gi,
]
export const splitExt = (name) => { const m = EXT_RE.exec(name || ''); return m ? [name.slice(0, m.index), m[1].toLowerCase()] : [name || '', ''] }
export function cleanStem(raw) {
  let s = String(raw || '')
  try { s = decodeURIComponent(s) } catch { /* biarkan */ }
  const orig = s
  for (const re of JUNK) s = s.replace(re, ' ')
  const slug = (t) => t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return slug(s) || slug(orig) || 'file'
}
export function cleanFileName(name) {
  const [stem, ext] = splitExt(name)
  return cleanStem(stem) + (ext ? '.' + ext : '')
}
// "demon-horns" -> "Demon Horns" (untuk isian nama border otomatis)
export const nameFromFile = (fileName) => cleanStem(splitExt(fileName)[0]).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 40).trim()
