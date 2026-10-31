import { Capacitor } from '@capacitor/core'
import { SocialLogin } from '@capgo/capacitor-social-login'
import { supabase } from './supabase'
import { resetApiSession } from '../services/animeApi'

let ready = false

async function initGoogle() {
  if (ready) return
  await SocialLogin.initialize({
    google: { webClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID },
  })
  ready = true
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Login Google hanya tersedia di aplikasi Android')
  }
  await initGoogle()
  const res = await SocialLogin.login({
    provider: 'google',
    options: {},
  })
  const idToken = res?.result?.idToken
  if (!idToken) throw new Error('Token Google tidak diterima')
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error) throw error
}

export async function signOut() {
  try {
    await SocialLogin.logout({ provider: 'google' })
  } catch (e) {
  }
  resetApiSession()
  if (supabase) await supabase.auth.signOut()
}

const baseUrl = (u) => String(u || '').replace(/=s\d+(-c)?$/, '')
const big = (u) => (u ? baseUrl(u) + '=s256-c' : u)
function jwtPicture(t) {
  try {
    const b = String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(b)))).picture || null
  } catch { return null }
}

export async function syncGoogleAvatar({ interactive = false } = {}) {
  if (!supabase || !Capacitor.isNativePlatform()) return null
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null
  await initGoogle()
  let res
  if (interactive) res = await SocialLogin.login({ provider: 'google', options: {} })
  else {
    if (typeof SocialLogin.refresh !== 'function') return null
    res = await SocialLogin.refresh({ provider: 'google', options: {} })
  }
  const r = res?.result || res || {}
  const email = r.profile?.email
  if (interactive && email && user.email && email.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error('Pilih akun Google yang sama dengan akun WakuPlay kamu (' + user.email + ')')
  }
  const pic = r.profile?.imageUrl || jwtPicture(r.idToken)
  if (!pic) return null
  const cur = user.user_metadata?.avatar_url
  if (baseUrl(pic) === baseUrl(cur) && /=s256-c$/.test(cur || '')) return { changed: false, url: cur }
  const url = big(pic)
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: url } })
  if (error) throw error
  return { changed: baseUrl(pic) !== baseUrl(cur), url }
}

export async function autoSyncAvatar() {
  try {
    const last = Number(localStorage.getItem('wp_ava_sync') || 0)
    if (Date.now() - last < 6 * 3600 * 1000) return
    const r = await syncGoogleAvatar({ interactive: false })
    if (r) localStorage.setItem('wp_ava_sync', String(Date.now()))
  } catch { }
}
