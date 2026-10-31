import { useEffect, useState } from 'react'

const KEY = 'wp_settings'
const DEFAULTS = { quality: '720p', autoNext: true, fullscreen: true, hidden: [], notifFriend: true, notifDm: true, notifEpisode: true, notifMention: true, notifReply: true, notifClan: true, notifAnime: true, notifAll: true, notifAsked: false, notifSpeed: 'cepat', notifBatAsked: false, fxMode: 'auto', skipIntro: false }
const subs = new Set()

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
}
let cur = load()

export const getSettings = () => cur
export function setSetting(k, v) {
  cur = { ...cur, [k]: v }
  try { localStorage.setItem(KEY, JSON.stringify(cur)) } catch { }
  subs.forEach((f) => f(cur))
}
export function useSettings() {
  const [s, set] = useState(cur)
  useEffect(() => { subs.add(set); return () => subs.delete(set) }, [])
  return s
}
