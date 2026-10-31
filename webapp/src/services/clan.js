import { supabase } from '../lib/supabase'
import { callFn } from './borders'

async function rpc(name, args) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message || 'Terjadi kesalahan')
  return data
}
export const newReq = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) }))

export const getGold = () => rpc('wp_gold')
export const clanOverview = () => rpc('clan_overview')
export const clanTop = (q, limit = 50) => rpc('clan_top', { p_q: q || null, p_limit: limit })
export const clanDetail = (id) => rpc('clan_detail', { p_id: id })
export const clanMembers = (id, q) => rpc('clan_members_list', { p_clan: id, p_q: q || null })
export const clanDonations = (id) => rpc('clan_donations_list', { p_clan: id, p_limit: 50 })
export const clanRequests = (id) => rpc('clan_requests_list', { p_clan: id })
export const clanLog = (id) => rpc('clan_log_list', { p_clan: id, p_limit: 30 })
export const clanColors = (id) => rpc('clan_colors_list', { p_clan: id })

export const clanCreate = (tag, name, req) => rpc('clan_create', { p_tag: tag, p_name: name, p_req: req })
export const clanJoin = (id, req) => rpc('clan_join', { p_clan: id, p_req: req })
export const clanCancelRequest = (id) => rpc('clan_request_cancel', { p_clan: id })
export const clanRespond = (id, accept) => rpc('clan_request_respond', { p_id: id, p_accept: accept })
export const clanSetJoinMode = (mode) => rpc('clan_set_join_mode', { p_mode: mode })
export const clanSetBanner = (url) => rpc('clan_set_banner', { p_url: url || null })
export const clanLeave = () => rpc('clan_leave')
export const clanKick = (uid) => rpc('clan_kick', { p_user: uid })
export const clanSetRole = (uid, role) => rpc('clan_set_role', { p_user: uid, p_role: role })
export const clanTransfer = (uid) => rpc('clan_transfer', { p_user: uid })
export const clanDisband = () => rpc('clan_disband')
export const clanDonate = (gold, req) => rpc('clan_donate', { p_gold: gold, p_req: req })
export const clanBuySlots = (req) => rpc('clan_buy_slots', { p_req: req })
export const clanUpgradeTier = (req) => rpc('clan_upgrade_tier', { p_req: req })
export const clanSpin = (req) => rpc('clan_spin', { p_req: req })
export const clanSetColor = (colorId) => rpc('clan_set_color', { p_color: colorId })
export const clanOfUser = (uid) => rpc('clan_of_user', { p_uid: uid })
export const clanBadgesRpc = (uids) => rpc('clan_badges', { p_uids: uids })
export const clanSpin5 = (req) => rpc('clan_spin5', { p_req: req })
export const clanEmblems = (id) => rpc('clan_emblems_list', { p_clan: id })
export const clanEmblemSpin = (req, count) => rpc('clan_emblem_spin', { p_req: req, p_count: count })
export const clanSetEmblem = (emblemId) => rpc('clan_set_emblem', { p_emblem: emblemId ?? null })
export const devEmblemList = () => rpc('clan_emblem_dev_list')
export const devEmblemSave = ({ id, name, rarity, url, active = true }) => rpc('clan_emblem_dev_save', { p_id: id ?? null, p_name: name, p_rarity: rarity, p_url: url, p_active: active })
export const devEmblemDelete = (id) => rpc('clan_emblem_dev_delete', { p_id: id })

export const EMB_MAX = 2 * 1024 * 1024
export const EMB_GITHUB_RE = /^https:\/\/raw\.githubusercontent\.com\/rr5436031-bit\/wakuplay-avatar-borders\/.+\/Emblem\/[A-Za-z0-9._-]+\.(gif|jpe?g|png|webp)$/
function imgSize(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image()
    im.onload = () => { res([im.naturalWidth, im.naturalHeight]); URL.revokeObjectURL(u) }
    im.onerror = () => { rej(new Error('Gambar tidak bisa dibaca')); URL.revokeObjectURL(u) }
    im.src = u
  })
}
export async function uploadEmblemImage(file) {
  if (!file) throw new Error('Pilih file dulu')
  if (!['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('File harus .png / .webp / .gif / .jpg')
  if (file.size <= 0) throw new Error('File kosong')
  if (file.size > EMB_MAX) throw new Error(`Ukuran emblem maksimal 2 MB (ini ${(file.size / 1048576).toFixed(1)} MB)`)
  const [w, h] = await imgSize(file)
  if (Math.min(w, h) < 64) throw new Error(`Emblem terlalu kecil (${w}x${h}). Minimal 64px`)
  if (Math.max(w, h) > 1024) throw new Error(`Emblem terlalu besar (${w}x${h}). Maksimal 1024px`)
  if (Math.max(w, h) / Math.min(w, h) > 3) throw new Error(`Rasio emblem terlalu ekstrem (${w}x${h}). Maksimal 3:1`)
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const fd = new FormData()
  fd.append('kind', 'emblem')
  fd.append('file', file, `emblem.${ext}`)
  fd.append('name', file.name || '')
  const d = await callFn(fd)
  if (!d.url) throw new Error('Server tidak mengembalikan link gambar')
  return d.url
}
export async function removeEmblemImage(url) {
  if (!EMB_GITHUB_RE.test(url || '')) return true
  try { await callFn({ action: 'delete', url }); return true } catch { return false }
}
export const devClanList = (q) => rpc('dev_clan_list', { p_q: q || null, p_limit: 100 })
export const devClanXp = (id, amount, mode) => rpc('dev_clan_xp_adjust', { p_clan: id, p_amount: amount, p_mode: mode })
export const devClanTier = (id, tier) => rpc('dev_clan_set_tier', { p_clan: id, p_tier: tier })
export const devClanTotalXp = (id, amount, mode) => rpc('dev_clan_total_xp_adjust', { p_clan: id, p_amount: amount, p_mode: mode })
export const clanDailyStatus = () => rpc('clan_daily_status')
export const clanDailyClaim = (req) => rpc('clan_daily_claim', { p_req: req })
export const devClanDailyGet = () => rpc('dev_clan_daily_get')
export const devClanDailySave = (enabled, hours, tiers) => rpc('dev_clan_daily_save', { p_enabled: enabled, p_hours: hours, p_tiers: tiers })
export const devClanDailyReset = (id) => rpc('dev_clan_daily_reset', { p_clan: id })
