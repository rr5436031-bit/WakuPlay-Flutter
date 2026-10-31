import { useEffect, useState } from 'react'
import { supabase } from './supabase'

let roles = {}
let loadedAt = 0
let inflight = null
const subs = new Set()

async function load(force = false) {
  if (!supabase) return
  if (!force && Date.now() - loadedAt < 15000) return
  if (inflight) return inflight
  inflight = supabase.rpc('get_staff').then(({ data, error }) => {
    if (error || !Array.isArray(data)) return
    const next = {}
    data.forEach((r) => { next[r.user_id] = r.role })
    loadedAt = Date.now()
    if (JSON.stringify(next) !== JSON.stringify(roles)) { roles = next; subs.forEach((f) => f(roles)) }
  }).catch(() => {}).finally(() => { inflight = null })
  return inflight
}

export function useStaffRoles() {
  const [r, set] = useState(roles)
  useEffect(() => {
    subs.add(set)
    load()
    const t = setInterval(() => load(true), 30000)
    return () => { subs.delete(set); clearInterval(t) }
  }, [])
  return r
}
