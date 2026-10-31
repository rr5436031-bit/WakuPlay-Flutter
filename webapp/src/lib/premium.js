import { useEffect, useState } from 'react'
import { premiumOf } from '../services/premium'

const TTL = 60000
const cache = new Map()
const want = new Set()
const subs = new Set()
let timer = null

function flush() {
  timer = null
  const ids = [...want]
  want.clear()
  if (!ids.length) return
  premiumOf(ids.slice(0, 200)).then((rows) => {
    const on = new Set(rows || [])
    const t = Date.now()
    ids.forEach((id) => cache.set(id, { v: on.has(id), t }))
    subs.forEach((f) => f())
  }).catch(() => {
    const t = Date.now() - TTL + 10000
    ids.forEach((id) => { if (!cache.has(id)) cache.set(id, { v: false, t }) })
  })
}

export function usePremiumFlag(uid) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!uid) return
    const f = () => tick((n) => n + 1)
    subs.add(f)
    const c = cache.get(uid)
    if (!c || Date.now() - c.t > TTL) { want.add(uid); if (!timer) timer = setTimeout(flush, 60) }
    return () => { subs.delete(f) }
  }, [uid])
  return !!uid && !!cache.get(uid)?.v
}

export function refreshPremium() {
  cache.clear()
  subs.forEach((f) => f())
}
