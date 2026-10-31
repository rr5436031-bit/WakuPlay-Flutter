import { useEffect, useState } from 'react'
import { getCommentBanners } from '../services/db'
import { fxLow } from './perf'

const TTL = 300000
const cache = new Map()
const OK_URL = /^https:\/\/[^\s"'<>\\]{4,480}$/i
const safe = (u) => (typeof u === 'string' && u.length <= 500 && OK_URL.test(u) ? u : null)
const want = new Set()
const subs = new Set()
let timer = null

function flush() {
  timer = null
  const ids = [...want].filter((x) => typeof x === 'string' && x.length === 36)
  want.clear()
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100)
    getCommentBanners(part).then((map) => {
      const t = Date.now()
      part.forEach((id) => cache.set(id, { u: safe(map[id]), t }))
      subs.forEach((f) => f())
    }).catch(() => {
      const t = Date.now() - TTL + 15000
      part.forEach((id) => { if (!cache.has(id)) cache.set(id, { u: null, t }) })
    })
  }
}

export function useCmBanner(uid) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!uid) return
    const f = () => tick((n) => n + 1)
    subs.add(f)
    const c = cache.get(uid)
    if (!c || Date.now() - c.t > TTL) { want.add(uid); if (!timer) timer = setTimeout(flush, 80) }
    return () => { subs.delete(f) }
  }, [uid])
  if (!uid || fxLow()) return null
  return cache.get(uid)?.u || null
}

export function refreshCmBanner() {
  cache.clear()
  subs.forEach((f) => f())
}
