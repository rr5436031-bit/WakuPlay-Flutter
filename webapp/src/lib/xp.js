import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { media } from './media'

import { levelInfo, xpForLevel, XP_PER_MIN, MAX_LEVEL } from './levelcurve'
export { levelInfo, xpForLevel, XP_PER_MIN, MAX_LEVEL }
export const levelTier = (lv) => (lv >= 100 ? 4 : lv >= 50 ? 3 : lv >= 25 ? 2 : lv >= 10 ? 1 : 0)

let myXp = null
const subs = new Set()
const setMyXp = (v) => { myXp = v; subs.forEach((f) => f(v)) }

export function useMyXp(userId) {
  const [v, set] = useState(myXp)
  useEffect(() => {
    subs.add(set)
    if (supabase && userId && myXp === null) {
      supabase.from('user_xp').select('xp').eq('user_id', userId).maybeSingle()
        .then(({ data }) => { if (myXp === null) setMyXp(Number(data?.xp ?? 0)) }).catch(() => {})
    }
    return () => subs.delete(set)
  }, [userId])
  return v
}

export async function refreshMyXp(userId) {
  if (!supabase || !userId) return
  try {
    const { data } = await supabase.from('user_xp').select('xp').eq('user_id', userId).maybeSingle()
    if (data && Number.isFinite(Number(data.xp))) setMyXp(Number(data.xp))
  } catch { }
}

export function isWatching() {
  const playing = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended && v.readyState > 2)
  return playing || !!document.querySelector('iframe.pframe')
}

export const nowPlaying = { animeId: null, epId: null, duration: 0 }
export const setNowPlaying = (animeId, epId, duration = 0) => { nowPlaying.animeId = animeId; nowPlaying.epId = epId; nowPlaying.duration = duration || 0 }

export function useXpTicker(userId) {
  useEffect(() => {
    if (!supabase || !userId) return
    let watched = 0, session = null, starting = false
    const STEP = 5
    const BEAT_SECS = 120
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible' || !isWatching()) return
      const ep = String(media.key ?? nowPlaying.epId ?? '')
      const anime = String(nowPlaying.animeId ?? '')
      if (!ep || !anime) return
      const v = media.el
      const video = media.key != null && !v.paused && !v.ended && v.readyState > 2
      const pos = video && Number.isFinite(v.currentTime) ? v.currentTime : null
      const dur = video && Number.isFinite(v.duration) ? v.duration : nowPlaying.duration || 0

      if (!session || session.ep !== ep || session.video !== (pos != null)) {
        if (starting) return
        starting = true; watched = 0
        try {
          const { data, error } = await supabase.rpc('xp_start', { p_anime: anime, p_ep: ep, p_duration: dur || 1500, p_pos: pos })
          session = !error && data ? { token: data, ep, video: pos != null } : null
        } catch { session = null }
        starting = false
        return
      }
      watched += STEP
      if (watched < BEAT_SECS) return          // harus 2 menit PENUH menonton baru kirim detak
      watched -= BEAT_SECS
      try {
        const { data, error } = await supabase.rpc('xp_beat', { p_token: session.token, p_pos: pos })
        if (error) { session = null; return }
        if (data != null) setMyXp(Number(data))
      } catch { }
    }, STEP * 1000)
    return () => clearInterval(t)
  }, [userId])
}

export async function getXps(ids) {
  const out = {}
  ids.forEach((id) => { out[id] = 0 })
  const { data, error } = await supabase.from('user_xp').select('user_id,xp').in('user_id', ids)
  if (error) throw error
  ;(data || []).forEach((r) => { out[r.user_id] = Number(r.xp) })
  return out
}

export const fmtXpShort = (n) => {
  n = Number(n) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(Math.round(n))
}
export async function getLeaderboard(period = 'daily') {
  const { data, error } = await supabase.rpc('get_xp_leaderboard', { p_period: period })
  if (error) throw error
  return data || []
}
export async function getMyRank(period = 'daily') {
  const { data, error } = await supabase.rpc('get_my_xp_rank', { p_period: period })
  if (error) throw error
  return (data && data[0]) || { rank: null, gain: 0 }
}
