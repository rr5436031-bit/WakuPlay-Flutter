const BASE = (Deno.env.get('ANIME_API_BASE') || 'https://animeinweb-api.vercel.app/api').replace(/\/+$/, '')

const cache = new Map()
const ttlOf = (p) => (/\/stream$/.test(p) ? 0 : /^\/(homepage|genres|schedule)/.test(p) ? 5 * 60000 : 60000)

const ALLOWED = [
  /^\/homepage$/,
  /^\/search(\?.*)?$/,
  /^\/genres$/,
  /^\/schedule(\?.*)?$/,
  /^\/anime\/[^/?#]+$/,
  /^\/anime\/[^/?#]+\/episodes(\?.*)?$/,
  /^\/episode\/[^/?#]+\/stream$/,
]

function normalizePath(path) {
  if (typeof path !== 'string' || path.length > 400 || /[\u0000-\u001f\\#]/.test(path)) return null
  const i = path.indexOf('?')
  const pp = i < 0 ? path : path.slice(0, i)
  const query = i < 0 ? '' : path.slice(i)
  const parts = pp.split('/')
  if (parts[0] !== '') return null
  const out = []
  for (const seg of parts.slice(1)) {
    let d
    try { d = decodeURIComponent(seg) } catch { return null }
    if (d === '.' || d === '..' || !/^[A-Za-z0-9_:.~-]{1,160}$/.test(d)) return null
    out.push(encodeURIComponent(d))
  }
  return '/' + out.join('/') + query
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const deny = (status, error) => new Response(JSON.stringify({ error }), { status, headers: cors })

function isLoggedIn(req) {
  try {
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const b64 = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
    return payload.role === 'authenticated' && !!payload.sub
  } catch { return false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!isLoggedIn(req)) return deny(401, 'login diperlukan')
  try {
    const body0 = await req.json()
    const path = normalizePath(body0 && body0.path)
    if (!path || !ALLOWED.some((r) => r.test(path))) {
      return deny(400, 'path tidak diizinkan')
    }
    const ttl = ttlOf(path)
    const hit = cache.get(path)
    if (ttl && hit && Date.now() - hit.t < ttl) return new Response(hit.body, { status: 200, headers: cors })
    const upstream = await fetch(BASE + path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
    const body = await upstream.text()
    if (ttl && upstream.status === 200) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value)
      cache.set(path, { t: Date.now(), body })
    }
    return new Response(body, { status: upstream.status, headers: cors })
  } catch (e) {
    return deny(500, 'gagal memproses permintaan')
  }
})
