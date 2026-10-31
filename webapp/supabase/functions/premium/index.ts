import { createClient } from 'npm:@supabase/supabase-js@2'

const PAGE = Deno.env.get('SOCIABUZZ_PAGE') ?? 'https://sociabuzz.com/wakuplay_premium/support'
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors })
const fail = (status: number, error: string) => json(status, { ok: false, error })
class Pub extends Error {}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(name, args)
  if (error) throw new Pub(error.message || 'Terjadi kesalahan')
  return data
}
async function authUser(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  return error || !data?.user ? null : data.user
}
async function myOrder(orderId: unknown, uid: string) {
  if (typeof orderId !== 'string' || !/^WP[0-9A-Z]{10,30}$/.test(orderId)) throw new Pub('Pesanan tidak ditemukan')
  const o = await rpc('premium_order_get', { p_order: orderId })
  if (!o || o.user_id !== uid) throw new Pub('Pesanan tidak ditemukan')
  return o
}
function view(o: any, extra: Record<string, unknown> = {}) {
  return {
    order_id: o.order_id, plan_name: o.plan_name, days: o.days, amount: o.amount, bonus_gold: o.bonus_gold ?? 0,
    status: o.status, expires_at: o.expires_at, created_at: o.created_at, completed_at: o.completed_at,
    activated: !!o.activated, server_now: new Date().toISOString(), ...extra,
  }
}

async function create(user: any, planId: unknown) {
  if (typeof planId !== 'string') throw new Pub('Pilih paket dulu')
  const o = await rpc('premium_create_order_sb', { p_user: user.id, p_plan: planId })
  let name = ''
  try { name = String((await admin.rpc('wp_name', { p_uid: user.id })).data || '') } catch { }
  if (!name) name = String(user.user_metadata?.full_name || user.user_metadata?.name || 'WakuPlay User')
  const fill = {
    amount: o.amount,
    name: name.slice(0, 40),
    email: String(user.email || ''),
    message: `${o.order_id} | ${user.id}`,
    page: PAGE,
  }
  return view(o, { fill, pay_url: o.pay_url ?? null, pay_qr: o.pay_qr ?? null, reused: !!o.reused })
}

async function payInfo(uid: string, orderId: unknown) {
  const o = await myOrder(orderId, uid)
  if (o.status !== 'pending') return view(o)
  if (o.expires_at && new Date(o.expires_at).getTime() <= Date.now()) return view({ ...o, status: 'expired' })
  const { data: u } = await admin.auth.admin.getUserById(uid)
  let name = ''
  try { name = String((await admin.rpc('wp_name', { p_uid: uid })).data || '') } catch { }
  const info = await rpc('premium_order_pay_get', { p_order: o.order_id }).catch(() => null)
  return view(o, {
    pay_url: info?.pay_url ?? null, pay_qr: info?.pay_qr ?? null,
    fill: { amount: o.amount, name: (name || 'WakuPlay User').slice(0, 40), email: String(u?.user?.email || ''), message: `${o.order_id} | ${uid}`, page: PAGE },
  })
}

async function saveUrl(uid: string, orderId: unknown, url: unknown) {
  const o = await myOrder(orderId, uid)
  if (typeof url === 'string') await rpc('premium_order_set_url', { p_order: o.order_id, p_user: uid, p_url: url.slice(0, 600) })
  return view(o)
}
async function saveQr(uid: string, orderId: unknown, qr: unknown) {
  const o = await myOrder(orderId, uid)
  if (typeof qr === 'string') await rpc('premium_order_set_qr', { p_order: o.order_id, p_user: uid, p_qr: qr.slice(0, 400000) })
  return view(o)
}
const amt = (v: any): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.floor(v) : NaN
  const s = String(v ?? '').replace(/[^\d.,]/g, '')
  if (!/\d/.test(s)) return NaN
  const i = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  const d = (t: string) => t.replace(/[.,]/g, '')
  const n = i === -1 ? Number(s) : s.length - i - 1 === 3 ? Number(d(s)) : Number(d(s.slice(0, i)))
  return Number.isFinite(n) ? Math.floor(n) : NaN
}
function payloadAmount(b: any): number {
  let best = NaN
  for (const src of [b, b?.data, b?.donation, b?.data?.donation, b?.transaction]) {
    if (!src || typeof src !== 'object') continue
    for (const k of ['amount_raw', 'amount', 'gross_amount', 'total_amount', 'total', 'nominal', 'price', 'amount_settled', 'net_amount']) {
      const n = amt(src[k]); if (Number.isFinite(n) && n > 0 && !(n <= best)) best = n
    }
  }
  return best
}
async function reconcile(o: any, uid: string) {
  if (o.activated || (o.status !== 'pending' && o.status !== 'expired')) return o
  try {
    const since = new Date(new Date(o.created_at).getTime() - 60000).toISOString()
    const { data: rows } = await admin.from('premium_webhook_log').select('id,payload,result')
      .gte('created_at', since).in('result', ['no_order', 'rejected:amount_too_low', 'rejected:ref_used']).order('id', { ascending: false }).limit(30)
    for (const row of rows || []) {
      const b: any = row.payload || {}
      const hay = JSON.stringify(b)
      const codes = hay.toUpperCase().match(/WP\d{6}[0-9A-F]{10}/g) || []
      const mine = codes.includes(String(o.order_id).toUpperCase())
      if (!mine && (codes.length > 0 || !hay.toLowerCase().includes(uid.toLowerCase()))) continue
      const a = payloadAmount(b)
      if (!Number.isFinite(a)) continue
      let idv = '', paidRaw = ''
      for (const src of [b, b?.data, b?.donation, b?.data?.donation, b?.transaction]) {
        if (!src || typeof src !== 'object') continue
        if (!idv) for (const k of ['donation_id', 'transaction_id', 'trx_id', 'id', 'order_id', 'invoice']) if (src[k]) { idv = String(src[k]); break }
        if (!paidRaw) for (const k of ['created_at', 'paid_at', 'paidAt', 'date']) if (src[k]) { paidRaw = String(src[k]); break }
      }
      const ref = idv ? `${idv}|${paidRaw}|${a}` : null
      const { data: r } = await admin.rpc('premium_activate_sb', { p_order: o.order_id, p_ref: ref, p_amount: a, p_paid: null })
      if (r?.ok && !r?.already) { await admin.from('premium_webhook_log').update({ result: 'reconciled', order_id: o.order_id }).eq('id', row.id); break }
    }
  } catch (e) { console.error('reconcile error', e) }
  return await rpc('premium_order_get', { p_order: o.order_id })
}
async function check(uid: string, orderId: unknown) {
  let o = await myOrder(orderId, uid)
  if (o.status === 'pending' || o.status === 'expired') o = await reconcile(o, uid)
  const st = o.status === 'pending' && o.expires_at && new Date(o.expires_at).getTime() + 120000 <= Date.now() ? 'expired' : o.status
  return view({ ...o, status: st })
}
async function cancel(uid: string, orderId: unknown) {
  const o = await myOrder(orderId, uid)
  await rpc('premium_order_cancel_sb', { p_order: o.order_id, p_user: uid })
  return view(await rpc('premium_order_get', { p_order: o.order_id }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail(405, 'Metode tidak diizinkan')
  const user = await authUser(req)
  if (!user) return fail(401, 'Login diperlukan')
  try {
    const b = await req.json().catch(() => ({}))
    if (b.action === 'create') return json(200, { ok: true, order: await create(user, b.plan_id) })
    if (b.action === 'pay_info') return json(200, { ok: true, order: await payInfo(user.id, b.order_id) })
    if (b.action === 'save_url') return json(200, { ok: true, order: await saveUrl(user.id, b.order_id, b.url) })
    if (b.action === 'save_qr') return json(200, { ok: true, order: await saveQr(user.id, b.order_id, b.qr) })
    if (b.action === 'check') return json(200, { ok: true, order: await check(user.id, b.order_id) })
    if (b.action === 'cancel') return json(200, { ok: true, order: await cancel(user.id, b.order_id) })
    return fail(400, 'Aksi tidak dikenal')
  } catch (e) {
    if (e instanceof Pub) return fail(400, e.message)
    console.error('premium error', e)
    return fail(500, 'Terjadi kesalahan. Coba lagi.')
  }
})
