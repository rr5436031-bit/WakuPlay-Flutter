export function fmtViews(v) {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v === 'string' && /[KMkm]/.test(v)) return v
  const n = Number(String(v).replace(/[^\d.]/g, ''))
  if (!isFinite(n)) return String(v)
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}
export function fmtDur(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export function fmtDateId(iso) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`
}
export function fmtClock(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function fmtTimeField(t) {
  if (!t) return ''
  const s = String(t)
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5)
  const d = new Date(s)
  return isNaN(d) ? '' : fmtClock(d)
}
export function fmtAgo(v) {
  if (v === undefined || v === null || v === '') return ''
  let d = typeof v === 'number' || /^\d{9,13}$/.test(String(v)) ? new Date(Number(v) < 1e12 ? Number(v) * 1000 : Number(v)) : new Date(String(v).replace(' ', 'T'))
  if (isNaN(d)) return ''
  const diff = Date.now() - d.getTime()
  if (diff < 0) return fmtDateId(d)
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), day = Math.floor(h / 24)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  if (h < 24) return `${h} jam lalu`
  if (day < 30) return `${day} hari lalu`
  return fmtDateId(d)
}

export function userName(user, fallback = '') {
  const m = user?.user_metadata || {}
  return m.display_name || m.full_name || m.name || (user?.email || '').split('@')[0] || fallback
}
export function validName(raw) {
  const v = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!v) return { ok: false, msg: 'Nama tidak boleh kosong' }
  if (v.length > 20) return { ok: false, msg: 'Maksimal 20 karakter' }
  if (!/^[A-Za-z0-9 ]+$/.test(v)) return { ok: false, msg: 'Hanya huruf dan angka' }
  return { ok: true, value: v }
}

export function nameColor(key) {
  let h = 0
  for (const c of String(key || '')) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 72% 74%)`
}
