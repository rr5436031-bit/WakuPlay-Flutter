import { useRef, useState } from 'react'

export function useAct() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const lock = useRef(false)
  const timer = useRef(null)
  const say = (m) => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(''), 3500) }
  const run = async (fn) => {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { return await fn() } catch (e) { say(e?.message || 'Gagal, coba lagi') } finally { lock.current = false; setBusy(false) }
  }
  return { busy, msg, say, run }
}
export { MAX_TIER, TIER_NAMES } from './clanbadgeGeom'
export const RARITY = {
  common: { label: 'Common', color: '#9aa3b2' },
  rare: { label: 'Rare', color: '#4aa3ff' },
  legend: { label: 'Legend', color: '#f5b50a' },
  mythic: { label: 'Mythic', color: '#ff5fd2' },
}
export const EMBLEM_RARITY = {
  common: { label: 'Common', color: '#9aa3b2' },
  epic: { label: 'Epic', color: '#a855f7' },
  legend: { label: 'Legend', color: '#f5b50a' },
  mythic: { label: 'Mythic', color: '#ff5fd2' },
}
export const EMBLEM_ORDER = ['common', 'epic', 'legend', 'mythic']
export const MYSTERY_EMBLEM = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="45" text-anchor="middle" font-size="40" font-weight="800" font-family="Arial,sans-serif" fill="#8f96b8">?</text></svg>')
export const colorOf = (c) => (c ? { c1: c.c1, c2: c.c2, c3: c.c3, rarity: c.rarity } : null)
export const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'baru saja'
  if (s < 3600) return Math.floor(s / 60) + ' mnt lalu'
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'
  return Math.floor(s / 86400) + ' hari lalu'
}
