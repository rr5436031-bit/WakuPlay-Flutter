import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'
import { getSettings, setSetting } from './settings'
import { api } from '../services/animeApi'
import { LocalNotifications } from '@capacitor/local-notifications'
import { initPush, pushActive, advancePush, systemNotifEnabled, withTimeout } from './push'
import { listFavorites, listHistory, latestPerAnime, getPublicProfile } from '../services/db'

let state = { list: [], loaded: false }
const subs = new Set()
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f(state)) }
export function useNotifs() {
  const [s, setS] = useState(state)
  useEffect(() => { subs.add(setS); setS(state); return () => subs.delete(setS) }, [])
  return { list: s.list, loaded: s.loaded, unread: s.list.filter((n) => !n.read_at).length }
}

const isNative = Capacitor.isNativePlatform()
async function ln() { return isNative ? LocalNotifications : null }

// Status izin notifikasi: 'granted' | 'prompt' | 'denied' | 'unsupported'. Tidak pernah melempar error & tidak pernah menggantung.
export async function notifPermission() {
  if (!isNative) return 'unsupported'
  const sys = await systemNotifEnabled()
  if (sys === true) return 'granted'
  let d = null
  try { d = (await withTimeout(LocalNotifications.checkPermissions(), 2500, null))?.display || null } catch { }
  if (d === 'granted') return sys === false ? 'denied' : 'granted'
  if (d === 'prompt' || d === 'prompt-with-rationale') return 'prompt'
  if (d === 'denied') return 'denied'
  return sys === false ? 'denied' : 'unsupported'
}
export async function requestNotifPermission() {
  if (!isNative) return 'unsupported'
  try { await LocalNotifications.requestPermissions() } catch { }
  try { setSetting('notifAsked', true) } catch { }
  return notifPermission()
}

let chReady = null
const CH = 'wakuplay_app'
function ensureChannel(p) {
  if (!chReady) chReady = p.createChannel({ id: CH, name: 'WakuPlay', description: 'Tag, balasan, teman, clan, chat pribadi, anime & episode baru', importance: 4, visibility: 1, vibration: true }).catch(() => {})
  return chReady
}

const typeOn = () => getSettings().notifAll !== false

let toast = null
const tsubs = new Set()
const setToast = (n) => { toast = n; tsubs.forEach((f) => f(toast)) }
export const dismissToast = () => setToast(null)
export function useToast() {
  const [t, setT] = useState(toast)
  useEffect(() => { tsubs.add(setT); setT(toast); return () => tsubs.delete(setT) }, [])
  return t
}
const announced = new Set()
const mark = (n) => { const k = n.id + ':' + n.created_at; if (announced.has(k)) return false; announced.add(k); if (announced.size > 300) announced.delete(announced.values().next().value); return true }

async function showSystem(n) {
  if (!mark(n)) return
  advancePush(n.created_at)
  if (!typeOn()) return
  const p = await ln()
  if (p && (await notifPermission()) === 'granted') {
    try {
      await ensureChannel(p)
      await p.schedule({ notifications: [{
        id: Number(n.id) > 0 ? Number(n.id) % 2000000000 : Math.floor(Math.random() * 2e9), title: n.title, body: n.body || '', channelId: CH, smallIcon: 'ic_stat_wakuplay',
        extra: { id: n.id, type: n.type, data: n.data || {}, title: n.title },
      }] })
      return
    } catch { }
  }
  if (document.visibilityState === 'visible') setToast(n)
}

export async function openNotif(n, nav) {
  const d = n.data || {}
  if (supabase && n.id) supabase.rpc('notif_mark_read', { p_id: n.id }).then(() => {}, () => {})
  set({ list: state.list.map((x) => (x.id === n.id ? { ...x, read_at: x.read_at || new Date().toISOString() } : x)) })
  if (n.type === 'friend_request') return nav.push('connections')
  if (n.type === 'friend_accept') {
    const p = await getPublicProfile(d.from).catch(() => null)
    return nav.push('userprofile', { uid: d.from, name: p?.name || n.title, avatar: p?.avatar || null, seq: p?.seq })
  }
  if (n.type === 'episode' || n.type === 'new_anime') return nav.push('detail', { id: d.anime_id, preview: { id: d.anime_id, title: n.title, poster: d.poster } })
  if (n.type === 'reply') {
    if (d.episode_id && d.anime_id) return nav.push('player', { animeId: d.anime_id, episodeId: d.episode_id, episodeNumber: d.number, anime: { id: d.anime_id, title: d.anime_title, poster: d.poster } })
    return nav.push('connections')
  }
  if (n.type === 'clan_request') return d.clan_id ? nav.push('clandetail', { id: d.clan_id }) : nav.push('clans')
  if (n.type === 'mention') return d.room === 'request' || d.room === 'lapor' ? nav.push('feedback', { tab: d.room }) : nav.push('chat')
  if (n.type === 'dm') {
    const p = await getPublicProfile(d.from).catch(() => null)
    nav.push('dm', { uid: d.from, name: p?.name || n.title, avatar: p?.avatar || null, seq: p?.seq })
  }
}
export async function markAllRead() {
  set({ list: state.list.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })) })
  try { await supabase.rpc('notif_mark_read', { p_id: null }) } catch { }
}
export async function clearAll(uid) {
  set({ list: [] })
  try { await supabase.from('notifications').delete().eq('user_id', uid) } catch { }
}

async function checkEpisodes(uid) {
  if (!typeOn()) return
  if (pushActive()) return
  const [favs, hist] = await Promise.all([
    listFavorites(uid).catch(() => []),
    listHistory(uid, 60).then(latestPerAnime).catch(() => []),
  ])
  const pool = new Map()
  favs.forEach((f) => pool.set(String(f.anime_id), { id: String(f.anime_id), title: f.title, poster: f.poster }))
  hist.forEach((h) => { if (!pool.has(String(h.anime_id))) pool.set(String(h.anime_id), { id: String(h.anime_id), title: h.anime_title, poster: h.anime_poster }) })
  let seen = {}
  try { seen = JSON.parse(localStorage.getItem('wp_ep_seen') || '{}') } catch { }
  for (const a of [...pool.values()].slice(0, 8)) {
    let eps
    try { eps = await api.episodes(a.id) } catch { continue }
    if (!eps || !eps.length) continue
    const prev = seen[a.id]
    if (prev && eps.length > prev.n) {
      for (const e of eps.slice(-Math.min(3, eps.length - prev.n))) {
        try { await supabase.rpc('notify_episode', { p_anime_id: a.id, p_title: a.title || 'Anime', p_poster: a.poster || null, p_episode_id: String(e.id), p_number: String(e.number ?? '') }) } catch { }
      }
    }
    seen[a.id] = { n: eps.length }
  }
  try { localStorage.setItem('wp_ep_seen', JSON.stringify(seen)) } catch { }
}

const RECENT = 120000
const isFresh = (n) => Date.now() - new Date(n.created_at).getTime() < RECENT
export function startNotifs(uid, nav) {
  if (!supabase || !uid) return () => {}
  let alive = true
  let ch = null, retry = null

  const load = async (announce) => {
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)
    if (!alive || error) return
    const rows = data || []
    const was = state.loaded
    const known = new Map(state.list.map((x) => [x.id, x]))
    set({ list: rows, loaded: true })
    if (!was || !announce) return
    rows.filter((n) => {
      if (n.read_at || !isFresh(n)) return false
      const old = known.get(n.id)
      return !old || new Date(n.created_at) > new Date(old.created_at)
    }).reverse().forEach(showSystem)
  }
  const upsert = (n, announce, upd) => {
    const old = state.list.find((x) => x.id === n.id)
    const rest = state.list.filter((x) => x.id !== n.id)
    set({ list: [n, ...rest].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 60), loaded: true })
    if (announce && !n.read_at && (!upd || !old || n.type === 'dm' || new Date(n.created_at) > new Date(old.created_at))) showSystem(n)
  }
  const pollNew = async () => {
    if (document.visibilityState !== 'visible' || !state.loaded) return
    const top = state.list.reduce((m, x) => Math.max(m, new Date(x.created_at).getTime()), 0)
    const since = new Date(top || Date.now() - 60000).toISOString()
    const { data, error } = await supabase.from('notifications').select('*').gt('created_at', since).order('created_at', { ascending: false }).limit(20)
    if (!alive || error || !data || !data.length) return
    data.slice().reverse().forEach((n) => upsert(n, true))
  }

  const subscribe = () => {
    if (!alive) return
    if (ch) { supabase.removeChannel(ch); ch = null }
    const c = supabase.channel('notif-' + uid + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (e) => upsert(e.new, true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (e) => upsert(e.new, true, true))
    ch = c
    c.subscribe((status) => {
      if (!alive || c !== ch) return
      if (status === 'SUBSCRIBED') pollNew()
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { clearTimeout(retry); retry = setTimeout(subscribe, 4000) }
    })
  }

  load(false)
  subscribe()
  const quick = setInterval(pollNew, 15000)
  const slow = setInterval(() => load(true), 120000)
  const onVis = () => {
    if (document.visibilityState !== 'visible') return
    load(true)
    if (!ch) subscribe()
  }
  document.addEventListener('visibilitychange', onVis)

  const t0 = setTimeout(() => checkEpisodes(uid).then(() => load(true)).catch(() => {}), 12000)
  const t1 = setInterval(() => checkEpisodes(uid).then(() => load(true)).catch(() => {}), 30 * 60000)

  const offPush = initPush(uid, (n) => openNotif(n, nav))
  let handle
  ln().then((p) => p && p.addListener('localNotificationActionPerformed', (ev) => {
    const x = ev?.notification?.extra
    if (x) openNotif({ id: x.id, type: x.type, data: x.data, title: x.title }, nav)
  })).then((h) => { handle = h }).catch(() => {})

  return () => {
    alive = false
    clearInterval(quick); clearInterval(slow); clearInterval(t1); clearTimeout(t0); clearTimeout(retry)
    document.removeEventListener('visibilitychange', onVis)
    if (ch) supabase.removeChannel(ch)
    handle && handle.remove()
    offPush()
    setToast(null); announced.clear()
    set({ list: [], loaded: false })
  }
}
