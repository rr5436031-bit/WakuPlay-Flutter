import { getSettings } from './settings'

const KEY = 'wp_fxauto'
const ORDER = ['full', 'lite', 'low']

export function isLowEnd() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}
export function isWeakDevice() {
  try {
    const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency
    return (mem != null && mem <= 4) || (cores != null && cores <= 6)
  } catch { return false }
}

let mode = 'auto'
let autoLevel = null

const startLevel = () => {
  if (isLowEnd()) return 'low'
  try { const v = localStorage.getItem(KEY); if (ORDER.includes(v)) return v } catch { }
  return isWeakDevice() ? 'lite' : 'full'
}

function paint(level) {
  const c = document.documentElement.classList
  c.toggle('lowfx', level === 'low')
  c.toggle('lite', level !== 'full')
}

export function applyFx(m) {
  mode = m === 'low' || m === 'full' ? m : 'auto'
  if (mode === 'auto' && !autoLevel) autoLevel = startLevel()
  const level = mode === 'low' ? 'low' : mode === 'full' ? 'full' : autoLevel
  paint(level)
  return level === 'low'
}
export const fxLow = () => document.documentElement.classList.contains('lowfx')

function downgrade() {
  const i = ORDER.indexOf(autoLevel)
  if (mode !== 'auto' || i < 0 || i >= ORDER.length - 1) return
  autoLevel = ORDER[i + 1]
  try { localStorage.setItem(KEY, autoLevel) } catch { }
  paint(autoLevel)
}

try { applyFx(getSettings().fxMode) } catch { }

try {
  const root = document.documentElement
  let idle = 0, raf = 0, last = 0, frames = 0, slow = 0
  const loop = (t) => {
    if (last) { frames++; if (t - last > 34) slow++ }
    last = t
    if (frames >= 150) {
      if (slow / frames > 0.18) downgrade()
      frames = 0; slow = 0
    }
    raf = requestAnimationFrame(loop)
  }
  const stop = () => {
    root.classList.remove('scrolling')
    cancelAnimationFrame(raf); raf = 0; last = 0
  }
  document.addEventListener('scroll', () => {
    if (!root.classList.contains('scrolling')) {
      root.classList.add('scrolling')
      if (mode === 'auto' && !raf) raf = requestAnimationFrame(loop)
    }
    clearTimeout(idle)
    idle = setTimeout(stop, 220)
  }, { passive: true, capture: true })
} catch { }

try {
  const isField = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(el.type)))
  document.addEventListener('focusin', (e) => { if (isField(e.target)) document.documentElement.classList.add('typing') })
  document.addEventListener('focusout', (e) => { if (isField(e.target)) document.documentElement.classList.remove('typing') })
} catch { }

try {
  document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('app-bg', document.hidden))
} catch { }
