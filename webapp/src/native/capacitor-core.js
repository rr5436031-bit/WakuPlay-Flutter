import { isNative, call, listen } from './bridge'

export const Capacitor = { isNativePlatform: () => isNative, getPlatform: () => (isNative ? 'android' : 'web') }

export const registerPlugin = (name) => new Proxy({}, {
  get: (_, m) => {
    if (m === 'then') return undefined
    if (m === 'addListener') return (ev, cb) => listen(name, ev, cb)
    return (args) => call(name, String(m), args)
  },
})

// Pengganti CapacitorHttp.get: diambil lewat Dart (tanpa CORS), data berupa base64
export const CapacitorHttp = {
  get: (opts) => call('Http', 'get', opts),
}
