import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const cache = new Map()

export async function checkDevPanel(userId) {
  if (!supabase || !userId) return false
  try {
    const { data, error } = await supabase.rpc('has_dev_panel')
    const ok = !error && data === true
    cache.set(userId, { ok, at: Date.now() })
    return ok
  } catch { return false }
}

export function useDevPanelAccess(userId) {
  const c = userId ? cache.get(userId) : null
  const [ok, setOk] = useState(c && Date.now() - c.at < 20000 ? c.ok : null)
  useEffect(() => {
    let alive = true
    if (!userId) { setOk(false); return }
    checkDevPanel(userId).then((v) => { if (alive) setOk(v) })
    return () => { alive = false }
  }, [userId])
  return ok
}
