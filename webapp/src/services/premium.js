import { supabase } from '../lib/supabase'

const FN = (import.meta.env.VITE_PREMIUM_FN || 'premium').trim()

async function rpc(name, args) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message || 'Terjadi kesalahan')
  return data
}

async function call(action, payload) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.functions.invoke(FN, { body: { action, ...payload } })
  if (error) {
    const res = error.context
    let msg
    if (res && typeof res.status === 'number') {
      let detail = ''
      try { const j = await res.json(); detail = j?.error || j?.message || '' } catch { }
      msg = detail ? `${detail} (kode ${res.status})` : `Server pembayaran membalas kode ${res.status}`
    } else {
      msg = `Tidak bisa menghubungi server pembayaran. Cek internet lalu coba lagi. (${error.name || 'error'})`
    }
    throw new Error(msg)
  }
  if (!data?.ok) throw new Error(data?.error || 'Terjadi kesalahan')
  return data.order
}

export const premiumOverview = () => rpc('premium_overview')
export const premiumOrders = () => rpc('premium_orders_me', { p_limit: 20 })
export const premiumOf = (ids) => rpc('premium_of', { p_ids: ids })
export const premiumSaveQr = (orderId, qr) => call('save_qr', { order_id: orderId, qr })
export const giftInfo = () => rpc('premium_gift_info')
export const giftXpInfo = () => rpc('gift_xp_info')
export const giveawayXpInfo = () => rpc('giveaway_xp_info')
export const devGiveawayXpGet = () => rpc('dev_giveaway_xp_get')
export const devGiveawayXpSet = (perDay, cap) => rpc('dev_giveaway_xp_set', { p_xp_per_day: perDay, p_daily_cap: cap })
export const giftSend = (toUid, days) => rpc('premium_gift_send', { p_to: toUid, p_days: days })
export const giveawayCreate = (days, slots, note) => rpc('giveaway_create', { p_days: days, p_slots: slots, p_note: note || '' })
export const giveawayClaim = (gid) => rpc('giveaway_claim', { p_gid: gid })
export const giveawayStates = (ids) => rpc('giveaway_states', { p_ids: ids })
export const giveawaySweep = () => rpc('giveaway_sweep')
export function subscribeGiveaways(onChange) {
  if (!supabase) return () => {}
  const ch = supabase.channel('giveaways').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'giveaways' }, (e) => onChange(e.new)).subscribe()
  return () => { supabase.removeChannel(ch) }
}
export const premiumCreate = (planId) => call('create', { plan_id: planId })
export const premiumCheck = (orderId) => call('check', { order_id: orderId })
export const premiumCancel = (orderId) => call('cancel', { order_id: orderId })
export const premiumPayInfo = (orderId) => call('pay_info', { order_id: orderId })
export const premiumSaveUrl = (orderId, url) => call('save_url', { order_id: orderId, url })

export const devPremiumOverview = () => rpc('dev_premium_overview')
export const devPremiumPlanSave = (p) => rpc('dev_premium_plan_save', { p_id: p.id, p_name: p.name, p_days: p.days, p_price: p.price, p_bonus: p.bonus, p_active: p.active, p_sort: p.sort })
export const devPremiumPlanDelete = (id) => rpc('dev_premium_plan_delete', { p_id: id })
export const devPremiumBenefits = (text) => rpc('dev_premium_benefits_set', { p_text: text })
export const devPremiumInfo = (uid) => rpc('dev_premium_info', { p_target: uid })
export const devPremiumGift = (uid, days, mode) => rpc('dev_premium_gift', { p_target: uid, p_days: days, p_mode: mode })
