import { useEffect, useState } from 'react'
import { clanBadgesRpc } from '../services/clan'
import { supabase } from './supabase'

const TTL = 2 * 60 * 1000
const cache = new Map()
const subs = new Set()
let queue = new Set(), timer = null, ver = 0

const toBadge = (r) => r && ({ clanId: r.clan_id, tag: r.tag, tier: r.tier, color: r.c1 ? { c1: r.c1, c2: r.c2, c3: r.c3, rarity: r.rarity } : null, emblem: r.emblem || null })

function flush() {
  timer = null
  const ids = [...queue]; queue = new Set()
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100)
    clanBadgesRpc(part).then((rows) => {
      const m = new Map((rows || []).map((r) => [r.user_id, toBadge(r)]))
      part.forEach((id) => cache.set(id, { data: m.get(id) || null, at: Date.now() }))
      subs.forEach((f) => f())
    }).catch(() => part.forEach((id) => { const c = cache.get(id); cache.set(id, { data: c?.data || null, at: Date.now() - TTL + 15000 }) }))
  }
}
function want(uid) {
  const e = cache.get(uid)
  if (e && Date.now() - e.at < TTL) return
  queue.add(uid)
  if (!timer) timer = setTimeout(flush, 60)
}
export function invalidateClanBadges() {
  cache.forEach((v) => { v.at = 0 })
  ver++
  subs.forEach((f) => f())
}

export function useClanBadge(uid) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!supabase || !uid) return
    const f = () => tick((x) => x + 1)
    subs.add(f)
    return () => subs.delete(f)
  }, [uid])
  useEffect(() => { if (supabase && uid) want(uid) }, [uid, ver])
  return uid ? cache.get(uid)?.data || null : null
}
