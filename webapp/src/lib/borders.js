import { useEffect, useState } from 'react'
import { borderOf } from '../services/borders'
import { supabase } from './supabase'

export const RARITY = {
  basic: ['Basic', 'r-basic'], standard: ['Standard', 'r-standard'], premium: ['Premium', 'r-premium'],
}
export const RARITY_ORDER = ['basic', 'standard', 'premium']

const TTL = 3 * 60 * 1000
const cache = new Map()
const subs = new Set()
let queue = new Set(), timer = null
const notify = () => subs.forEach((f) => f())

function flush() {
  timer = null
  const ids = [...queue]; queue = new Set()
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100)
    borderOf(part).then((rows) => {
      const m = new Map((rows || []).map((r) => [r.user_id, r.border_id]))
      part.forEach((id) => cache.set(id, { id: m.get(id) || null, at: Date.now() }))
      notify()
    }).catch(() => part.forEach((id) => { const c = cache.get(id); cache.set(id, { id: c?.id || null, at: Date.now() - TTL + 15000 }) }))
  }
}
function want(uid) {
  const e = cache.get(uid)
  if (e && Date.now() - e.at < TTL) return
  queue.add(uid)
  if (!timer) timer = setTimeout(flush, 60)
}
export function setBorderLocal(uid, id) { cache.set(uid, { id: id || null, at: Date.now() }); notify() }
export function useBorderOf(uid) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!supabase || !uid) return
    const f = () => tick((x) => x + 1)
    subs.add(f)
    return () => subs.delete(f)
  }, [uid])
  useEffect(() => { if (supabase && uid) want(uid) }, [uid])
  return uid ? cache.get(uid)?.id || null : null
}
