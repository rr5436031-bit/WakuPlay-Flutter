// Jembatan JS <-> Flutter (Dart) <-> Kotlin. Menggantikan runtime Capacitor; kode aplikasi lain TIDAK diubah.
export const isNative = typeof window !== 'undefined' && window.__WP_FLUTTER__ === true

let readyP = null
const ready = () => (readyP ||= new Promise((res) => {
  if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) return res()
  window.addEventListener('flutterInAppWebViewPlatformReady', () => res(), { once: true })
  const t = setInterval(() => { if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) { clearInterval(t); res() } }, 50)
}))

export async function call(plugin, method, args) {
  await ready()
  const r = await window.flutter_inappwebview.callHandler('wp', plugin, method, args == null ? {} : args)
  if (r && typeof r === 'object' && r.__error) throw new Error(String(r.__error))
  return r
}

const listeners = new Map()
const pending = new Map()
const RETAIN = new Set(['WpNotify:notifTap', 'LocalNotifications:localNotificationActionPerformed'])

if (typeof window !== 'undefined') {
  window.__wpEmit = (plugin, event, data) => {
    const k = plugin + ':' + event
    const set = listeners.get(k)
    if (set && set.size) { set.forEach((f) => { try { f(data) } catch { } }); return }
    if (RETAIN.has(k)) { const q = pending.get(k) || []; q.push(data); if (q.length > 20) q.shift(); pending.set(k, q) }
  }
}

export function listen(plugin, event, cb) {
  const k = plugin + ':' + event
  let set = listeners.get(k)
  if (!set) { set = new Set(); listeners.set(k, set) }
  set.add(cb)
  const q = pending.get(k)
  if (q && q.length) { pending.delete(k); setTimeout(() => q.forEach((d) => { try { cb(d) } catch { } }), 0) }
  return Promise.resolve({ remove: () => { set.delete(cb) } })
}
