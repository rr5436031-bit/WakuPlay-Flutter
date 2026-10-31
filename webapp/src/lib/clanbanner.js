import { BORDER_URL_RE, MAX_URL } from './borderUrl'
import { fxLow } from './perf'

export const MAX_BANNER_SIDE = 2000
export const safeBanner = (u) => (typeof u === 'string' && u.length <= MAX_URL && BORDER_URL_RE.test(u) ? u : null)
export const bannerToShow = (u) => (fxLow() ? null : safeBanner(u))
export function checkBannerUrl(v) {
  const s = (v || '').trim()
  if (!s) return 'Link .gif wajib diisi'
  if (s.length > MAX_URL) return `Link maksimal ${MAX_URL} karakter`
  if (!/^https:\/\//i.test(s)) return 'Link harus diawali https://'
  if (!BORDER_URL_RE.test(s)) return 'Link harus https://domain/.../nama.gif (tanpa IP, port, atau user:pass@)'
  return ''
}
