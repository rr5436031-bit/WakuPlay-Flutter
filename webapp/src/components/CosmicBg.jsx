import { useEffect, useState } from 'react'

import { fxLow } from '../lib/perf'

let url = null
let started = false
const subs = new Set()

function paint() {
  const low = fxLow()
  const W = low ? 450 : 640, H = low ? 900 : 1280, s = W / 360
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

  const base = g.createLinearGradient(0, 0, 0, H)
  base.addColorStop(0, '#060a18'); base.addColorStop(0.5, '#070b1c'); base.addColorStop(1, '#04060d')
  g.fillStyle = base; g.fillRect(0, 0, W, H)

  const neb = (x, y, r, col) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  neb(W * 0.15, H * 0.38, W * 0.85, 'rgba(70,60,190,.34)')
  neb(W * 1.0, H * 0.68, W * 0.72, 'rgba(20,130,200,.22)')
  neb(W * 0.05, H * 1.0, W * 0.65, 'rgba(120,50,170,.26)')
  neb(W * 0.55, H * 0.2, W * 0.5, 'rgba(40,90,200,.12)')

  const cols = ['255,255,255', '190,210,255', '255,230,190', '170,225,255']
  for (let i = 0, N = low ? 90 : 170; i < N; i++) {
    const x = rnd() * W, y = rnd() * H, r = 0.35 + rnd() * rnd() * 1.5, a = 0.25 + rnd() * 0.7
    g.fillStyle = `rgba(${cols[Math.floor(rnd() * cols.length)]},${a.toFixed(2)})`
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill()
    if (r > 1.2) neb(x, y, r * 5, 'rgba(160,190,255,.18)')
  }

  const cx = 312 * s, cy = 78 * s
  neb(cx, cy, 170 * s, 'rgba(255,140,50,.26)')
  neb(cx, cy, 240 * s, 'rgba(100,70,255,.14)')
  const ring = (rOut, rIn, alpha, blur) => {
    g.save(); g.translate(cx, cy); g.rotate(-0.28); g.scale(1, 0.3)
    if (blur) g.filter = `blur(${blur}px)`
    let fill
    if (g.createConicGradient) {
      fill = g.createConicGradient(0.6, 0, 0)
      ;[['#ffb347', 0], ['#fff1c9', 0.18], ['#ff7a2f', 0.4], ['#6a4bff', 0.62], ['#1c1040', 0.8], ['#ffb347', 1]].forEach(([col, p]) => fill.addColorStop(p, col))
    } else { fill = g.createLinearGradient(-rOut, 0, rOut, 0); fill.addColorStop(0, '#ff7a2f'); fill.addColorStop(0.5, '#fff1c9'); fill.addColorStop(1, '#6a4bff') }
    g.globalAlpha = alpha; g.fillStyle = fill
    g.beginPath(); g.arc(0, 0, rOut, 0, 6.283); g.arc(0, 0, rIn, 0, 6.283, true); g.fill('evenodd')
    g.restore()
  }
  ring(128 * s, 50 * s, 0.5, 10)
  ring(112 * s, 52 * s, 0.95, 0)
  g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, 40 * s, 0, 6.283); g.fill()
  g.strokeStyle = 'rgba(255,205,140,.45)'; g.lineWidth = 1.2 * s; g.stroke()
  g.save(); g.beginPath(); g.rect(cx - 300 * s, cy + 2 * s, 600 * s, 300 * s); g.clip(); ring(112 * s, 52 * s, 0.95, 0); g.restore()
  g.save(); g.shadowColor = 'rgba(255,160,70,.9)'; g.shadowBlur = 14 * s
  const lg = g.createLinearGradient(cx - 60 * s, cy, cx + 60 * s, cy); lg.addColorStop(0, 'rgba(255,196,120,0)'); lg.addColorStop(0.5, 'rgba(255,214,150,.85)'); lg.addColorStop(1, 'rgba(255,196,120,0)')
  g.strokeStyle = lg; g.lineWidth = 2.6 * s; g.beginPath(); g.arc(cx, cy, 56 * s, 3.5, 5.92); g.stroke(); g.restore()
  return c
}

function build() {
  if (started) return
  started = true
  try {
    paint().toBlob((b) => {
      if (!b) return
      url = URL.createObjectURL(b)
      subs.forEach((f) => f())
    }, 'image/jpeg', 0.92)
  } catch { }
}
export function prewarmCosmic() {
  if (url || started) return
  const run = () => build()
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 2000)
}

const TW1 = Array.from({ length: 9 }, (_, i) => `${(i * 37 + 11) % 97}vw ${(i * 53 + 7) % 95}vh 0 0 rgba(255,255,255,.9)`).join(',')
const TW2 = Array.from({ length: 7 }, (_, i) => `${(i * 61 + 29) % 96}vw ${(i * 41 + 23) % 93}vh 0 0 rgba(190,215,255,.9)`).join(',')

export default function CosmicBg() {
  const [u, setU] = useState(url)
  useEffect(() => {
    if (url) { setU(url); return }
    const f = () => setU(url)
    subs.add(f); build()
    return () => subs.delete(f)
  }, [])
  return (
    <div className="cosmic" aria-hidden="true">
      <div className={`cs-img ${u ? 'on' : ''}`} style={u ? { backgroundImage: `url(${u})` } : undefined} />
      <i className="cs-tw a" style={{ boxShadow: TW1 }} />
      <i className="cs-tw b" style={{ boxShadow: TW2 }} />
      <i className="cs-pulse" />
    </div>
  )
}
