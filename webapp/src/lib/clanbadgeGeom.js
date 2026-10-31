
export const MAX_TIER = 20
export const TIER_NAMES = ['Basic', 'Bronze', 'Silver', 'Gold', 'Royal', 'Emerald', 'Crystal', 'Phoenix', 'Dragon', 'Celestial', 'Nebula', 'Inferno', 'Titan', 'Eternal', 'Omega', 'Laurel', 'Aurora', 'Mecha', 'Thorn', 'Zenith']

export const clampTier = (t) => {
  const n = Math.trunc(Number(t))
  return Number.isFinite(n) ? Math.min(MAX_TIER, Math.max(1, n)) : 1
}

export const EX = { 6: 7, 7: 9, 8: 16, 9: 10, 10: 11, 11: 12, 12: 12, 13: 22, 14: 26, 15: 28, 16: 14, 17: 10, 18: 9, 19: 12, 20: 16 }
export const TOP = { 5: 8, 8: 9, 9: 9, 10: 11, 11: 12, 12: 16, 13: 14, 14: 16, 15: 18, 16: 7, 17: 8, 18: 5, 19: 7, 20: 12 }
export const BOT = { 10: 6, 11: 6, 12: 4, 13: 4, 14: 4, 15: 8, 17: 6, 18: 5, 19: 6, 20: 6 }

const ADV = {
  A: .79, B: .8, C: .77, D: .86, E: .7, F: .66, G: .86, H: .88, I: .37, J: .57, K: .8, L: .64, M: 1.06, N: .9, O: .9, P: .76, Q: .9, R: .8, S: .7, T: .69, U: .87, V: .79, W: 1.15, X: .8, Y: .77, Z: .73,
  0: .84, 1: .58, 2: .76, 3: .78, 4: .84, 5: .77, 6: .82, 7: .72, 8: .83, 9: .82,
}
export const fontFor = (n) => (n <= 4 ? { fs: 13, sp: 1.6 } : n === 5 ? { fs: 12, sp: 1.1 } : { fs: 11, sp: 0.7 })
export function textWidth(tag) {
  const s = String(tag ?? '').slice(0, 8)
  const { fs, sp } = fontFor(s.length)
  let w = 0
  for (const ch of s) w += (ADV[ch] ?? .85) * fs * 0.96 + sp
  return Math.max(0, w - sp)
}

const strokeOf = (t) => (t >= 20 ? 2.6 : t >= 13 ? 3 : t >= 4 ? 2.4 : 2)
const endOf = (t) => (t >= 7 ? (t === 7 ? 9 : t >= 16 ? [0, 7, 9, 5, 7, 7][t - 15] : 7) : t >= 3 ? 7 : 0)
const MIN_LEAD = { 7: 16, 16: 12, 18: 8, 19: 9 }
const EMB_H = { 17: 12, 20: 12 }

const ellipsePts = (cx, cy, rx, ry, n = 40) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] })

function scallop(base, h = 2, bump = 6.4, m = 6) {
  const out = []
  for (let i = 0; i < base.length; i++) {
    const [x0, y0] = base[i], [x1, y1] = base[(i + 1) % base.length]
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (len < 0.01) continue
    const dx = (x1 - x0) / len, dy = (y1 - y0) / len, nx = dy, ny = -dx
    const nb = Math.max(1, Math.round(len / bump))
    for (let k = 0; k < nb; k++) for (let j = 0; j < m; j++) {
      const s = j / m, d = (k + s) / nb * len, o = Math.sin(Math.PI * s) * h
      out.push([x0 + dx * d + nx * o, y0 + dy * d + ny * o])
    }
  }
  return out
}

export function bodyPoly(t, W) {
  switch (t) {
    case 1: case 2: return [[1, 3], [W - 1, 3], [W - 1, 25], [1, 25]]
    case 3: return [[7, 3], [W - 7, 3], [W - 1, 14], [W - 7, 25], [7, 25], [1, 14]]
    case 6: return [[8, 3], [W - 8, 3], [W - 1, 10], [W - 1, 18], [W - 8, 25], [8, 25], [1, 18], [1, 10]]
    case 7: return [[0, 14], [8, 3], [W - 8, 3], [W, 14], [W - 8, 25], [8, 25]]
    case 16: return [[1, 3], [W - 1, 3], [W - 8, 14], [W - 1, 25], [1, 25], [8, 14]]
    case 17: return ellipsePts(W / 2, 14, W / 2 - 1, 11)
    case 18: return [[4, 3], [W - 4, 3], [W - 1, 6], [W - 1, 22], [W - 4, 25], [4, 25], [1, 22], [1, 6]]
    case 19: return [[9, 3], [W - 1, 3], [W - 9, 25], [1, 25]]
    case 20: return scallop([[7, 5], [W - 7, 5], [W - 3, 9], [W - 3, 19], [W - 7, 23], [7, 23], [3, 19], [3, 9]])
    default: return [[6, 3], [W - 6, 3], [W - 1, 9], [W - 1, 19], [W - 6, 25], [6, 25], [1, 19], [1, 9]]
  }
}
export function innerPoly(t, W) {
  if (t === 3) return [[10, 7], [W - 10, 7], [W - 5, 14], [W - 10, 21], [10, 21], [5, 14]]
  if (t === 16) return [[5, 7], [W - 5, 7], [W - 11, 14], [W - 5, 21], [5, 21], [11, 14]]
  if (t === 17) return ellipsePts(W / 2, 14, W / 2 - 5.5, 6.4)
  if (t === 18) return [[7, 7], [W - 7, 7], [W - 4, 10], [W - 4, 18], [W - 7, 21], [7, 21], [4, 18], [4, 10]]
  if (t === 19) return null
  if (t === 20) return [[9, 7], [W - 9, 7], [W - 5, 10], [W - 5, 18], [W - 9, 21], [9, 21], [5, 18], [5, 10]]
  if (t >= 4 && t !== 7) return [[9, 6], [W - 9, 6], [W - 4, 11], [W - 4, 17], [W - 9, 22], [9, 22], [4, 17], [4, 11]]
  return null
}

export function inPoly(poly, x, y) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const segDist = (px, py, [x0, y0], [x1, y1]) => {
  const dx = x1 - x0, dy = y1 - y0, l = dx * dx + dy * dy
  const k = l ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l)) : 0
  return Math.hypot(px - (x0 + dx * k), py - (y0 + dy * k))
}
export function minEdgeDist(poly, x, y) {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, y, poly[i], poly[(i + 1) % poly.length]))
  return d
}
export function boxInside(poly, x, y, w, h, m) {
  const N = 6
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    if (i !== 0 && i !== N && j !== 0 && j !== N) continue
    const px = x + (w * i) / N, py = y + (h * j) / N
    if (!inPoly(poly, px, py) || minEdgeDist(poly, px, py) < m) return false
  }
  return true
}

const cache = new Map()
export function layoutBadge(tier, tag, ratio = 1, emb = false) {
  const t = clampTier(tier)
  const tg = String(tag ?? '').slice(0, 8)
  const n = tg.length
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1
  const key = `${t}|${tg}|${emb ? Math.round(r * 100) : 0}`
  const hit = cache.get(key)
  if (hit) return hit

  const tw = textWidth(tg)
  const embH = t >= 3 ? EMB_H[t] || 14 : 18
  const bw = emb ? Math.round(Math.min(Math.max(embH * r, 9), 36) * 10) / 10 : 0
  const end = endOf(t)
  const extra = t >= 16 ? 0 : (t === 5 ? 10 : t >= 6 ? 6 : 0) + (t >= 11 ? 4 : 0)
  const pad = t >= 3 ? 14 : 18
  const { fs, sp } = fontFor(n)
  const noEmbIcon = !emb && t >= 2 && t <= 6 ? 14 : 0
  const widthFor = (icon) => Math.round(pad + icon + Math.max(tw, 21) + end * 2 + extra)

  let lead = 4, icon = noEmbIcon, W = widthFor(icon)
  if (emb) {
    if (t < 3) { lead = 4; icon = Math.ceil(lead + bw + 2); W = widthFor(icon) }
    else {
      const m = strokeOf(t) / 2 + 1.1
      lead = MIN_LEAD[t] || 8
      for (; lead <= 44; lead += 0.5) {
        icon = Math.ceil(lead + bw + 2); W = widthFor(icon)
        if (boxInside(bodyPoly(t, W), lead, 14 - embH / 2, bw, embH, m)) break
      }
      icon = Math.ceil(lead + bw + 2); W = widthFor(icon)
    }
  }
  const ex = EX[t] || 0, dy = TOP[t] || 0, bot = BOT[t] || 0
  const out = {
    t, tag: tg, n, tw, bw, embH, embX: lead, icon, end, W, ex, dy, bot, H: 28 + dy + bot, cy: 14 + dy, cx: W / 2,
    fs, sp, stroke: strokeOf(t), body: bodyPoly(t, W), inner: innerPoly(t, W),
    tx: icon + (W - icon) / 2 + (icon ? 1 : 0) + (t === 5 ? 3 : 0) + sp / 2,
  }
  if (cache.size > 400) cache.clear()
  cache.set(key, out)
  return out
}
