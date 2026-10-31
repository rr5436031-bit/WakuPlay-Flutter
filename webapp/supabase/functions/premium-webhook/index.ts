import { createClient } from 'npm:@supabase/supabase-js@2'

const KEY = Deno.env.get('SOCIABUZZ_WEBHOOK_KEY') ?? ''
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function safeEq(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}
function pick(o: any, keys: string[]): any {
  for (const src of [o, o?.data, o?.donation, o?.data?.donation, o?.transaction]) {
    if (!src || typeof src !== 'object') continue
    for (const k of keys) if (src[k] !== undefined && src[k] !== null && src[k] !== '') return src[k]
  }
  return undefined
}
const num = (v: any): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.floor(v) : NaN
  const s = String(v ?? '').replace(/[^\d.,]/g, '')
  if (!/\d/.test(s)) return NaN
  const i = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  const digits = (t: string) => t.replace(/[.,]/g, '')
  const n = i === -1 ? Number(s) : s.length - i - 1 === 3 ? Number(digits(s)) : Number(digits(s.slice(0, i)))
  return Number.isFinite(n) ? Math.floor(n) : NaN
}
function pickAmount(o: any): number {
  const keys = ['amount_raw', 'amount', 'gross_amount', 'total_amount', 'total', 'nominal', 'price', 'amount_settled', 'net_amount']
  let best = NaN
  for (const src of [o, o?.data, o?.donation, o?.data?.donation, o?.transaction]) {
    if (!src || typeof src !== 'object') continue
    for (const k of keys) { const n = num(src[k]); if (Number.isFinite(n) && n > 0 && !(n <= best)) best = n }
  }
  return best
}
async function log(result: string, order_id: string | null, payload: unknown) {
  try { await admin.from('premium_webhook_log').insert({ result, order_id, payload: payload as any }) } catch { }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false })
  if (KEY.length < 24) return json(503, { ok: false, error: 'belum dikonfigurasi' })

  const url = new URL(req.url)
  const given = url.searchParams.get('key') || req.headers.get('x-webhook-key') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!safeEq(given, KEY)) return json(401, { ok: false, error: 'key salah' })

  let b: any = null
  const ct = req.headers.get('content-type') || ''
  if (ct.includes('application/json')) b = await req.json().catch(() => null)
  else { const t = await req.text(); try { b = JSON.parse(t) } catch { b = Object.fromEntries(new URLSearchParams(t)) } }
  if (!b || typeof b !== 'object') return json(400, { ok: false, error: 'data tidak valid' })

  const status = String(pick(b, ['status', 'payment_status', 'transaction_status']) ?? 'success').toLowerCase()
  if (['pending', 'failed', 'expired', 'cancel', 'canceled', 'cancelled', 'unpaid'].includes(status)) { await log('ignored:' + status, null, b); return json(200, { ok: true, ignored: status }) }

  const idv = String(pick(b, ['donation_id', 'transaction_id', 'trx_id', 'id', 'order_id', 'invoice']) ?? '')
  const amount = pickAmount(b)
  const message = String(pick(b, ['message', 'note', 'pesan', 'description']) ?? '')
  const email = String(pick(b, ['email', 'supporter_email', 'donator_email']) ?? '')
  const paidRaw = pick(b, ['created_at', 'paid_at', 'paidAt', 'date'])
  const paid = paidRaw && !isNaN(new Date(paidRaw).getTime()) ? new Date(paidRaw).toISOString() : null
  const ref = idv ? `${idv}|${paidRaw ?? ''}|${amount}` : null
  if (!Number.isFinite(amount) || amount <= 0) { await log('bad_amount', null, b); return json(400, { ok: false, error: 'nominal tidak terbaca' }) }

  const whole = JSON.stringify(b)
  let orderId: string | null = (message.toUpperCase().match(/WP\d{6}[0-9A-Z]{10}/) || [])[0] ?? (whole.toUpperCase().match(/WP\d{6}[0-9A-F]{10}/) || [])[0] ?? null
  if (!orderId && email) {
    const { data } = await admin.rpc('premium_find_pending_sb', { p_email: email, p_amount: amount })
    if (typeof data === 'string') orderId = data
  }
  if (!orderId) {
    const uid = (message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || whole.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0]
    if (uid) { const { data } = await admin.rpc('premium_find_pending_by_uid', { p_uid: uid.toLowerCase(), p_amount: amount }); if (typeof data === 'string') orderId = data }
  }
  if (!orderId) { await log('no_order', null, b); return json(200, { ok: true, ignored: 'bukan pesanan Premium' }) }

  const { data: r, error } = await admin.rpc('premium_activate_sb', { p_order: orderId, p_ref: ref, p_amount: amount, p_paid: paid })
  if (error) { console.error('aktivasi error', error.message); await log('error:' + error.message, orderId, b); return json(500, { ok: false }) }
  if (!r?.ok) { console.error('aktivasi ditolak', orderId, r?.reason); await log('rejected:' + r?.reason, orderId, b); return json(200, { ok: false, error: String(r?.reason) }) }
  await log(r.already ? 'already' : 'activated', orderId, b)
  return json(200, { ok: true, already: !!r.already })
})
