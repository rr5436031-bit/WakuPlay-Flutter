import { useEffect, useState } from 'react'
import { getSocialBadge } from '../services/db'
import { levelInfo } from './xp'

export function useSocialBadge(userId, focusKey) {
  const [b, setB] = useState({ requests: 0, unread: 0 })
  useEffect(() => {
    let alive = true
    const load = () => getSocialBadge().then((r) => alive && setB(r)).catch(() => {})
    load()
    const t = setInterval(load, 20000)
    return () => { alive = false; clearInterval(t) }
  }, [userId, focusKey])
  return b.requests + b.unread
}

export const lvOf = (xp) => levelInfo(Number(xp) || 0).level

export function parseUserId(raw) {
  const v = String(raw || '').trim().replace(/^#/, '')
  if (!/^\d{1,12}$/.test(v)) return null
  const n = Number(v)
  return n >= 1 ? n : null
}
