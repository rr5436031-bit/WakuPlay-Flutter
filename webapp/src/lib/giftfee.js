export function giftFeeHours(totalDays, tiers) {
  const t = (tiers || []).map((x) => ({ from: Number(x.from), rate: Number(x.rate) })).sort((a, b) => a.from - b.from)
  let sum = 0
  for (let i = 0; i < t.length; i++) {
    const hi = i + 1 < t.length ? t[i + 1].from : Infinity
    sum += Math.max(Math.min(totalDays, hi) - t[i].from, 0) * t[i].rate
  }
  return Math.max(Math.ceil(sum * 24 - 1e-9), 0)
}
export const giftCostDays = (totalDays, feeHours) => totalDays + feeHours / 24
export function fmtHours(h) {
  const n = Math.max(Math.round(h), 0), d = Math.floor(n / 24), j = n % 24
  if (!d) return `${j} jam`
  return j ? `${d} hari ${j} jam` : `${d} hari`
}
export const fmtDaysHours = (days) => fmtHours(days * 24)
// Pratinjau XP (server tetap penentu). Giveaway: info.tiers = bertingkat per bagian hari. Gift: tanpa tiers = linear.
export function giftXpPreview(days, info) {
  const per = Number(info?.xp_per_day), left = Number(info?.left_today), d = Math.floor(Number(days))
  if (!Number.isFinite(per) || !Number.isFinite(left) || !Number.isFinite(d) || per <= 0 || d < 1) return 0
  const cap = Number(info?.per_giveaway_cap) > 0 ? Number(info.per_giveaway_cap) : 60000
  const t = (Array.isArray(info?.tiers) ? info.tiers : []).map((x) => ({ from: Number(x.from), pct: Number(x.pct) }))
    .filter((x) => Number.isFinite(x.from) && Number.isFinite(x.pct)).sort((a, b) => a.from - b.from)
  let want = d * per
  if (t.length) {
    want = 0
    for (let i = 0; i < t.length; i++) {
      const hi = i + 1 < t.length ? t[i + 1].from : Infinity
      want += Math.floor(Math.max(Math.min(d, hi) - t[i].from, 0) * per * t[i].pct / 100)   // dibulatkan per bagian, sama dengan server
    }
  }
  return Math.max(Math.min(want, left, cap), 0)
}
