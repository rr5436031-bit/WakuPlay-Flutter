import { useEffect, useState } from 'react'
import { monthlyGiverOf } from '../services/topgiver'

const TTL = 120000
const cache = new Map()

export function useMonthlyGiver(uid) {
  const [v, setV] = useState(() => cache.get(uid)?.v ?? null)
  useEffect(() => {
    if (!uid) return undefined
    const c = cache.get(uid)
    if (c && Date.now() - c.t < TTL) { setV(c.v); return undefined }
    setV(null)
    let off = false
    monthlyGiverOf(uid).then((r) => { cache.set(uid, { v: r, t: Date.now() }); if (!off) setV(r) }).catch(() => {})
    return () => { off = true }
  }, [uid])
  return v
}
