import { supabase } from './supabase'
import { Pip } from './pip'

const LS_ID = 'wp_dev_id'
const LS_BAN = 'wp_dev_ban'

function shape(r) {
  const offset = r.server_now ? new Date(r.server_now).getTime() - Date.now() : 0
  return { reason: r.reason, label: r.label, expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : null, permanent: !!r.permanent, offset }
}
const first = (data) => (Array.isArray(data) ? data[0] : data) || null

async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch { return text }
}

let devIdP = null
export function getDeviceId() {
  if (!devIdP) {
    devIdP = (async () => {
      try {
        if (Pip) { const r = await Pip.getDeviceId(); if (r && r.id) return 'a' + (await sha256('wakuplay:' + r.id)).slice(0, 40) }
      } catch { }
      try {
        let v = localStorage.getItem(LS_ID)
        if (!v) { v = 'r' + [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem(LS_ID, v) }
        return v
      } catch { return 'x' + Math.random().toString(16).slice(2).padEnd(24, '0') }
    })()
  }
  return devIdP
}

function saveLocal(b) { try { localStorage.setItem(LS_BAN, JSON.stringify({ ...b, savedAt: Date.now() })) } catch { } }
function clearLocal() { try { localStorage.removeItem(LS_BAN) } catch { } }
function readLocal() {
  try {
    const b = JSON.parse(localStorage.getItem(LS_BAN) || 'null')
    if (!b) return null
    if (!b.permanent && b.expiresAt && b.expiresAt <= Date.now() + (b.offset || 0)) { clearLocal(); return null }
    return b
  } catch { return null }
}

export async function registerDevice() {
  if (!supabase) return
  try { await supabase.rpc('register_device', { p_device: await getDeviceId() }) } catch { }
}

export async function fetchMyBan() {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('get_my_ban')
    if (error) return null
    const r = first(data)
    if (!r) return null
    const b = shape(r)
    saveLocal(b)
    return b
  } catch { return null }
}

export async function checkDeviceBan() {
  if (!supabase) return readLocal()
  try {
    const { data, error } = await supabase.rpc('check_device_ban', { p_device: await getDeviceId() })
    if (error) return readLocal()
    const r = first(data)
    if (!r) { clearLocal(); return null }
    const b = shape(r)
    saveLocal(b)
    return b
  } catch { return readLocal() }
}

export function fmtRemain(ms) {
  if (ms <= 0) return 'beberapa detik'
  const m = Math.ceil(ms / 60000)
  const units = [['tahun', 525600], ['bulan', 43200], ['hari', 1440], ['jam', 60], ['menit', 1]]
  const parts = []
  let left = m
  for (const [n, size] of units) {
    const q = Math.floor(left / size)
    if (q > 0) { parts.push(`${q} ${n}`); left -= q * size }
    if (parts.length === 2) break
  }
  return parts.join(' ') || '1 menit'
}
