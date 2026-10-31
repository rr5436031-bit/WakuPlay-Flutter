import { useEffect, useState } from 'react'
import { monthlyTopOf } from '../services/toplb'

const TTL = 120000
const cache = new Map()

export function useMonthlyTop(uid) {
  const [v, setV] = useState(() => cache.get(uid)?.v ?? null)
  useEffect(() => {
    if (!uid) return
    const c = cache.get(uid)
    if (c && Date.now() - c.t < TTL) { setV(c.v); return }
    let off = false
    monthlyTopOf(uid).then((r) => { cache.set(uid, { v: r, t: Date.now() }); if (!off) setV(r) }).catch(() => {})
    return () => { off = true }
  }, [uid])
  return v
}
