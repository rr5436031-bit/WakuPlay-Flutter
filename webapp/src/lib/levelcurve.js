export const XP_PER_MIN = 250   // tampilan saja: 500 XP per 2 menit. Angka asli ada di server (xp-nonton-2menit.sql)
export const MAX_LEVEL = 999999

const KEY = 'wp_lvcfg'
const subs = new Set()
let cfg = null

const valid = (c) => !!c && Number.isFinite(c.base_cost) && c.base_cost > 0 && Number.isFinite(c.growth) && c.growth >= 0
  && Array.isArray(c.tiers) && c.tiers.length === 10 && c.tiers.every((x, i) => Number.isFinite(x) && (i === 0 ? x === 1 : x > c.tiers[i - 1]))
const clean = (c) => ({ base_cost: Number(c.base_cost), growth: Number(c.growth), tiers: (c.tiers || []).map(Number) })

try { const c = clean(JSON.parse(localStorage.getItem(KEY) || 'null') || {}); if (valid(c)) cfg = c } catch { }

export const getLevelCfg = () => cfg
export const onLevelCfg = (f) => { subs.add(f); return () => subs.delete(f) }
export function setLevelCfg(raw) {
  const c = clean(raw || {})
  if (!valid(c)) return false
  const same = JSON.stringify(c) === JSON.stringify(cfg)
  cfg = c
  try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { }
  if (!same) subs.forEach((f) => f(cfg))
  return !same
}

const total = (L) => {
  if (!cfg) return 0
  const n = Math.max(0, L - 1)
  return cfg.base_cost * n + cfg.growth * n * n
}

export const xpForLevel = (L) => total(Math.min(MAX_LEVEL + 1, Math.max(1, Math.floor(L))))

export function levelInfo(xp = 0) {
  const x = Math.max(0, Number(xp) || 0)
  if (!cfg) return { level: 1, xp: x, into: 0, need: 1, pct: 0 }
  const { base_cost: b, growth: g } = cfg
  const n = g > 0 ? Math.floor((-b + Math.sqrt(b * b + 4 * g * x)) / (2 * g) + 1e-9) : Math.floor(x / b + 1e-9)
  const level = Math.min(MAX_LEVEL, Math.max(1, n + 1))
  const start = total(level), next = total(level + 1)
  return { level, xp: x, into: Math.max(0, x - start), need: next - start, pct: Math.min(1, Math.max(0, (x - start) / (next - start))) }
}
