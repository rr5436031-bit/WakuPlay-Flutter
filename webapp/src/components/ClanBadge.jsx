import { memo, useEffect, useId, useState } from 'react'
import { useClanBadge } from '../lib/clanbadge'
import { layoutBadge, clampTier } from '../lib/clanbadgeGeom'

const METAL = {
  2: { stops: ['#e0a070', '#a8602c'], t: '#ffd2ae', fill: '#2a1a12' },
  3: { stops: ['#f1f4fa', '#8b95a8'], t: '#eef2fa', fill: '#1b2130' },
  4: { stops: ['#ffe27a', '#c98a0a'], t: '#ffeaa0', fill: '#241a08' },
  5: { stops: ['#fff0a0', '#d99a10'], t: '#fff4c2', fill: '#1c1033' },
  6: { stops: ['#a8ffd0', '#12b87a', '#0a7a56'], t: '#d8ffe9', fill: '#06201a' },
  7: { stops: ['#f2fdff', '#5fd6f5', '#2a8fd0'], t: '#e6fbff', fill: '#071c2e' },
  8: { stops: ['#ffe9a0', '#ff9a2f', '#e0431a'], t: '#fff0c8', fill: '#2a0e06' },
  9: { stops: ['#ffd27a', '#e0243f', '#7a0a22'], t: '#ffd9de', fill: '#1a060d' },
  10: { stops: ['#7ff0ff', '#b48cff', '#ff8fd8', '#ffe27a'], t: '#ffffff', fill: '#110a2e' },
  11: { stops: ['#a8f6ff', '#6a7bff', '#c36bff', '#ff8fe0'], t: '#f2fbff', fill: '#0b0830' },
  12: { stops: ['#fff3a0', '#ff9a1f', '#ff2d2d', '#8a0a3a'], t: '#fff2d0', fill: '#1c0508' },
  13: { stops: ['#ffffff', '#ffd86b', '#c98a0a', '#7a4a00'], t: '#fff6d6', fill: '#14100a' },
  14: { stops: ['#ffffff', '#fff1b0', '#9ff0ff', '#d0b0ff'], t: '#ffffff', fill: '#0a0f2a' },
  15: { stops: ['#ff6b6b', '#ffd93d', '#6bff8f', '#4dd6ff', '#b48cff', '#ff6bd6'], t: '#ffffff', fill: '#0c0620' },
  16: { stops: ['#f6ffc4', '#b7e34a', '#5fa512', '#2f5e0a'], t: '#f4ffd0', fill: '#0e1a06' },
  17: { stops: ['#c4ff7a', '#3ef0b0', '#35c4ff', '#a06bff'], t: '#eafff6', fill: '#031a1c' },
  18: { stops: ['#f0f6ff', '#9db4d8', '#5a78a8', '#2b3f63'], t: '#e6f3ff', fill: '#0a1019' },
  19: { stops: ['#ffd9ec', '#ff6fb1', '#d01f6a', '#7a0f3e'], t: '#ffe3f1', fill: '#1d0613' },
  20: { stops: ['#ffffff', '#ffe6a8', '#ffb3e6', '#a9b6ff', '#9ff0ff'], t: '#ffffff', fill: '#080512' },
}
const wingFeathers = (n, len) => Array.from({ length: n }, (_, i) => {
  const h = 16 / n, y1 = 6 + i * h
  return [[3, y1], [3, y1 + h + 2], [-(len - i * 1.8), -4 + i * (24 / Math.max(1, n - 1))]]
})
const flame = (x, b, h, w) => `M${x - w} ${b} C${x - w} ${b - h * 0.4} ${x - w * 0.2} ${b - h * 0.6} ${x} ${b - h} C${x + w * 0.2} ${b - h * 0.6} ${x + w} ${b - h * 0.4} ${x + w} ${b}Z`
const lum = (hex) => { const n = parseInt(String(hex).slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 }
const P = (arr, dy = 0) => arr.map(([x, y]) => `${x},${y + dy}`).join(' ')
const sparkle = (x, y, r) => `M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z`

const LAUREL = (() => {
  const P0 = [2, 24], P1 = [-9, 15], P2 = [-1, 3], out = []
  for (const k of [0.1, 0.28, 0.46, 0.64, 0.82]) {
    const x = (1 - k) ** 2 * P0[0] + 2 * (1 - k) * k * P1[0] + k * k * P2[0]
    const y = (1 - k) ** 2 * P0[1] + 2 * (1 - k) * k * P1[1] + k * k * P2[1]
    const tx = 2 * (1 - k) * (P1[0] - P0[0]) + 2 * k * (P2[0] - P1[0]), ty = 2 * (1 - k) * (P1[1] - P0[1]) + 2 * k * (P2[1] - P1[1])
    const l = Math.hypot(tx, ty), ang = (Math.atan2(ty, tx) * 180) / Math.PI
    for (const sd of [-1, 1]) out.push({ x: x - (ty / l) * sd * 2.3, y: y + (tx / l) * sd * 2.3, a: ang + sd * 36 })
  }
  return out
})()

const EH = 18
const ratios = new Map()
function useRatio(url) {
  const [r, setR] = useState(() => (url && ratios.get(url)) || 1)
  useEffect(() => {
    if (!url) return
    if (ratios.has(url)) { setR(ratios.get(url)); return }
    let live = true
    const im = new Image()
    im.onload = () => { const v = im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1; ratios.set(url, v); if (live) setR(v) }
    im.src = url
    return () => { live = false }
  }, [url])
  return r
}

function ClanBadge({ tag, tier = 1, color = null, size = 22, emblem = null }) {
  const id = useId().replace(/:/g, '')
  const t = clampTier(tier)
  const emb = typeof emblem === 'string' && emblem ? emblem : null
  const ratio = useRatio(emb)
  const L = layoutBadge(t, tag, ratio, !!emb)
  const { W, ex, dy, H, cy, cx, bw, embH, embX, icon, tx, fs, sp, body, inner, stroke } = L
  const m = METAL[t] || METAL[2]
  const sz = Number(size) > 0 ? Number(size) : 22
  const stops = color ? [color.c1, color.c2, color.c3].filter(Boolean) : t === 1 ? ['#ffffff', '#dfe3ea'] : m.stops
  if (!stops.length) stops.push('#ffffff')
  const grad = (gid, rev) => (
    <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
      {(rev ? [...stops].reverse() : stops).map((c, i, a) => <stop key={i} offset={a.length === 1 ? 0 : i / (a.length - 1)} stopColor={c} />)}
    </linearGradient>
  )
  const G = `url(#g${id})`
  const fillDark = t === 1 && color ? lum(color.c1) < 0.45 : false
  const textFill = t === 1 ? (fillDark ? '#fff' : '#10131a') : color ? `url(#t${id})` : m.t
  const mirror = (pts) => pts.map(([x, y]) => [W - x, y])
  const cls = `cb cb-t${t} ${color ? 'cb-r-' + color.rarity : ''}`
  const glow = color ? stops[Math.min(1, stops.length - 1)] : t >= 4 ? stops[Math.min(1, stops.length - 1)] : null
  const nT = Math.max(2, Math.round((W - 20) / 9) + 1)
  const teeth = Array.from({ length: nT }, (_, i) => 10 + (i * (W - 20)) / (nT - 1))
  const wings = [[[3, 7], [3, 12], [-14, -2]], [[3, 12], [3, 17], [-15, 8]], [[3, 17], [3, 22], [-11, 17]]]
  const spikes = [[[2, 8], [-9, 14], [2, 20]]]
  const shine = color?.rarity === 'mythic' || t >= 8
  const haloA = !glow ? 0 : color ? ({ rare: 0.16, legend: 0.22, mythic: 0.3 }[color.rarity] || 0) : t >= 15 ? 0.24 : t >= 11 ? 0.2 : 0.16

  return (
    <svg className={cls} width={((W + ex * 2) * sz) / 28} height={(H * sz) / 28} viewBox={`0 0 ${W + ex * 2} ${H}`} role="img" aria-label={`Clan ${tag}`}
      style={glow && (t >= 4 || color?.rarity === 'legend' || color?.rarity === 'mythic') ? { '--cbg': glow } : undefined}>
      <defs>
        {grad(`g${id}`)}
        {grad(`t${id}`, true)}
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".75" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <clipPath id={`c${id}`}><polygon points={P(body, dy)} /></clipPath>
        {haloA > 0 && <radialGradient id={`h${id}`}><stop offset="0" stopColor={glow} stopOpacity={haloA} /><stop offset=".62" stopColor={glow} stopOpacity={haloA * 0.8} /><stop offset="1" stopColor={glow} stopOpacity="0" /></radialGradient>}
      </defs>
      <g transform={`translate(${ex},0)`}>
        {haloA > 0 && <ellipse className="cb-halo" cx={cx} cy={cy} rx={W / 2 + 6} ry={Math.min(cy, H - cy, 17)} fill={`url(#h${id})`} />}

        {t === 5 && <polygon points={P([[cx - 10, 9], [cx - 10, 2], [cx - 5, 6], [cx, 0], [cx + 5, 6], [cx + 10, 2], [cx + 10, 9]])} fill={G} />}
        {t === 8 && <>
          {wings.map((w, i) => <polygon key={'l' + i} points={P(w, dy)} fill={G} stroke="rgba(0,0,0,.35)" strokeWidth=".6" strokeLinejoin="round" />)}
          {wings.map((w, i) => <polygon key={'r' + i} points={P(mirror(w), dy)} fill={G} stroke="rgba(0,0,0,.35)" strokeWidth=".6" strokeLinejoin="round" />)}
          <path d={`M${cx - 5} ${dy + 3} C${cx - 6} ${dy - 2} ${cx - 1} ${dy - 3} ${cx} ${dy - 8} C${cx + 1} ${dy - 3} ${cx + 6} ${dy - 2} ${cx + 5} ${dy + 3}Z`} fill={G} />
        </>}
        {t === 9 && <>
          <path d={`M6 ${dy + 3} Q4 ${dy - 3} -1 ${dy - 8} Q11 ${dy - 6} 15 ${dy + 3}Z`} fill={G} />
          <path d={`M${W - 6} ${dy + 3} Q${W - 4} ${dy - 3} ${W + 1} ${dy - 8} Q${W - 11} ${dy - 6} ${W - 15} ${dy + 3}Z`} fill={G} />
          <polygon points={P([[cx - 4, 3], [cx, -4], [cx + 4, 3]], dy)} fill={G} />
          <polygon points={P(spikes[0], dy)} fill={G} stroke="rgba(0,0,0,.35)" strokeWidth=".6" strokeLinejoin="round" />
          <polygon points={P(mirror(spikes[0]), dy)} fill={G} stroke="rgba(0,0,0,.35)" strokeWidth=".6" strokeLinejoin="round" />
        </>}
        {t === 10 && <ellipse cx={cx} cy={cy} rx={W / 2 + 9} ry="10" transform={`rotate(-10 ${cx} ${cy})`} fill="none" stroke={G} strokeWidth="1.4" opacity=".55" />}

        {t === 11 && <>
          <ellipse cx={cx} cy={cy} rx={W / 2 + 10} ry="8" transform={`rotate(-8 ${cx} ${cy})`} fill="none" stroke={G} strokeWidth="1.2" opacity=".5" />
          <ellipse cx={cx} cy={cy} rx={W / 2 + 10} ry="8" transform={`rotate(8 ${cx} ${cy})`} fill="none" stroke={G} strokeWidth="1.2" opacity=".5" />
        </>}
        {t === 12 && <>
          <path d={`M3 ${dy + 8} Q-8 ${dy + 4} -10 ${dy - 4} Q-2 ${dy + 2} 4 ${dy + 14}Z`} fill={G} />
          <path d={`M${W - 3} ${dy + 8} Q${W + 8} ${dy + 4} ${W + 10} ${dy - 4} Q${W + 2} ${dy + 2} ${W - 4} ${dy + 14}Z`} fill={G} />
          {[[-17, 9], [-8.5, 13], [0, 17], [8.5, 13], [17, 9]].map(([o, h], i) => <path key={'f' + i} d={flame(cx + o, dy + 5, h, 5.4)} fill={G} />)}
          {[[-8.5, 7], [0, 10], [8.5, 7]].map(([o, h], i) => <path key={'g' + i} d={flame(cx + o, dy + 5, h, 2.8)} fill="#fff3a0" opacity=".85" />)}
        </>}
        {t === 13 && <>
          {wingFeathers(5, 20).map((w, i) => <polygon key={'l' + i} points={P(w, dy)} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".6" strokeLinejoin="round" />)}
          {wingFeathers(5, 20).map((w, i) => <polygon key={'r' + i} points={P(mirror(w), dy)} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".6" strokeLinejoin="round" />)}
          <path d={`M6 ${dy + 3} Q4 ${dy - 3} -1 ${dy - 8} Q11 ${dy - 6} 15 ${dy + 3}Z`} fill={G} />
          <path d={`M${W - 6} ${dy + 3} Q${W - 4} ${dy - 3} ${W + 1} ${dy - 8} Q${W - 11} ${dy - 6} ${W - 15} ${dy + 3}Z`} fill={G} />
          <polygon points={P([[cx - 5, 3], [cx, -11], [cx + 5, 3]], dy)} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".6" strokeLinejoin="round" />
          <polygon points={P([[cx - 14, 3], [cx - 9, -5], [cx - 5, 3]], dy)} fill={G} /><polygon points={P([[cx + 14, 3], [cx + 9, -5], [cx + 5, 3]], dy)} fill={G} />
        </>}
        {t === 14 && <>
          {[-50, -25, 0, 25, 50].map((a) => <line key={a} x1={cx} y1={dy + 3} x2={cx + Math.sin((a * Math.PI) / 180) * 17} y2={dy + 3 - Math.cos((a * Math.PI) / 180) * 17} stroke={G} strokeWidth="1.4" strokeLinecap="round" opacity=".55" />)}
          {wingFeathers(6, 24).map((w, i) => <polygon key={'l' + i} points={P(w, dy)} fill={G} stroke="rgba(255,255,255,.35)" strokeWidth=".5" strokeLinejoin="round" />)}
          {wingFeathers(6, 24).map((w, i) => <polygon key={'r' + i} points={P(mirror(w), dy)} fill={G} stroke="rgba(255,255,255,.35)" strokeWidth=".5" strokeLinejoin="round" />)}
        </>}
        {t === 15 && <>
          <polygon points={Array.from({ length: 24 }, (_, k) => { const a = (k * 15 * Math.PI) / 180, o = k % 2 === 0; return `${cx + Math.cos(a) * (o ? W / 2 + 14 : W / 2 + 4)},${cy + Math.sin(a) * (o ? 20 : 14)}` }).join(' ')} fill={G} opacity=".35" />
          <ellipse cx={cx} cy={cy} rx={W / 2 + 10} ry="9" transform={`rotate(-10 ${cx} ${cy})`} fill="none" stroke={G} strokeWidth="1.3" opacity=".6" />
          <ellipse cx={cx} cy={cy} rx={W / 2 + 10} ry="9" transform={`rotate(10 ${cx} ${cy})`} fill="none" stroke={G} strokeWidth="1.3" opacity=".6" />
          {wingFeathers(6, 26).map((w, i) => <polygon key={'l' + i} points={P(w, dy)} fill={G} stroke="rgba(255,255,255,.4)" strokeWidth=".5" strokeLinejoin="round" />)}
          {wingFeathers(6, 26).map((w, i) => <polygon key={'r' + i} points={P(mirror(w), dy)} fill={G} stroke="rgba(255,255,255,.4)" strokeWidth=".5" strokeLinejoin="round" />)}
          {[[-18, 6], [-9, 9], [0, 13], [9, 9], [18, 6]].map(([o, h], i) => <polygon key={'c' + i} points={`${cx + o - 4},${dy + 4} ${cx + o},${dy + 4 - h} ${cx + o + 4},${dy + 4}`} fill={G} stroke="rgba(0,0,0,.35)" strokeWidth=".5" strokeLinejoin="round" />)}
        </>}

        {t === 16 && [0, 1].map((sd) => (
          <g key={sd} transform={sd ? `translate(${W},0) scale(-1,1)` : undefined}>
            <path d={`M2 ${dy + 24} Q-9 ${dy + 15} -1 ${dy + 3}`} fill="none" stroke={G} strokeWidth="1.2" strokeLinecap="round" />
            {LAUREL.map((l, i) => <ellipse key={i} cx={l.x} cy={dy + l.y} rx="3.9" ry="1.7" transform={`rotate(${l.a.toFixed(1)} ${l.x.toFixed(2)} ${(dy + l.y).toFixed(2)})`} fill={G} stroke="rgba(0,0,0,.3)" strokeWidth=".4" />)}
          </g>
        ))}
        {t === 17 && <>
          <path d={`M4 ${dy + 4} Q${cx} ${dy - 8} ${W - 4} ${dy + 4}`} fill="none" stroke={G} strokeWidth="1.7" strokeLinecap="round" opacity=".75" />
          <path d={`M11 ${dy + 5} Q${cx} ${dy - 3} ${W - 11} ${dy + 5}`} fill="none" stroke={G} strokeWidth="1" strokeLinecap="round" opacity=".5" />
          <path d={`M4 ${dy + 24} Q${cx} ${dy + 36} ${W - 4} ${dy + 24}`} fill="none" stroke={G} strokeWidth="1.7" strokeLinecap="round" opacity=".75" />
        </>}
        {t === 18 && <>
          {teeth.map((x, i) => <g key={i}>
            <polygon points={P([[x - 3, 3.5], [x - 1.8, -0.4], [x + 1.8, -0.4], [x + 3, 3.5]], dy)} fill={G} stroke="rgba(0,0,0,.35)" strokeWidth=".5" strokeLinejoin="round" />
            <polygon points={P([[x - 3, 24.5], [x - 1.8, 28.4], [x + 1.8, 28.4], [x + 3, 24.5]], dy)} fill={G} stroke="rgba(0,0,0,.35)" strokeWidth=".5" strokeLinejoin="round" />
          </g>)}
          {[0, 1].map((sd) => <g key={sd} transform={sd ? `translate(${W},0) scale(-1,1)` : undefined}>
            <rect x="-7" y={cy - 5.5} width="10" height="11" rx="2.4" fill={m.fill} stroke={G} strokeWidth="1.6" /><circle cx="-2.4" cy={cy} r="1.9" fill={G} />
          </g>)}
        </>}
        {t === 19 && <>
          <polygon points={P([[W - 9, 3], [W + 8, -5], [W - 1, 12]], dy)} fill={G} stroke="rgba(0,0,0,.35)" strokeWidth=".6" strokeLinejoin="round" />
          <polygon points={P([[W - 15, 3], [W - 3, -2.5], [W - 8, 6]], dy)} fill={G} opacity=".8" />
          <polygon points={P([[9, 25], [-8, 33], [1, 16]], dy)} fill={G} stroke="rgba(0,0,0,.35)" strokeWidth=".6" strokeLinejoin="round" />
          <polygon points={P([[15, 25], [3, 30.5], [8, 22]], dy)} fill={G} opacity=".8" />
        </>}
        {t === 20 && <>
          <ellipse className="cb-pulse" cx={cx} cy={cy} rx={W / 2 + 6} ry="15.5" fill="none" stroke={G} strokeWidth="1" opacity=".55" />
          {[0, W].map((x, i) => <g key={i}>
            <polygon points={`${x - 15},${cy} ${x},${cy - 1.8} ${x + 15},${cy} ${x},${cy + 1.8}`} fill={G} opacity=".8" />
            <polygon points={`${x},${cy - 9} ${x + 1.6},${cy} ${x},${cy + 9} ${x - 1.6},${cy}`} fill={G} opacity=".6" />
          </g>)}
        </>}

        {t === 1 && <polygon points={P(body, dy)} fill={G} stroke="rgba(0,0,0,.25)" strokeWidth="1" />}
        {t === 2 && <>
          <polygon points={P(body, dy)} fill={m.fill} stroke={G} strokeWidth="2.4" strokeLinejoin="round" />
          <circle cx="5" cy={cy} r="1.4" fill={G} /><circle cx={W - 5} cy={cy} r="1.4" fill={G} />
        </>}
        {t >= 3 && <>
          <polygon points={P(body, dy)} fill={m.fill} stroke={G} strokeWidth={stroke} strokeLinejoin="round" />
          {inner && <polygon points={P(inner, dy)} fill="none" stroke={t === 18 && !color ? '#47f0ff' : G} strokeWidth=".8" strokeDasharray={t === 18 ? '3 2' : undefined} opacity={t === 18 ? 0.85 : 0.55} />}
        </>}

        {t === 6 && <>
          <polygon points={`${-8},${cy} ${-2},${cy - 6} ${4},${cy} ${-2},${cy + 6}`} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".7" />
          <polygon points={`${W - 4},${cy} ${W + 2},${cy - 6} ${W + 8},${cy} ${W + 2},${cy + 6}`} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".7" />
          <polygon points={`${cx - 4},${dy + 3} ${cx},${dy - 1} ${cx + 4},${dy + 3} ${cx},${dy + 7}`} fill={G} opacity=".9" />
        </>}
        {t === 7 && <>
          <polygon points={P([[8, 3], [W - 8, 3], [W - 14, 10], [14, 10]], dy)} fill="#fff" opacity=".16" />
          <polygon points={P([[0, 14], [8, 3], [14, 10], [14, 18], [8, 25]], dy)} fill="#fff" opacity=".08" />
          <polygon points={P([[8, 25], [W - 8, 25], [W - 14, 18], [14, 18]], dy)} fill="#000" opacity=".28" />
          <polyline points={P([[8, 3], [14, 10], [14, 18], [8, 25]], dy)} fill="none" stroke={G} strokeWidth=".8" opacity=".7" />
          <polyline points={P([[W - 8, 3], [W - 14, 10], [W - 14, 18], [W - 8, 25]], dy)} fill="none" stroke={G} strokeWidth=".8" opacity=".7" />
          <path d={sparkle(W + 3, dy + 3, 5)} fill="#fff" /><path d={sparkle(-4, dy + 24, 3.4)} fill="#fff" opacity=".9" />
        </>}
        {t === 9 && <>
          <polygon points={P([[cx - 14, 11], [cx - 6, 9], [cx - 8, 12]], dy)} fill={G} opacity=".8" />
          <polygon points={P([[cx + 14, 11], [cx + 6, 9], [cx + 8, 12]], dy)} fill={G} opacity=".8" />
        </>}
        {t === 10 && <>
          <ellipse cx={cx} cy={dy - 5} rx={Math.min(cx * 0.55, 22)} ry="3.4" fill="none" stroke={G} strokeWidth="2" />
          <path d={`M${cx - (W / 2 + 9)} ${cy} A${W / 2 + 9} 10 0 0 0 ${cx + (W / 2 + 9)} ${cy}`} transform={`rotate(-10 ${cx} ${cy})`} fill="none" stroke={G} strokeWidth="1.4" opacity=".75" />
          <path d={sparkle(-5, dy + 2, 4.6)} fill="#fff" /><path d={sparkle(W + 5, dy + 24, 4)} fill="#fff" /><circle cx={W + 6} cy={dy + 5} r="1" fill="#fff" /><circle cx="-6" cy={dy + 20} r="1" fill="#fff" />
        </>}

        {t === 11 && <>
          <ellipse cx={cx} cy={dy - 4} rx={Math.min(cx * 0.5, 20)} ry="3" fill="none" stroke={G} strokeWidth="1.8" />
          <polygon points={`-7,${cy} -2,${cy - 5} 3,${cy} -2,${cy + 5}`} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".6" />
          <polygon points={`${W - 3},${cy} ${W + 2},${cy - 5} ${W + 7},${cy} ${W + 2},${cy + 5}`} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".6" />
          <path d={sparkle(-6, dy + 2, 4.4)} fill="#fff" /><path d={sparkle(W + 6, dy + 25, 4)} fill="#fff" /><circle cx={W + 7} cy={dy + 4} r="1" fill="#fff" /><circle cx="-7" cy={dy + 21} r="1" fill="#fff" />
        </>}
        {t === 12 && <>
          <circle cx="5" cy={dy + 22} r="1.3" fill="#ffb347" /><circle cx={W - 5} cy={dy + 22} r="1.3" fill="#ffb347" /><circle cx={cx - 12} cy={dy + 24} r=".9" fill="#fff3a0" /><circle cx={cx + 12} cy={dy + 24} r=".9" fill="#fff3a0" />
        </>}
        {t === 13 && <>
          <circle cx="6" cy={dy + 6} r="1.3" fill={G} /><circle cx={W - 6} cy={dy + 6} r="1.3" fill={G} /><circle cx="6" cy={dy + 22} r="1.3" fill={G} /><circle cx={W - 6} cy={dy + 22} r="1.3" fill={G} />
          <circle cx={cx} cy={dy - 2} r="1.8" fill="#fff" />
        </>}
        {t === 14 && <>
          <ellipse cx={cx} cy={dy - 5} rx={Math.min(cx * 0.55, 22)} ry="3.4" fill="none" stroke={G} strokeWidth="2.2" />
          <ellipse cx={cx} cy={dy - 10} rx={Math.min(cx * 0.35, 14)} ry="2.4" fill="none" stroke={G} strokeWidth="1.4" opacity=".8" />
          <path d={sparkle(-8, dy + 4, 4.6)} fill="#fff" /><path d={sparkle(W + 8, dy + 22, 4.2)} fill="#fff" /><path d={sparkle(W + 10, dy + 2, 3)} fill="#fff" opacity=".9" />
        </>}
        {t === 15 && <>
          <ellipse cx={cx} cy={dy - 9} rx={Math.min(cx * 0.5, 22)} ry="3.4" fill="none" stroke={G} strokeWidth="2" />
          {[[-18, 6], [-9, 9], [0, 13], [9, 9], [18, 6]].map(([o, h], i) => <circle key={'j' + i} cx={cx + o} cy={dy + 4 - h - 1} r={i === 2 ? 2.4 : 1.8} fill="#fff" stroke={G} strokeWidth=".8" />)}
          <path d={`M${cx - (W / 2 + 10)} ${cy} A${W / 2 + 10} 9 0 0 0 ${cx + (W / 2 + 10)} ${cy}`} transform={`rotate(-10 ${cx} ${cy})`} fill="none" stroke={G} strokeWidth="1.6" opacity=".85" />
          <path d={sparkle(-12, dy + 2, 5.2)} fill="#fff" /><path d={sparkle(W + 12, dy + 26, 4.6)} fill="#fff" /><path d={sparkle(W + 14, dy + 4, 3.4)} fill="#fff" /><path d={sparkle(-14, dy + 22, 3.4)} fill="#fff" />
          <circle cx={W + 4} cy={dy - 1} r="1.1" fill="#fff" /><circle cx="-4" cy={dy + 31} r="1.1" fill="#fff" />
        </>}

        {t === 16 && <>
          <polygon points={`${cx - 4},${dy + 2} ${cx},${dy - 5} ${cx + 4},${dy + 2} ${cx},${dy + 7}`} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".6" strokeLinejoin="round" /><circle cx={cx} cy={dy} r="1.1" fill="#fff" />
        </>}
        {t === 17 && <>
          <path d={sparkle(W + 5, dy + 3, 4.4)} fill="#fff" /><path d={sparkle(-5, dy + 25, 3.4)} fill="#fff" opacity=".9" />
        </>}
        {t === 18 && [[5.5, 6.5], [W - 5.5, 6.5], [5.5, 21.5], [W - 5.5, 21.5]].map(([x, y], i) => <circle key={i} cx={x} cy={dy + y} r="1.1" fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".4" />)}
        {t === 19 && <>
          <polygon points={P([[W * 0.55 + 3, 3], [W * 0.55 + 8, 3], [W * 0.55 - 2, 25], [W * 0.55 - 7, 25]], dy)} fill="#fff" opacity=".12" />
          <ellipse cx="-2" cy={dy + 3} rx="3" ry="1.5" transform={`rotate(-35 -2 ${dy + 3})`} fill="#ff9ccb" /><ellipse cx={W + 2} cy={dy + 24} rx="3" ry="1.5" transform={`rotate(-35 ${W + 2} ${dy + 24})`} fill="#ff9ccb" />
        </>}
        {t === 20 && <>
          <polygon points={`${cx},${dy - 8} ${cx + 4.2},${dy - 3} ${cx},${dy + 2} ${cx - 4.2},${dy - 3}`} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".6" strokeLinejoin="round" />
          {[-11, 11].map((o) => <polygon key={o} points={`${cx + o},${dy - 4} ${cx + o + 2.8},${dy - 0.8} ${cx + o},${dy + 2.4} ${cx + o - 2.8},${dy - 0.8}`} fill={G} stroke="rgba(0,0,0,.4)" strokeWidth=".5" strokeLinejoin="round" />)}
          <path d={sparkle(-10, dy + 3, 4)} fill="#fff" /><path d={sparkle(W + 10, dy + 25, 4)} fill="#fff" /><circle cx={W + 11} cy={dy + 4} r="1" fill="#fff" /><circle cx="-11" cy={dy + 22} r="1" fill="#fff" />
        </>}

        {!emb && t === 2 && <path d={`M10 ${cy - 6} l5 2 v4 c0 3 -2.4 5 -5 6 c-2.6 -1 -5 -3 -5 -6 v-4 z`} fill="none" stroke={G} strokeWidth="1.5" transform="translate(1,0)" />}
        {!emb && t === 3 && <polygon points={`15,${cy - 6} 16.8,${cy - 1.6} 21.4,${cy - 1.4} 17.8,${cy + 1.4} 19,${cy + 6} 15,${cy + 3.2} 11,${cy + 6} 12.2,${cy + 1.4} 8.6,${cy - 1.4} 13.2,${cy - 1.6}`} fill={G} transform="translate(1,0)" />}
        {!emb && t >= 4 && t <= 6 && <polygon points={`15,${cy - 6} 21,${cy} 15,${cy + 6} 9,${cy}`} fill={G} transform={`translate(${t === 5 ? 3 : 1},0)`} />}

        {emb && <g clipPath={`url(#c${id})`}><image href={emb} x={embX} y={cy - embH / 2} width={bw} height={embH} preserveAspectRatio="xMidYMid meet" onError={(e) => { e.currentTarget.style.display = 'none' }} /></g>}


        <text x={tx} y={cy + 4.6} textAnchor="middle" fontSize={fs} fontWeight="800" letterSpacing={sp} fill={textFill} style={{ fontFamily: 'var(--font-head), system-ui, sans-serif' }}>{tag}</text>

        {shine && <g clipPath={`url(#c${id})`}><rect className="cb-shine" x="-14" y="0" width="12" height={H} fill={`url(#s${id})`} /></g>}
      </g>
    </svg>
  )
}

const ClanBadgeMemo = memo(ClanBadge)
export default ClanBadgeMemo

export function ClanTag({ uid, size = 20 }) {
  const b = useClanBadge(uid)
  if (!b) return null
  return <span className="cb-wrap"><ClanBadgeMemo tag={b.tag} tier={b.tier} color={b.color} emblem={b.emblem} size={size} /></span>
}

