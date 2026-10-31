import { BORDER_URL_RE, IMG_SCALE } from './borderUrl'
const C = 75
const n1 = (v) => Math.round(v * 10) / 10
const pol = (a, r) => { const t = (a * Math.PI) / 180; return [n1(C + r * Math.cos(t)), n1(C + r * Math.sin(t))] }
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
const sty = (d, dl = 0, x = '') => `style="--d:${d}s;--dl:${dl}s;${x}"`
const G = (cls, d, dl, inner, x = '') => `<g class="${cls}" ${sty(d, dl, x)}>${inner}</g>`
const arc = (r, a0, a1) => { const [x0, y0] = pol(a0, r), [x1, y1] = pol(a1, r); return `M${x0} ${y0}A${r} ${r} 0 ${(a1 - a0) % 360 > 180 ? 1 : 0} 1 ${x1} ${y1}` }
const pts = (arr) => arr.map((p) => p.join(',')).join(' ')

const SH = {
  dot: (c) => `<circle r="1.7" fill="${c}"/>`,
  orb: (c, c2) => `<circle r="3" fill="${c}" fill-opacity=".35"/><circle r="1.6" fill="${c2 || c}"/>`,
  star4: (c) => `<path d="M0-5 1.3-1.3 5 0 1.3 1.3 0 5-1.3 1.3-5 0-1.3-1.3z" fill="${c}"/>`,
  star5: (c) => `<path d="M0-5.5 1.6-1.7 5.6-1.5 2.5 1 3.4 5 0 2.8-3.4 5-2.5 1-5.6-1.5-1.6-1.7z" fill="${c}"/>`,
  diamond: (c, c2) => `<path d="M0-6 3 0 0 6-3 0z" fill="${c}" stroke="${c2 || c}" stroke-width=".6"/>`,
  sq: (c, c2) => `<rect x="-2.2" y="-2.2" width="4.4" height="4.4" fill="none" stroke="${c}" stroke-width="1"/><rect x="-.8" y="-.8" width="1.6" height="1.6" fill="${c2 || c}"/>`,
  leaf: (c, c2) => `<path d="M0-8C5-4 5 3 0 8C-5 3-5-4 0-8z" fill="${c}"/><path d="M0-6V6" stroke="${c2 || c}" stroke-width=".7" stroke-opacity=".7"/>`,
  petal: (c, c2) => `<path d="M0-6C4-5 5 1 0 5C-5 1-4-5 0-6z" fill="${c}"/><path d="M0-6 0-3" stroke="${c2 || c}" stroke-width=".8"/>`,
  shard: (c, c2) => `<path d="M0-10 2.5-1 0 6-2.5-1z" fill="${c}"/><path d="M0-10 0 6" stroke="${c2 || '#fff'}" stroke-width=".6" stroke-opacity=".8"/>`,
  feather: (c, c2) => `<path d="M0-11C4.5-6 4.5 3 0 10C-4.5 3-4.5-6 0-11z" fill="${c}"/><path d="M0-10V9" stroke="${c2 || c}" stroke-width=".8" stroke-opacity=".8"/>`,
  bolt: (c) => `<path d="M1.5-9-3 .5 0 .5-1.5 9 3-1 0-1z" fill="${c}"/>`,
  drop: (c) => `<path d="M0-7C4-1 4 4 0 4C-4 4-4-1 0-7z" fill="${c}"/>`,
  crescent: (c) => `<path d="M0-6A6 6 0 1 0 0 6 4.4 4.4 0 1 1 0-6z" fill="${c}"/>`,
  link: (c, c2) => `<rect x="-2.2" y="-4.4" width="4.4" height="8.8" rx="2.2" fill="none" stroke="${c}" stroke-width="1.6"/><rect x="-2.2" y="-4.4" width="4.4" height="8.8" rx="2.2" fill="none" stroke="${c2 || c}" stroke-width=".5" stroke-opacity=".8"/>`,
  flower: (c, c2) => [0, 72, 144, 216, 288].map((a) => `<circle cx="${n1(2.7 * Math.cos((a * Math.PI) / 180))}" cy="${n1(2.7 * Math.sin((a * Math.PI) / 180))}" r="2.1" fill="${c}"/>`).join('') + `<circle r="1.5" fill="${c2 || '#ffd54a'}"/>`,
  cloud: (c) => `<circle cx="-3" cy="1" r="3" fill="${c}"/><circle cx="1" cy="-1" r="3.8" fill="${c}"/><circle cx="4.5" cy="1.2" r="2.7" fill="${c}"/><rect x="-5.5" y="1" width="12" height="3" rx="1.5" fill="${c}"/>`,
  butterfly: (c, c2) => `<g class="a-flut"><path d="M0 0C-2-6-9-7-9-1C-9 3-4 4 0 1z" fill="${c}"/><path d="M0 0C2-6 9-7 9-1C9 3 4 4 0 1z" fill="${c}"/><path d="M0 1C-4 3-7 7-4 8C-2 8 0 5 0 1zM0 1C4 3 7 7 4 8C2 8 0 5 0 1z" fill="${c2 || c}"/></g><path d="M0-3V5" stroke="#241a3a" stroke-width="1" stroke-linecap="round"/>`,
  claw: (c) => `<path d="M-5-10C-1-4 0 3 4 10C1 3 1-3-5-10z" fill="${c}"/><path d="M-1-10C2-5 3 1 6 8C4 2 3-4-1-10z" fill="${c}" fill-opacity=".7"/>`,
  tri: (c, c2) => `<path d="M0-7 6 5-6 5z" fill="${c}" fill-opacity=".75" stroke="${c2 || '#fff'}" stroke-width=".7"/>`,
  clock: (c, c2) => `<circle r="5" fill="none" stroke="${c}" stroke-width="1" stroke-dasharray="14 4"/><path d="M0 0V-3.4M0 0 2.6 1.6" stroke="${c2 || c}" stroke-width="1" stroke-linecap="round"/>`,
  cshard: (c, c2) => `<path d="M-5-6 4-8 7-1 2 7-6 4z" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width=".9"/><path d="M0-2.8V0L2 1" stroke="${c2 || c}" stroke-width=".8" fill="none"/>`,
  gem: (c, c2) => `<path d="M-4-2 0-5 4-2 0 5z" fill="${c}"/><path d="M-4-2H4M0-5 0 5" stroke="${c2 || '#fff'}" stroke-width=".5" stroke-opacity=".8"/>`,
  rune0: (c) => `<path d="M0-5V5M0-5 3-2M0 0 3 3" stroke="${c}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  rune1: (c) => `<path d="M-3-5 3 0-3 5M3-5V5" stroke="${c}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  rune2: (c) => `<path d="M0-5 4 4H-4zM0-1V3" stroke="${c}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  rune3: (c) => `<circle r="3.6" stroke="${c}" stroke-width="1.2" fill="none"/><path d="M0-5.5V5.5" stroke="${c}" stroke-width="1.2"/>`,
  rune4: (c) => `<path d="M-3-5H3L-3 5H3M0-1V1" stroke="${c}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
}
const RUNES = ['rune0', 'rune1', 'rune2', 'rune3', 'rune4']

function orbit(n, r, shape, o = {}) {
  const { c = '#fff', c2, cols, s = 1, d = 40, rev, up, off = -90, rot = 90, alt, an, jit = 0, sp = 0.6 } = o
  let h = ''
  for (let i = 0; i < n; i++) {
    const a = off + (i * 360) / n, [x, y] = pol(a, r + (jit ? (rnd(i + 3) - 0.5) * jit : 0))
    const shp = Array.isArray(shape) ? shape[i % shape.length] : shape
    const col = cols ? cols[i % cols.length] : c
    const sc = s * (o.vary ? 0.75 + rnd(i + 9) * 0.6 : 1)
    const body = SH[shp](col, c2)
    const r0 = up ? 0 : a + rot + (alt && i % 2 ? 90 : 0)
    h += `<g transform="translate(${x} ${y}) rotate(${n1(r0)}) scale(${n1(sc)})">${an ? G(an, o.ad || 3, -i * sp, body) : body}</g>`
  }
  if (!d) return `<g>${h}</g>`
  return G(rev ? 'a-spinr' : 'a-spin', d, o.dl || 0, h)
}
function orbitUp(n, r, shape, o = {}) {
  const { c = '#fff', c2, cols, s = 1, d = 40, rev, off = -90, sp = 0.6 } = o
  let h = ''
  for (let i = 0; i < n; i++) {
    const a = off + (i * 360) / n, [x, y] = pol(a, r)
    const shp = Array.isArray(shape) ? shape[i % shape.length] : shape
    const col = cols ? cols[i % cols.length] : c
    h += `<g transform="translate(${x} ${y})">${G(rev ? 'a-upr' : 'a-up', d, 0, `<g transform="scale(${n1(s)})">${SH[shp](col, o.c2 || (o.cols2 && o.cols2[i % o.cols2.length]))}</g>`)}</g>`
    void sp
  }
  return G(rev ? 'a-spinr' : 'a-spin', d, 0, h)
}
const ring = (r, c, w = 1.5, o = {}) => {
  const el = `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} stroke-opacity="${o.op ?? 1}" stroke-linecap="round"/>`
  return o.an ? G(o.an, o.d || 6, o.dl || 0, el) : el
}
const glow = (c, r = 53, op = 0.3, d = 4) => G('a-pulse gl', d, 0, [10, 6, 2.5].map((w, i) => `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}" stroke-opacity="${n1(op * (0.35 + i * 0.3))}"/>`).join(''))
const arcs = (list) => list.map((a) => G(a.rev ? 'a-spinr' : 'a-spin', a.d, a.dl || 0, `<path d="${arc(a.r, a.a0, a.a1)}" fill="none" stroke="${a.c}" stroke-width="${a.w || 2}" stroke-linecap="round" stroke-opacity="${a.op ?? 1}"/>`)).join('')
const waveRing = (r, amp, k, c, w, d, rev, op = 1) => {
  let p = ''
  for (let a = 0; a <= 360; a += 4) { const rr = r + amp * Math.sin((k * a * Math.PI) / 180), [x, y] = pol(a, rr); p += `${a ? 'L' : 'M'}${x} ${y}` }
  return G(rev ? 'a-spinr' : 'a-spin', d, 0, `<path d="${p}Z" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-opacity="${op}"/>`)
}
function sparks(n, o = {}) {
  const { c = '#ffb347', cols, a0 = 0, a1 = 360, r0 = 50, r1 = 62, h = 24, s = 1, d = 3, shape = 'dot', seed = 1 } = o
  let t = ''
  for (let i = 0; i < n; i++) {
    const a = a0 + rnd(seed + i) * (a1 - a0), [x, y] = pol(a, r0 + rnd(seed + i * 3) * (r1 - r0))
    const col = cols ? cols[i % cols.length] : c
    t += `<g transform="translate(${x} ${y})">${G('a-rise', d * (0.8 + rnd(seed + i * 7) * 0.7), -rnd(seed + i * 5) * d * 2, `<g transform="scale(${n1(s * (0.6 + rnd(seed + i * 11) * 0.8))})">${SH[shape](col)}</g>`, `--h:${n1(h * (0.7 + rnd(seed + i * 13) * 0.6))}px`)}</g>`
  }
  return t
}
function stars(n, o = {}) {
  const { c = '#fff', cols, r0 = 53, r1 = 72, s = 1, d = 3, shape = 'star4', seed = 5, a0 = 0, a1 = 360 } = o
  let t = ''
  for (let i = 0; i < n; i++) {
    const [x, y] = pol(a0 + rnd(seed + i) * (a1 - a0), r0 + rnd(seed + i * 3) * (r1 - r0))
    t += `<g transform="translate(${x} ${y}) scale(${n1(s * (0.5 + rnd(seed + i * 9) * 0.7))})">${G('a-tw', d * (0.7 + rnd(seed + i) * 0.8), -rnd(seed + i * 2) * 4, SH[shape](cols ? cols[i % cols.length] : c))}</g>`
  }
  return t
}
function wings(o = {}) {
  const { n = 7, len = 44, w = 6, c1 = '#fff', c2 = '#cfd8ff', rx = 40, ry = -10, a0 = -78, a1 = 18, fa = 7, d = 3.4, dl = 0, op = 1, taper = 0.4, line } = o
  let side = ''
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0, a = a0 + t * (a1 - a0), L = len * 1.3 * (1 - taper * Math.abs(t - 0.28)), ww = w * 1.25 * (1 - 0.25 * t)
    const col = i % 2 ? c2 : c1
    side += `<g transform="translate(${C + rx} ${C + ry}) rotate(${n1(a)})"><path d="M0 0C${n1(L * 0.18)} ${-ww} ${n1(L * 0.78)} ${n1(-ww * 0.95)} ${n1(L)} 0C${n1(L * 0.78)} ${n1(ww * 0.65)} ${n1(L * 0.2)} ${n1(ww)} 0 0z" fill="${col}" fill-opacity="${op}" ${line ? `stroke="${line}" stroke-width=".6"` : ''}/><path d="M${n1(L * 0.1)} 0H${n1(L * 0.92)}" stroke="#fff" stroke-opacity=".28" stroke-width=".7"/></g>`
  }
  const one = (m) => `<g ${m ? `transform="translate(150 0) scale(-1 1)"` : ''}>${G('a-flap', d, dl, side, `--fa:${fa}deg;transform-origin:${C + rx}px ${C + ry}px`)}</g>`
  return one(0) + one(1)
}
function horns(c1, c2, o = {}) {
  const { x = 21, y = -44, s: s0 = 1, rot = 0, big = 0 } = o
  const s = s0 * 1.3
  const hn = `<path d="M0 0C${3 + big} -10 ${12 + big} -16 ${15 + big * 2} -${30 + big * 2}C${8 + big} -${23 + big} -1 -15 -7 -3z" fill="${c1}"/><path d="M1 -2C4 -10 11 -16 13 -26" fill="none" stroke="${c2}" stroke-width="1" stroke-opacity=".85" stroke-linecap="round"/>`
  const side = (m) => `<g transform="${m ? 'translate(150 0) scale(-1 1) ' : ''}translate(${C + x} ${C + y}) rotate(${rot}) scale(${s})">${G('a-sw', 5, m ? -1.5 : 0, hn, `--fa:2.4deg;transform-origin:0 0`)}</g>`
  return side(0) + side(1)
}
function crown(c1, c2, o = {}) {
  const { n = 5, h: h0 = 14, span = 62, gem, star, base = 49 } = o
  const h = h0 * 1.25
  const A0 = -90 - span / 2, st = span / (n - 1)
  const P = [pol(A0, base)]
  for (let k = 0; k < n; k++) {
    const mid = Math.abs(k - (n - 1) / 2) < 0.1
    P.push(pol(A0 + k * st, base + h * (mid ? 1.3 : 1)))
    if (k < n - 1) P.push(pol(A0 + (k + 0.5) * st, base + h * 0.3))
  }
  P.push(pol(A0 + (n - 1) * st, base))
  let t = `<polygon points="${pts(P)}" fill="${c1}" stroke="${c2}" stroke-width="1.2" stroke-linejoin="round"/><path d="${arc(base + 1.5, A0, A0 + span)}" fill="none" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>`
  for (let k = 0; k < n; k++) {
    const mid = Math.abs(k - (n - 1) / 2) < 0.1, [x, y] = pol(A0 + k * st, base + h * (mid ? 1.3 : 1) + 2.4)
    t += `<g transform="translate(${x} ${y})">${G('a-tw', 2.6, -k * 0.5, star ? SH.star5(gem || '#fff') : `<circle r="2.1" fill="${gem || '#fff'}"/>`)}</g>`
  }
  return t
}
function gear(r, teeth, o = {}) {
  const { c = '#9aa4c0', c2 = '#5a6488', d = 24, rev, tw = 3.4, th = 4.2, w = 2 } = o
  let t = `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"/><circle cx="${C}" cy="${C}" r="${r - 3.4}" fill="none" stroke="${c2}" stroke-width=".8" stroke-dasharray="2 3"/>`
  for (let i = 0; i < teeth; i++) t += `<rect x="${n1(C - tw / 2)}" y="${n1(C - r - th + 0.6)}" width="${tw}" height="${th}" rx=".8" fill="${c}" transform="rotate(${n1((i * 360) / teeth)} ${C} ${C})"/>`
  return G(rev ? 'a-spinr' : 'a-spin', d, 0, t)
}
function bolts(n, o = {}) {
  const { r0 = 52, r1: r1a = 72, c = '#ffe66b', c2 = '#fff', d = 2.2, seed = 2, a0 = 0, a1 = 360, w = 1.6 } = o
  const r1 = r1a + 8
  let t = ''
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * (a1 - a0)) / n + rnd(seed + i) * 12
    const P = [pol(a, r0)]
    for (let k = 1; k <= 4; k++) P.push(pol(a + (rnd(seed + i * 5 + k) - 0.5) * 16, r0 + ((r1 - r0) * k) / 4))
    t += G('a-flick', d * (0.8 + rnd(seed + i) * 0.8), -rnd(seed + i * 3) * 3, `<polyline points="${pts(P)}" fill="none" stroke="${c}" stroke-width="${w + 2.2}" stroke-opacity=".28" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${pts(P)}" fill="none" stroke="${c2}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`)
  }
  return t
}
function tentacles(n, o = {}) {
  const { c = '#2aa6a0', c2 = '#bff7ee', a0 = 25, a1 = 155, len: len0 = 24, seed = 4, d = 4 } = o
  const len = len0 * 1.3
  let t = ''
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * (a1 - a0)) / (n - 1), [x0, y0] = pol(a, 47), [x1, y1] = pol(a + (a < 90 ? 16 : -16), 49 + len), side = a < 90 ? 1 : -1
    const [cx, cy] = pol(a + side * 4, 49 + len * 0.55)
    const p = `M${x0} ${y0}Q${n1(cx + side * 9)} ${n1(cy)} ${x1} ${y1}`
    t += G('a-sw', d * (0.8 + rnd(seed + i) * 0.5), -i * 0.6, `<path d="${p}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="${p}" fill="none" stroke="${c2}" stroke-width="1.6" stroke-linecap="round" stroke-dasharray=".1 4.6" stroke-opacity=".9"/>`, `--fa:${n1(5 + rnd(seed + i) * 4)}deg;transform-origin:${x0}px ${y0}px`)
  }
  return t
}
function vines(c, c2, o = {}) {
  const { r = 54, k = 7, amp = 3, d = 30, rev, w = 2 } = o
  return waveRing(r, amp, k, c, w, d, rev) + waveRing(r + 1, amp * 0.8, k, c2, 0.7, d, rev, 0.8)
}
function serpent(o = {}) {
  const { n = 16, r = 60, c = '#7af', c2 = '#fff', d = 9, wob = 4, step = 7, head = '#fff', eye = '#ff3b6b', horn } = o
  let t = ''
  for (let i = n - 1; i >= 0; i--) {
    const a = -90 - i * step, rr = r + wob * Math.sin(i * 0.9), [x, y] = pol(a, rr), sz = 4.6 - (i / n) * 3.6
    t += G('a-pulse', 1.6, -i * 0.1, `<circle cx="${x}" cy="${y}" r="${n1(sz)}" fill="${i % 2 ? c : c2}" fill-opacity="${n1(1 - i / (n * 1.25))}"/>`)
  }
  const [hx, hy] = pol(-90 + 4, r)
  t += `<g transform="translate(${hx} ${hy}) rotate(4)"><path d="M-6-4.5 8 0-6 4.5C-3 2-3-2-6-4.5z" fill="${head}"/><circle cx="2" cy="-1.8" r="1.1" fill="${eye}"/><circle cx="2" cy="1.8" r="1.1" fill="${eye}"/>${horn ? `<path d="M-4-4-9-8M-4 4-9 8" stroke="${horn}" stroke-width="1.6" stroke-linecap="round"/>` : ''}</g>`
  return G('a-spin', d, 0, t)
}
const tilt = (rx, ry, rot, c, w, d, rev, dash, op = 1) => `<g transform="rotate(${rot} ${C} ${C})">${G(rev ? 'a-spinr2' : 'a-spin2', d, 0, `<ellipse cx="${C}" cy="${C}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-opacity="${op}" stroke-linecap="round"/>`)}</g>`
const flameTail = (c1, c2, x, y, rot, s, d) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${G('a-sw', d, 0, `<path d="M0 0C14-4 26-14 24-30C22-20 14-14 6-10C14-14 18-24 14-34C8-22 2-12-2-4z" fill="${c1}" fill-opacity=".9"/><path d="M2-2C12-5 20-13 20-24" fill="none" stroke="${c2}" stroke-width="1.6" stroke-linecap="round"/>`, '--fa:7deg;transform-origin:0 0')}</g>`

const D = {}
const def = (id, b, f = '') => { D[id] = { b, f } }

def('b01', glow('#b3122b', 53, 0.5) + horns('#2b0b12', '#ff3b4d', { s: 1, big: 1 }) + sparks(7, { c: '#ff4b4b', a0: 200, a1: 340, h: 20, s: 0.6, d: 3 }), ring(51, '#7a0f22', 1.4, { op: 0.9 }))
def('b02', glow('#fff3b0', 54, 0.12) + orbit(10, 56, 'leaf', { c: '#4cae6a', c2: '#bff2c8', s: 0.85, d: 70, jit: 5, an: 'a-fl', ad: 5 }), orbit(7, 57, 'flower', { c: '#ffffff', c2: '#ffd54a', s: 1.1, d: 50, rev: 1, up: 1, an: 'a-fl', ad: 4, off: -60 }))
def('b03', glow('#cfd6e6', 53, 0.15), ring(51.5, '#b9c3d8', 1.2) + (() => { let p = ''; for (let i = 0; i < 28; i++) { const a = i * 360 / 28, [x0, y0] = pol(a, 51.5), [x1, y1] = pol(a + 360 / 28, 51.5); p += `M${x0} ${y0}A4.6 4.6 0 0 1 ${x1} ${y1}` } return `<path d="${p}" fill="none" stroke="#e4e9f5" stroke-width="1.4" transform="translate(0 0)" stroke-linecap="round"/>` })() + orbit(28, 58, 'dot', { c: '#d9deea', s: 0.5, d: 0 }) + ring(54, '#fff', 1.6, { dash: '9 300', an: 'a-spin', d: 5 }) + stars(5, { c: '#fff', r0: 54, r1: 62, s: 0.7 }))
def('b04', arcs([{ r: 55, a0: 0, a1: 250, c: '#38e0ff', d: 6, w: 2.6 }, { r: 60, a0: 40, a1: 220, c: '#9b6bff', d: 9, rev: 1, w: 2.6 }, { r: 65, a0: 100, a1: 260, c: '#38e0ff', d: 12, w: 1.8, op: 0.8 }, { r: 52, a0: 200, a1: 330, c: '#c79bff', d: 4, rev: 1, w: 1.6 }]), orbit(6, 58, 'dot', { c: '#fff', s: 0.9, d: 6 }))
def('b05', glow('#47c46a', 53, 0.18) + orbit(16, 54, 'leaf', { cols: ['#2f9e57', '#58c878', '#3fb26a'], c2: '#c9ffd6', s: 1, d: 90, an: 'a-breathe2', ad: 5, sp: 0.4, jit: 3 }), ring(51, '#2f9e57', 1.4) + orbit(3, 56, 'flower', { c: '#ffd0e6', c2: '#ff7aa8', s: 0.8, d: 0, off: -150 }))
def('b06', glow('#ffd86b', 55, 0.1), stars(16, { cols: ['#ffe9a0', '#fff', '#ffd05a'], r0: 52, r1: 70, s: 1, d: 2.6, seed: 7 }) + ring(50.8, '#ffd86b', 1, { op: 0.6 }))
def('b07', glow('#7fd8ff', 53, 0.25), orbit(14, 55, 'shard', { cols: ['#bdeaff', '#7fd0ff', '#e8fbff'], c2: '#fff', s: 1.15, d: 0, vary: 1 }) + ring(51, '#aee6ff', 1.3, { dash: '1 4' }) + stars(9, { c: '#fff', r0: 55, r1: 70, s: 0.8, d: 2.2, seed: 12 }))
def('b08', orbit(8, 58, 'cloud', { c: '#e8f2ff', s: 1.15, d: 60, jit: 4 }) + orbit(6, 62, 'cloud', { c: '#b7d2ff', s: 0.8, d: 80, rev: 1, off: -60 }), ring(51, '#cfe1ff', 1.2, { op: 0.7 }) + sparks(7, { c: '#ffffff', r0: 54, r1: 66, h: 14, s: 0.5, d: 4 }))
def('b09', glow('#ff6a1a', 53, 0.4, 2.6), orbit(11, 54, 'petal', { cols: ['#ff5a1a', '#ff9a2a', '#ffd05a'], c2: '#fff1b0', s: 1.5, d: 0, off: 0, an: 'a-pulse', ad: 1.6, sp: 0.15, rot: 90 }).replace('<g>', '<g>') + sparks(20, { cols: ['#ffb347', '#ff6a1a', '#ffe08a'], a0: 10, a1: 170, r0: 50, r1: 60, h: 34, s: 0.9, d: 2.6 }) + ring(51, '#ff7a2a', 1.4, { dash: '3 5', an: 'a-spin', d: 20 }))
def('b10', orbit(12, 58, 'petal', { c: '#ffb7d0', c2: '#ff7aa8', s: 1.2, d: 26, an: 'a-fl', ad: 3, jit: 6 }) + orbit(7, 64, 'petal', { c: '#ffd5e4', s: 0.9, d: 34, rev: 1, off: -40 }), sparks(6, { c: '#ffc2d8', shape: 'petal', r0: 50, r1: 66, h: 16, s: 0.9, d: 4, a0: -60, a1: 80 }))

def('b11', glow('#19e6ff', 54, 0.18) + (() => { let t = ''; for (let i = 0; i < 12; i++) { const a = i * 30 + 8, [x0, y0] = pol(a, 53), [x1, y1] = pol(a, 59), [x2, y2] = pol(a + (i % 2 ? 7 : -7), 64), [x3, y3] = pol(a + (i % 2 ? 7 : -7), 68); t += G('a-dash', 2.4 + (i % 3), -i * 0.3, `<polyline points="${x0},${y0} ${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="none" stroke="${i % 3 ? '#19e6ff' : '#ff2bd6'}" stroke-width="1.5" stroke-linejoin="round" stroke-dasharray="6 4"/><rect x="${n1(x3 - 1.6)}" y="${n1(y3 - 1.6)}" width="3.2" height="3.2" fill="${i % 3 ? '#19e6ff' : '#ff2bd6'}"/>`) } return t })(), ring(51.5, '#19e6ff', 1.4) + ring(57, '#ff2bd6', 0.8, { dash: '10 6', an: 'a-spinr', d: 18 }))
def('b12', glow('#9fe8ff', 53, 0.12), crown('#6fd8ff', '#e8fbff', { n: 5, h: 15, span: 70, gem: '#fff' }) + stars(6, { c: '#fff', r0: 56, r1: 68, a0: 120, a1: 420, s: 0.8, d: 2.4 }))
def('b13', waveRing(55, 3.2, 8, '#2cd0e8', 2.4, 14) + waveRing(59, 2.6, 6, '#7ae6f5', 1.6, 18, 1, 0.9) + waveRing(63, 2, 10, '#0b8fb8', 1.4, 22, 0, 0.8), orbit(8, 56, 'drop', { c: '#bff3ff', s: 0.9, d: 16, rev: 1, an: 'a-fl', ad: 3 }))
def('b14', glow('#ffe14a', 53, 0.2), bolts(7, { c: '#ffd426', c2: '#fffbe0', d: 2, seed: 4 }) + orbit(4, 60, 'claw', { c: '#fff3a8', s: 1.4, d: 0, off: -45, rot: 120 }) + orbit(4, 60, 'claw', { c: '#ffd426', s: 1.2, d: 0, off: 135, rot: 60 }))
def('b15', orbit(10, 55, 'leaf', { c: '#3fb26a', c2: '#c9ffd6', s: 0.7, d: 60, rev: 1 }), orbitUp(4, 60, 'butterfly', { cols: ['#ff8ad0', '#6fb6ff', '#ffd05a', '#b88bff'], cols2: ['#ffd1ee', '#cfe6ff', '#fff0b3', '#e4d2ff'], s: 1.25, d: 22 }) + orbit(5, 52, 'flower', { c: '#ffd0e6', c2: '#ffd54a', s: 0.7, d: 0, off: -20 }))
def('b16', arcs([{ r: 56, a0: 20, a1: 300, c: '#fff1c2', d: 14, w: 7, op: 0.95 }, { r: 56, a0: 120, a1: 400, c: '#2a1e5a', d: 14, rev: 1, w: 7.6, op: 1 }, { r: 56, a0: 10, a1: 70, c: '#ffc861', d: 14, w: 1.6 }]) + glow('#9a7bff', 53, 0.2), stars(8, { c: '#ffe9a0', r0: 62, r1: 72, s: 0.7, d: 2.6 }))
def('b17', glow('#7cff2a', 53, 0.3) + vines('#4fe02a', '#d4ff8a', { r: 55, k: 9, amp: 3.4, d: 40, w: 2.4 }) + orbit(14, 57, 'leaf', { c: '#59ff3a', c2: '#145a00', s: 0.75, d: 40, rev: 0 }), sparks(10, { cols: ['#9dff4a', '#d7ff6b'], r0: 52, r1: 64, h: 24, s: 0.7, d: 2.8 }) + sparks(4, { c: '#9dff4a', shape: 'drop', r0: 56, r1: 64, h: 12, s: 0.8, d: 3, seed: 9, a0: 20, a1: 160 }))
def('b18', gear(58, 18, { c: '#b9c3da', c2: '#6d7898', d: 36 }) + gear(63, 12, { c: '#8a96b8', c2: '#4b5580', d: 28, rev: 1, tw: 3, th: 3 }), `<g class="a-pulse" ${sty(4)}><ellipse cx="75" cy="22" rx="24" ry="6" fill="none" stroke="#ffd35a" stroke-width="2.4"/><ellipse cx="75" cy="22" rx="24" ry="6" fill="none" stroke="#fff3b0" stroke-width=".8"/></g>` + orbit(8, 51, 'dot', { c: '#ffd35a', s: 0.6, d: 0 }) + ring(50.8, '#ffd35a', 1, { op: 0.7 }))
def('b19', G('a-sw', 8, 0, `<path d="${arc(58, -170, -20)}" stroke="#46f2b0" stroke-width="7" fill="none" stroke-linecap="round" stroke-opacity=".55"/><path d="${arc(58, -150, -40)}" stroke="#b9ffe6" stroke-width="2" fill="none" stroke-linecap="round" stroke-opacity=".8"/>`, '--fa:6deg;transform-origin:75px 75px') + G('a-sw', 11, -3, `<path d="${arc(63, -20, 130)}" stroke="#7f7bff" stroke-width="7" fill="none" stroke-linecap="round" stroke-opacity=".5"/><path d="${arc(63, 0, 110)}" stroke="#d6caff" stroke-width="2" fill="none" stroke-linecap="round" stroke-opacity=".8"/>`, '--fa:-7deg;transform-origin:75px 75px') + G('a-sw', 9, -5, `<path d="${arc(60, 120, 250)}" stroke="#ff8ee0" stroke-width="6" fill="none" stroke-linecap="round" stroke-opacity=".45"/>`, '--fa:5deg;transform-origin:75px 75px'), stars(9, { c: '#fff', r0: 56, r1: 72, s: 0.7, d: 2.4, seed: 21 }))
def('b20', glow('#3a1a66', 54, 0.5) + orbit(11, 58, 'feather', { cols: ['#241a3a', '#3a2760', '#16101f'], c2: '#9d7bff', s: 1.6, d: 50, an: 'a-sway2', ad: 5, sp: 0.5 }), orbit(5, 62, 'feather', { c: '#4b2f80', c2: '#b79bff', s: 1.1, d: 36, rev: 1, off: -30 }) + sparks(6, { c: '#9d7bff', r0: 54, r1: 68, h: 20, s: 0.5, d: 4 }))

def('b21', glow('#6a1fb0', 54, 0.35) + wings({ n: 8, len: 46, w: 6.5, c1: '#16121f', c2: '#2c2140', rx: 38, ry: -6, a0: -82, a1: 20, d: 3.8, line: '#7a5cd0' }) + wings({ n: 6, len: 32, w: 5, c1: '#241a38', c2: '#3a2a58', rx: 40, ry: 8, a0: -30, a1: 60, d: 3.8, dl: -0.4, fa: 5 }), ring(51, '#6a3bd0', 1.2, { op: 0.8 }) + sparks(6, { c: '#2a1f40', shape: 'feather', r0: 56, r1: 72, h: 26, s: 0.7, d: 4, a0: 150, a1: 210 }))
def('b22', glow('#fff1b8', 54, 0.35) + wings({ n: 9, len: 50, w: 6.5, c1: '#ffffff', c2: '#ffe9a8', rx: 38, ry: -8, a0: -84, a1: 22, d: 3.6, op: 0.95 }) + wings({ n: 7, len: 34, w: 5, c1: '#fff7dc', c2: '#cfe6ff', rx: 40, ry: 8, a0: -30, a1: 64, d: 3.6, dl: -0.5, fa: 5 }), `<ellipse cx="75" cy="21" rx="20" ry="5" fill="none" stroke="#ffe27a" stroke-width="2" class="a-pulse" ${sty(3)}/>` + sparks(14, { cols: ['#ffe27a', '#fff'], r0: 52, r1: 70, h: 28, s: 0.7, d: 3, shape: 'star4' }))
def('b23', glow('#ff5a1f', 53, 0.35) + horns('#7a1020', '#ffcf5a', { s: 1.25, big: 3, x: 22, y: -42 }) + orbit(18, 55, 'diamond', { cols: ['#c4102a', '#ff5a1f', '#ffb347'], c2: '#ffe08a', s: 0.85, d: 60, an: 'a-pulse', ad: 3, sp: 0.2 }), ring(51, '#ffb347', 1.4) + sparks(10, { cols: ['#ff8a1f', '#ffd05a'], a0: -160, a1: -20, r0: 50, r1: 62, h: 26, s: 0.7, d: 2.6 }))
def('b24', glow('#6a2bd8', 56, 0.45, 5) + arcs([{ r: 58, a0: 0, a1: 150, c: '#b36bff', d: 7, w: 4 }, { r: 58, a0: 180, a1: 330, c: '#4a7bff', d: 7, w: 4 }, { r: 63, a0: 30, a1: 200, c: '#ff6bd0', d: 11, rev: 1, w: 3, op: 0.9 }, { r: 68, a0: 90, a1: 240, c: '#7be0ff', d: 15, w: 2, op: 0.8 }, { r: 54, a0: 200, a1: 340, c: '#e0c6ff', d: 5, rev: 1, w: 1.6 }]), stars(14, { cols: ['#fff', '#cdb6ff', '#9fe6ff'], r0: 55, r1: 72, s: 0.8, d: 2.6, seed: 31 }) + ring(51, '#b36bff', 1.2))
def('b25', glow('#ffc93a', 54, 0.3) + ring(56, '#d9a21b', 3) + ring(56, '#ffe48a', 0.8) + orbit(12, 56, 'diamond', { c: '#ffd45a', c2: '#fff0a8', s: 0.9, d: 0 }) + ring(61, '#d9a21b', 1.2, { dash: '2 5' }), crown('#ffcf3a', '#8a5a00', { n: 3, h: 12, span: 40, gem: '#ff3b5c', base: 50 }) + ring(52.5, '#fff6c4', 1.6, { dash: '12 400', an: 'a-spin', d: 5 }) + orbit(4, 64, 'star4', { c: '#fff', s: 0.9, d: 0, off: -45, an: 'a-tw', ad: 2.4 }))
def('b26', orbit(26, 58, 'link', { c: '#aab6d6', c2: '#ffffff', s: 0.92, d: 70, alt: 1, rot: 0 }), orbit(22, 65, 'link', { c: '#5a4a8a', c2: '#c4b0ff', s: 0.85, d: 90, alt: 1, rev: 1, rot: 0 }) + glow('#6a3bd0', 53, 0.22) + sparks(8, { c: '#a58bff', r0: 56, r1: 70, h: 20, s: 0.55, d: 3.4 }))
def('b27', glow('#ff7a1a', 54, 0.4) + wings({ n: 8, len: 46, w: 6.8, c1: '#ff4a1a', c2: '#ffb21a', rx: 38, ry: -6, a0: -80, a1: 24, d: 2.6, taper: 0.5 }) + wings({ n: 5, len: 30, w: 5, c1: '#ffd05a', c2: '#ff7a1a', rx: 40, ry: 8, a0: -20, a1: 62, d: 2.6, dl: -0.3, fa: 6 }), sparks(18, { cols: ['#ff8a1f', '#ffd05a', '#9a8f88'], a0: -170, a1: 10, r0: 50, r1: 68, h: 36, s: 0.8, d: 2.8 }) + flameTail('#ff6a1a', '#ffe08a', 75, 24, -90, 0.5, 1.6))
def('b28', glow('#6ad5ff', 54, 0.2) + flameTail('#6ad5ff', '#e6fbff', 118, 112, 18, 1.15, 3.2) + flameTail('#a58bff', '#f0e8ff', 112, 120, 52, 0.95, 3.8), (() => { const ear = (m) => `<g transform="${m ? 'translate(150 0) scale(-1 1) ' : ''}translate(${C + 24} ${C - 40}) rotate(18)">${G('a-sw', 4, 0, `<path d="M-8 4 0-20 10 2z" fill="#f4f8ff"/><path d="M-4 2 0-13 5 1z" fill="#ff9ec7"/>`, '--fa:3deg;transform-origin:0 6px')}</g>`; return ear(0) + ear(1) })() + orbit(5, 61, 'orb', { c: '#6ad5ff', c2: '#fff', s: 1.2, d: 14, an: 'a-pulse', ad: 2 }))
def('b29', (() => { const wg = (m) => `<g ${m ? 'transform="translate(150 0) scale(-1 1)"' : ''}>${G('a-flutw', 3.6, m ? -0.2 : 0, `<path d="M111 69 141 17 167 35 165 67z" fill="#9fe6ff" fill-opacity=".55" stroke="#fff" stroke-width="1"/><path d="M111 75 165 71 160 109 127 115z" fill="#ffb3ec" fill-opacity=".5" stroke="#fff" stroke-width="1"/><path d="M114 80 134 122 118 131 106 100z" fill="#c6a8ff" fill-opacity=".55" stroke="#fff" stroke-width="1"/><path d="M111 69 150 40 165 67M111 75 143 90 160 109M141 17 140 66 165 71" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".7"/>`, `transform-origin:111px 73px`)}</g>`; return wg(0) + wg(1) })() + glow('#c6a8ff', 53, 0.2), sparks(12, { cols: ['#fff', '#9fe6ff', '#ffb3ec'], r0: 54, r1: 76, h: 22, s: 0.8, d: 2.4, shape: 'star4' }) + ring(51, '#cfe9ff', 1.2, { op: 0.8 }))
def('b30', glow('#ffd05a', 54, 0.2), crown('#ffcf3a', '#8a5a00', { n: 5, h: 13, span: 74, gem: '#fff', star: 1 }) + G('a-meteor', 3.2, 0, `<path d="M118 30 100 48" stroke="#ffe9a0" stroke-width="2.4" stroke-linecap="round"/><circle cx="118" cy="30" r="2.4" fill="#fff"/>`) + G('a-meteor', 4.1, -2, `<path d="M128 70 114 84" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="128" cy="70" r="1.8" fill="#ffe9a0"/>`) + stars(8, { c: '#ffe9a0', r0: 56, r1: 72, s: 0.8, a0: 100, a1: 440, d: 2.4 }))

def('b31', glow('#5a1fa0', 55, 0.5) + sparks(14, { cols: ['#3a1066', '#6a2bd8', '#1a0a33'], r0: 52, r1: 68, h: 30, s: 2.4, d: 4, shape: 'dot', seed: 3 }) + G('a-sw', 5, 0, `<path d="M137 132 131 22" stroke="#2a1e3a" stroke-width="3" stroke-linecap="round"/><path d="M131 22C123 10 105 12 94 28C107 22 121 25 132 35z" fill="#cdbcff"/><path d="M131 22C123 10 105 12 94 28" fill="none" stroke="#fff" stroke-width="1"/>`, '--fa:3deg;transform-origin:137px 132px'), orbit(2, 56, 'orb', { c: '#a58bff', c2: '#fff', s: 1.1, d: 0, off: -125, an: 'a-pulse' }) + ring(51, '#7a3bf0', 1.3, { dash: '4 4', an: 'a-spinr', d: 24 }))
def('b32', glow('#19e6ff', 54, 0.2), (() => { const pn = (m) => `<g ${m ? 'transform="translate(150 0) scale(-1 1)"' : ''}>${G('a-fl', 3.4, m ? -1 : 0, `<path d="M${C + 44} ${C - 30}h16l8 8v30l-8 8h-16z" fill="#06223a" fill-opacity=".55" stroke="#19e6ff" stroke-width="1.2"/><path d="M${C + 48} ${C - 22}h10M${C + 48} ${C - 14}h14M${C + 48} ${C - 6}h8" stroke="#ff2bd6" stroke-width="1.4" stroke-linecap="round"/>`)}${G('a-scan', 2.6, 0, `<rect x="${C + 46}" y="${C - 28}" width="16" height="1.6" fill="#19e6ff" fill-opacity=".9"/>`)}</g>`; return pn(0) + pn(1) })() + ring(52, '#19e6ff', 1.6) + ring(57, '#ff2bd6', 1, { dash: '14 6', an: 'a-spinr', d: 9 }) + ring(62, '#19e6ff', 0.8, { dash: '3 9', an: 'a-spin', d: 7 }) + bolts(5, { c: '#19e6ff', c2: '#fff', r0: 52, r1: 66, seed: 8, d: 1.6 }))
def('b33', glow('#2f7bff', 54, 0.35) + horns('#16306a', '#6ad0ff', { s: 1.2, big: 2, x: 21, y: -42 }) + orbit(6, 62, 'cloud', { c: '#2a3f7a', s: 0.9, d: 40 }), bolts(8, { c: '#6ad0ff', c2: '#fff', d: 1.8, seed: 12, r1: 74 }) + ring(51, '#6ad0ff', 1.4))
def('b34', glow('#0b8fb8', 55, 0.4), tentacles(7, { c: '#1f8f97', c2: '#c8fff4', len: 26 }) + sparks(14, { cols: ['#bff7ff', '#7ae6f5'], shape: 'orb', r0: 52, r1: 70, h: 34, s: 0.8, d: 3.4 }) + ring(51, '#7ae6f5', 1.2, { op: 0.8 }))
def('b35', glow('#fff1b8', 54, 0.3) + wings({ n: 8, len: 48, w: 6.5, c1: '#ffffff', c2: '#fff1b8', rx: 38, ry: -8, a0: -84, a1: 20, d: 4.2 }) + tilt(66, 66, 0, '#ffe27a', 1.2, 30, 0, '3 5'), orbit(12, 66, RUNES, { c: '#ffe27a', s: 0.9, d: 40, rot: 90 }) + ring(52, '#ffe27a', 1.4) + `<g class="a-pulse" ${sty(3)}><path d="M75 8V30M64 19H86" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>`)
def('b36', `<g>${G('a-fl', 8, 0, `<circle cx="108" cy="44" r="25" fill="#7a0a1a"/><circle cx="108" cy="44" r="25" fill="none" stroke="#ff2a3a" stroke-width="1.6"/><circle cx="100" cy="38" r="4" fill="#4a0510" fill-opacity=".7"/><circle cx="114" cy="52" r="5.5" fill="#4a0510" fill-opacity=".6"/><circle cx="118" cy="36" r="2.4" fill="#4a0510" fill-opacity=".7"/>`)}</g>` + glow('#b3122b', 54, 0.4), sparks(14, { cols: ['#2a0a14', '#6a0f22', '#3a0a18'], r0: 52, r1: 70, h: 32, s: 2.6, d: 4.2, seed: 6 }) + ring(51, '#ff2a3a', 1.2, { op: 0.8 }))
def('b37', glow('#ffffff', 54, 0.1), orbit(12, 58, 'tri', { cols: ['#ff6bd0', '#6bd0ff', '#ffe96b', '#7bff9b', '#b36bff'], c2: '#fff', s: 1.2, d: 30, an: 'a-pulse', ad: 2.6, vary: 1, sp: 0.35, rot: 60 }) + orbit(8, 64, 'diamond', { cols: ['#6bd0ff', '#ff6bd0', '#ffe96b'], s: 0.9, d: 44, rev: 1 }) + stars(8, { c: '#fff', r0: 54, r1: 72, s: 0.8, d: 2, seed: 40 }))
def('b38', glow('#6bd0ff', 54, 0.2), orbit(8, 59, ['cshard', 'clock'], { c: '#9fe6ff', c2: '#fff', s: 1.3, d: 34, an: 'a-glitch', ad: 3.2, sp: 0.4, up: 1 }) + orbit(4, 66, 'clock', { c: '#ff6bd0', s: 1.1, d: 22, rev: 1, up: 1 }) + ring(51, '#9fe6ff', 1.2, { dash: '2 3', an: 'a-glitch', d: 2.2 }))

def('b39', glow('#fff1b8', 56, 0.4) + wings({ n: 8, len: 50, w: 7, c1: '#ffffff', c2: '#ffe9a8', rx: 38, ry: -10, a0: -86, a1: 14, d: 4.6, op: 0.95 }) + wings({ n: 7, len: 44, w: 6, c1: '#fff7dc', c2: '#cfe6ff', rx: 40, ry: 0, a0: -60, a1: 40, d: 3.6, dl: -0.8, fa: 8 }) + wings({ n: 6, len: 34, w: 5, c1: '#ffe9a8', c2: '#fff', rx: 42, ry: 10, a0: -20, a1: 70, d: 3, dl: -1.4, fa: 9 }), `<ellipse cx="75" cy="20" rx="22" ry="5.5" fill="none" stroke="#ffe27a" stroke-width="2.2" class="a-pulse" ${sty(3)}/>` + orbit(8, 66, RUNES, { c: '#ffe27a', s: 0.7, d: 44, rev: 1 }) + ring(51, '#ffe27a', 1.2) + sparks(14, { cols: ['#ffe27a', '#fff'], r0: 52, r1: 72, h: 30, s: 0.8, d: 2.8, shape: 'star4' }))
def('b40', tilt(84, 22, -22, '#ff9a3a', 9, 6, 0, '', 0.5) + tilt(78, 17, -22, '#ffd89a', 2.4, 9, 1, '5 7') + tilt(72, 28, 28, '#a58bff', 5, 8, 1, '', 0.45) + tilt(60, 60, 0, '#ff9a3a', 2, 14, 0, '30 20', 0.6) + glow('#2a0a55', 53, 0.5), tilt(84, 22, -22, '#ffe6b8', 2, 5, 0, '12 400', 1) + (() => { let t = ''; for (let i = 0; i < 14; i++) { const [x, y] = pol(i * 25.7, 64); t += `<g transform="translate(${x} ${y})">${G('a-suck', 3 + rnd(i) * 2, -rnd(i + 4) * 4, `<circle r="${n1(0.9 + rnd(i) * 1.2)}" fill="${i % 3 ? '#ffd89a' : '#c6a8ff'}"/>`, `transform-origin:${C - x}px ${C - y}px`)}</g>` } return t })() + ring(50.8, '#000', 2.2, { op: 0.7 }))
def('b41', glow('#7cff9a', 54, 0.22) + (() => { let t = ''; const br = [[-150, 30], [-120, 36], [-90, 40], [-60, 36], [-30, 30], [-170, 22], [-10, 22]]; br.forEach(([a, L], i) => { const [x0, y0] = pol(a, 48), [x1, y1] = pol(a + (a < -90 ? -12 : 12), 48 + L), [cx, cy] = pol(a + (a < -90 ? 8 : -8), 48 + L * 0.5); t += `<path class="a-grow" pathLength="1" d="M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}" fill="none" stroke="${i % 2 ? '#8a5a2a' : '#a8743a'}" stroke-width="3.2" stroke-linecap="round" ${sty(7, -i * 0.5)}/>`; t += G('a-tw', 2.6, -i * 0.4, `<circle cx="${x1}" cy="${y1}" r="3.2" fill="#8dff9a"/><circle cx="${x1}" cy="${y1}" r="1.4" fill="#fff"/>`) }); [[70, 28], [95, 26], [120, 30], [50, 22], [140, 22]].forEach(([a, L], i) => { const [x0, y0] = pol(a, 48), [x1, y1] = pol(a + (a < 90 ? 14 : -14), 48 + L); t += `<path class="a-grow" pathLength="1" d="M${x0} ${y0}Q${n1((x0 + x1) / 2 + (a < 90 ? 5 : -5))} ${n1((y0 + y1) / 2)} ${x1} ${y1}" fill="none" stroke="#6a4a24" stroke-width="2.6" stroke-linecap="round" ${sty(8, -i * 0.7)}/>` }); return t })(), orbit(16, 56, 'leaf', { cols: ['#3fe07a', '#9dff8a'], c2: '#145a00', s: 0.7, d: 0, off: -140, an: 'a-breathe2' }) + sparks(10, { c: '#c6ffb0', r0: 54, r1: 70, h: 26, s: 0.6, d: 3 }))
def('b42', glow('#4a2bd8', 56, 0.35) + serpent({ n: 20, r: 62, c: '#5a8bff', c2: '#c6a8ff', d: 11, wob: 4, step: 6.5, head: '#e8ecff', eye: '#ff3b6b', horn: '#ffd05a' }) + tilt(66, 66, 0, '#7a5bff', 1, 40, 1, '2 6', 0.7), stars(16, { cols: ['#fff', '#cdb6ff', '#9fe6ff'], r0: 54, r1: 72, s: 0.8, d: 2.6, seed: 17 }) + ring(51, '#8a6bff', 1.2))
def('b43', tilt(66, 24, 0, '#ff6bd0', 2.4, 7, 0, '', 0.9) + tilt(66, 24, 60, '#6bd0ff', 2.4, 10, 1, '', 0.9) + tilt(66, 24, 120, '#ffe96b', 2.4, 13, 0, '', 0.9) + tilt(58, 58, 0, '#b36bff', 1.4, 18, 1, '4 6', 0.8), tilt(66, 24, 0, '#fff', 3, 7, 0, '1 400') + tilt(66, 24, 60, '#fff', 3, 10, 1, '1 400') + tilt(66, 24, 120, '#fff', 3, 13, 0, '1 400') + ring(51, '#fff', 1, { op: 0.7 }))
def('b44', glow('#3a0f6a', 55, 0.6) + (() => { let t = ''; for (let i = 0; i < 9; i++) { const a = -170 + i * 20, [x0, y0] = pol(a, 49), [x1, y1] = pol(a + (i % 2 ? 7 : -7), 66 + (i % 3) * 4); t += G('a-flick2', 2.4 + (i % 3) * 0.7, -i * 0.4, `<path d="M${x0} ${y0}Q${n1((x0 + x1) / 2 + 6)} ${n1((y0 + y1) / 2)} ${x1} ${y1}" fill="none" stroke="#2a0f4a" stroke-width="${3 + (i % 3)}" stroke-linecap="round"/>`) } return t })(), crown('#0e0816', '#a58bff', { n: 5, h: 17, span: 70, gem: '#c79bff', base: 49 }) + sparks(10, { cols: ['#6a2bd8', '#a58bff'], r0: 50, r1: 66, h: 30, s: 0.7, d: 2.8 }) + ring(51, '#a58bff', 1.2, { op: 0.8 }))
def('b45', glow('#19e6ff', 54, 0.2) + gear(60, 14, { c: '#c4cde6', c2: '#6d7898', d: 50, tw: 4, th: 4 }) + gear(66, 10, { c: '#7a86a8', c2: '#3a4466', d: 40, rev: 1, tw: 3.4, th: 3 }), (() => { let t = ''; for (let i = 0; i < 4; i++) { const a = -45 + i * 90, [x, y] = pol(a, 55); t += `<g transform="translate(${x} ${y}) rotate(${a + 90}) scale(1.5)"><path d="M-7 -4h14l3 4-3 8h-14l-3-8z" fill="#2a3350" stroke="#c4cde6" stroke-width="1.2"/>${G('a-pulse', 2.2, -i * 0.5, `<rect x="-3.5" y="-1.2" width="7" height="2.4" rx="1.2" fill="#19e6ff"/>`)}</g>` } return t })() + ring(51, '#c4cde6', 1.6) + orbit(8, 51, 'dot', { c: '#19e6ff', s: 0.55, d: 0, off: -20, an: 'a-pulse', ad: 2 }))

def('b46', glow('#ff4be0', 56, 0.35) + (() => { let t = ''; for (let i = 0; i < 9; i++) { const a = i * 40 + rnd(i) * 20, [x, y] = pol(a, 58 + rnd(i + 2) * 12), sz = 5 + rnd(i + 5) * 6; t += `<g transform="translate(${x} ${y}) rotate(${n1(rnd(i + 7) * 360)})">${G('a-fl', 3 + rnd(i) * 3, -i, `<polygon points="0,${-sz} ${sz * 0.7},${sz * 0.4} ${-sz * 0.5},${sz * 0.7}" fill="${['#ff4be0', '#4bd0ff', '#fff', '#ffe34b'][i % 4]}" fill-opacity=".25" stroke="${['#ff4be0', '#4bd0ff', '#fff', '#ffe34b'][i % 4]}" stroke-width="1.2"/>`)}</g>` } return t })(), (() => { let t = ''; for (let i = 0; i < 6; i++) { const a = i * 60 + 12, [x0, y0] = pol(a, 51), [x1, y1] = pol(a + 8, 60), [x2, y2] = pol(a - 4, 68); t += G('a-flick', 3 + i * 0.4, -i * 0.6, `<polyline points="${x0},${y0} ${x1},${y1} ${x2},${y2}" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>`) } return t })() + ring(51, '#ff4be0', 1.2, { dash: '8 3', an: 'a-glitch', d: 2.4 }) + sparks(8, { cols: ['#4bd0ff', '#ff4be0', '#fff'], r0: 54, r1: 70, h: 20, s: 0.7, d: 2.4, shape: 'sq' }))
def('b47', glow('#4a2bd8', 58, 0.5, 6) + arcs([{ r: 56, a0: 0, a1: 140, c: '#7a5bff', d: 12, w: 6, op: 0.6 }, { r: 61, a0: 160, a1: 300, c: '#ff6bd0', d: 16, rev: 1, w: 6, op: 0.55 }, { r: 66, a0: 40, a1: 190, c: '#4bd0ff', d: 22, w: 5, op: 0.5 }, { r: 58, a0: 200, a1: 350, c: '#fff', d: 8, rev: 1, w: 1.4 }]) + stars(22, { cols: ['#fff', '#cdb6ff', '#9fe6ff', '#ffd6f0'], r0: 53, r1: 74, s: 1, d: 2.8, seed: 51 }), orbit(2, 64, 'orb', { c: '#ffb36b', c2: '#fff', s: 1.4, d: 18 }) + orbit(1, 70, 'orb', { c: '#6bd0ff', c2: '#fff', s: 1.1, d: 26, rev: 1, off: 20 }) + ring(51, '#c6a8ff', 1.2) + tilt(70, 18, 25, '#fff', 0.8, 20, 0, '2 6', 0.6))
def('b48', glow('#19e6ff', 54, 0.25) + serpent({ n: 24, r: 61, c: '#19e6ff', c2: '#b36bff', d: 8, wob: 5, step: 5.2, head: '#ffffff', eye: '#ffe34b', horn: '#b36bff' }) + serpent({ n: 12, r: 67, c: '#ff6bd0', c2: '#fff', d: 13, wob: 3, step: 6, head: '#ffd6f0', eye: '#fff' }).replace('a-spin"', 'a-spinr"'), sparks(14, { cols: ['#19e6ff', '#b36bff', '#fff'], r0: 52, r1: 72, h: 24, s: 0.6, d: 2.2, shape: 'sq' }) + ring(51, '#19e6ff', 1.2, { dash: '1 3', an: 'a-glitch', d: 1.8 }))
def('b49', glow('#8a6bff', 56, 0.4) + wings({ n: 8, len: 50, w: 6.5, c1: '#9fe6ff', c2: '#e0c6ff', rx: 38, ry: -8, a0: -84, a1: 24, d: 4.6, op: 0.4, line: '#fff' }) + tilt(68, 68, 0, '#c6a8ff', 1, 36, 0, '2 5', 0.8), crown('#ffe9a0', '#7a5bff', { n: 5, h: 14, span: 68, gem: '#ff6bd0', star: 1 }) + orbit(14, 66, RUNES, { c: '#c6a8ff', s: 0.75, d: 50, rev: 1 }) + stars(12, { cols: ['#fff', '#ffd6f0', '#9fe6ff'], r0: 56, r1: 74, s: 0.8, d: 2.4, seed: 61, a0: 90, a1: 450 }) + ring(51, '#ffe9a0', 1.2))
def('b50', glow('#ffffff', 52, 0.55, 2.4) + glow('#ff9a3a', 56, 0.35, 3) + tilt(70, 14, -18, '#ffe6b8', 4, 4, 0, '', 0.75) + tilt(70, 14, 28, '#b36bff', 3, 5, 1, '', 0.65) + (() => { let t = ''; for (let i = 0; i < 16; i++) { const [x, y] = pol(i * 22.5, 70); t += `<g transform="translate(${x} ${y})">${G('a-suck', 2.6 + rnd(i) * 2, -rnd(i + 8) * 3, SH[['sq', 'diamond', 'dot', 'star4'][i % 4]](['#fff', '#6bd0ff', '#ff6bd0', '#ffe34b'][i % 4]), `transform-origin:${n1(C - x)}px ${n1(C - y)}px`)}</g>` } return t })(), crown('#16101f', '#ffe6b8', { n: 7, h: 16, span: 84, gem: '#fff', base: 49 }) + bolts(8, { c: '#ffe6b8', c2: '#fff', r0: 51, r1: 74, d: 1.6, seed: 33 }) + tilt(70, 14, -18, '#fff', 1.4, 4, 0, '10 400') + ring(50.8, '#fff', 1.6) + stars(10, { c: '#fff', r0: 58, r1: 74, s: 0.9, d: 2, seed: 70 }))

export const BORDER_IDS = Object.keys(D)
const cache = {}
export function borderArt(id) {
  const d = D[id]
  if (!d) return null
  return cache[id] || (cache[id] = { b: { __html: d.b }, f: { __html: d.f } })
}

export { IMG_SCALE }
const IMG = new Map()
export function registerBorderImages(list) {
  for (const b of list || []) if (b && /^u[0-9]{1,9}$/.test(b.id || '') && typeof b.image_url === 'string' && BORDER_URL_RE.test(b.image_url)) IMG.set(b.id, b.image_url)
}
export const borderImg = (id) => IMG.get(id) || null
