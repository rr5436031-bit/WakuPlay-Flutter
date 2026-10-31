import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from './supabase'
import { getSettings, setSetting } from './settings'

const isNative = Capacitor.isNativePlatform()
const Native = isNative ? registerPlugin('WpNotify') : null

export const pushActive = () => false

// Panggilan native tidak boleh menggantung selamanya: kalau tidak menjawab dalam `ms`, pakai `fb`.
export const withTimeout = (p, ms, fb) => new Promise((res) => {
  const t = setTimeout(() => res(fb), ms)
  Promise.resolve(p).then((v) => { clearTimeout(t); res(v) }, () => { clearTimeout(t); res(fb) })
})

const prefs = () => {
  const on = getSettings().notifAll !== false
  return { friend: on, dm: on, episode: on, mention: on, reply: on, clan: on, anime: on }
}

// Kecepatan pengecekan saat aplikasi ditutup: cepat = layanan latar tiap 5 detik, normal = 30 detik, hemat = alarm ~5 menit
const SPEED = { cepat: 5000, normal: 30000, hemat: 300000 }
const speedMs = () => SPEED[getSettings().notifSpeed] || SPEED.cepat

let ctx = null
let device = null
let handles = []
let vis = null

async function ensureDevice() {
  if (!Native || !supabase || !ctx) return
  const uid = ctx.uid
  try {
    const st = await Native.status()
    if (st.configured && st.uid === uid && st.device) { device = st.device; Native.setSpeed({ interval: speedMs() }).catch(() => {}); return }
    const { data, error } = await supabase.rpc('notif_device_register', { p_prefs: prefs() })
    if (error || !data?.device_id || !data?.secret) return
    if (!ctx || ctx.uid !== uid) { supabase.rpc('notif_device_revoke', { p_device: data.device_id }).then(() => {}, () => {}); return }
    await Native.configure({
      url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
      device: data.device_id, secret: data.secret, since: data.since || '', uid, interval: speedMs(),
    })
    device = data.device_id
  } catch { }
}

async function start() {
  if (!Native || !ctx) return
  try {
    if (!handles.length) {
      handles.push(await Native.addListener('notifTap', (ev) => {
        let d = {}
        try { d = JSON.parse(ev?.data || '{}') } catch { }
        if (ctx) ctx.onOpen({ id: ev?.nid ? Number(ev.nid) : undefined, type: ev?.type, title: ev?.title, data: d })
      }))
    }
    const sendVis = () => { Native.setForeground({ on: document.visibilityState === 'visible' }).catch(() => {}) }
    if (!vis) { vis = sendVis; document.addEventListener('visibilitychange', vis) }
    sendVis()
    await ensureDevice()
  } catch { }
}

export const syncPushPrefs = () => {
  if (!Native || !supabase || !device) return
  supabase.rpc('notif_device_set_prefs', { p_device: device, p_prefs: prefs() }).then(() => {}, () => {})
}

export const advancePush = (createdAt) => { if (Native && createdAt) Native.advance({ since: String(createdAt) }).catch(() => {}) }

export function initPush(uid, onOpen) {
  if (!isNative) return () => {}
  ctx = { uid, onOpen }
  start()
  return () => {
    const d = device
    ctx = null; device = null
    handles.forEach((h) => { try { h.remove() } catch { } }); handles = []
    if (vis) { document.removeEventListener('visibilitychange', vis); vis = null }
    try { Native && Native.clear().catch(() => {}) } catch { }
    if (d && supabase) supabase.rpc('notif_device_revoke', { p_device: d }).then(() => {}, () => {})
  }
}
export const retryPush = () => { start() }

export const applyPushSpeed = () => { if (Native) Native.setSpeed({ interval: speedMs() }).catch(() => {}) }
// Minta izin "berjalan di latar / tidak dibatasi" sekali saja setelah notifikasi diizinkan
export async function askBatteryOnce() {
  if (!Native) return
  try {
    if (getSettings().notifBatAsked) return
    setSetting('notifBatAsked', true)
    const st = await withTimeout(Native.status(), 2500, null)
    if (st && st.ignoringBattery === false) Native.openBatterySettings().catch(() => {})
  } catch { }
}
export const openBatterySettings = () => { if (Native) Native.openBatterySettings().catch(() => {}) }
export const openNotifSettings = () => { if (Native) Native.openNotifSettings().catch(() => openBatterySettings()) }
export async function systemNotifEnabled() {
  if (!Native) return null
  try { const st = await withTimeout(Native.status(), 2500, null); return typeof st?.enabled === 'boolean' ? st.enabled : null } catch { return null }
}
export const pushSupported = isNative
