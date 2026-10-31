import { supabase } from '../lib/supabase'
import { userName } from '../lib/format'

const db = () => {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi')
  return supabase
}
const S = (v) => String(v)

export async function listFavorites(uid) {
  const { data, error } = await db().from('favorites').select('*').eq('user_id', uid).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function isFavorite(uid, animeId) {
  const { data, error } = await db().from('favorites').select('anime_id').eq('user_id', uid).eq('anime_id', S(animeId)).maybeSingle()
  if (error) throw error
  return !!data
}
export async function addFavorite(uid, a) {
  const { error } = await db().from('favorites').upsert({ user_id: uid, anime_id: S(a.id), title: a.title, poster: a.poster || null }, { onConflict: 'user_id,anime_id' })
  if (error) throw error
}
export async function removeFavorite(uid, animeId) {
  const { error } = await db().from('favorites').delete().eq('user_id', uid).eq('anime_id', S(animeId))
  if (error) throw error
}

export async function listHistory(uid, limit = 100) {
  const { data, error } = await db().from('watch_history').select('*').eq('user_id', uid).order('updated_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}
export async function getEpisodeProgress(uid, episodeId) {
  const { data, error } = await db().from('watch_history').select('progress,duration').eq('user_id', uid).eq('episode_id', S(episodeId)).maybeSingle()
  if (error) throw error
  return data
}
export async function listWatchedIds(uid, animeId) {
  const { data, error } = await db().from('watch_history').select('episode_id').eq('user_id', uid).eq('anime_id', S(animeId))
  if (error) throw error
  return (data || []).map((r) => String(r.episode_id))
}
export async function getLastWatched(uid, animeId) {
  const { data, error } = await db().from('watch_history').select('*').eq('user_id', uid).eq('anime_id', S(animeId)).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}
export async function saveProgress(uid, r) {
  const { error } = await db().from('watch_history').upsert({
    user_id: uid,
    anime_id: S(r.animeId),
    episode_id: S(r.episodeId),
    episode_number: r.episodeNumber != null ? S(r.episodeNumber) : null,
    anime_title: r.title || null,
    anime_poster: r.poster || null,
    progress: Math.floor(r.progress || 0),
    duration: Math.floor(r.duration || 0),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,episode_id' })
  if (error) throw error
}
export async function deleteHistory(uid, episodeIds) {
  const { error } = await db().from('watch_history').delete().eq('user_id', uid).in('episode_id', episodeIds.map(S))
  if (error) throw error
}
export function latestPerAnime(rows) {
  const seen = new Set()
  return rows.filter((r) => (seen.has(r.anime_id) ? false : seen.add(r.anime_id)))
}

export async function listComments(episodeId, limit = 100) {
  let { data, error } = await db().from('comments').select('*').eq('episode_id', S(episodeId)).is('parent_id', null).order('created_at', { ascending: false }).limit(limit)
  if (error && /parent_id/.test(error.message || '')) {
    ;({ data, error } = await db().from('comments').select('*').eq('episode_id', S(episodeId)).order('created_at', { ascending: false }).limit(limit))
  }
  if (error) throw error
  return data || []
}
export async function listReplies(parentId, limit = 200) {
  const { data, error } = await db().from('comments').select('*').eq('parent_id', parentId).order('created_at', { ascending: true }).limit(limit)
  if (error) throw error
  return data || []
}
export async function addReply(user, { parentId, body }) {
  const m = user.user_metadata || {}
  const row = { parent_id: parentId, episode_id: '0', user_id: user.id, user_name: userName(user, 'User'), user_avatar: m.avatar_url || null, body }
  const { data, error } = await db().from('comments').insert(row).select().single()
  if (error) throw error
  return data
}
export async function getReplyCounts(ids) {
  const out = {}
  if (!ids || !ids.length) return out
  const { data, error } = await db().rpc('get_reply_counts', { p_ids: ids })
  if (error) return out
  ;(data || []).forEach((r) => { out[r.parent_id] = Number(r.n) })
  return out
}
export async function addComment(user, { episodeId, animeId, body, title, poster, episodeNumber }) {
  const m = user.user_metadata || {}
  const row = {
    episode_id: S(episodeId), anime_id: animeId != null ? S(animeId) : null, user_id: user.id,
    user_name: userName(user, 'User'),
    user_avatar: m.avatar_url || null, body,
    anime_title: title || null, anime_poster: poster || null, episode_number: episodeNumber != null ? S(episodeNumber) : null,
  }
  const { data, error } = await db().from('comments').insert(row).select().single()
  if (error) throw error
  return data
}
export async function deleteComment(id) {
  const { error } = await db().from('comments').delete().eq('id', id)
  if (error) throw error
}
export async function sendReport(uid, { animeId, episodeId, reason }) {
  const { error } = await db().from('reports').insert({ user_id: uid, anime_id: animeId != null ? S(animeId) : null, episode_id: episodeId != null ? S(episodeId) : null, reason })
  if (error) throw error
}

export async function getCommentBanners(ids) {
  const out = {}
  if (!ids || !ids.length) return out
  const { data, error } = await db().rpc('get_comment_banners', { p_ids: ids })
  if (error) throw error
  ;(data || []).forEach((r) => { out[r.user_id] = r.banner_url })
  return out
}

export async function getMyNumber(uid) {
  const { data, error } = await db().from('profiles').select('seq').eq('user_id', uid).maybeSingle()
  if (error) throw error
  if (data) return data.seq
  const r = await db().rpc('ensure_profile')
  if (r.error) throw r.error
  return r.data
}

export async function listChat(limit = 60) {
  const { data, error } = await db().from('global_messages').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data || []).reverse()
}
export async function sendChat(user, { body, reply }) {
  const row = { user_id: user.id, body, reply_to: reply ? reply.id : null }
  const { data, error } = await db().from('global_messages').insert(row).select().single()
  if (error) throw error
  return data
}
export async function getMyProfile(uid) {
  const { data, error } = await db().from('profiles').select('seq,role').eq('user_id', uid).maybeSingle()
  if (error) throw error
  if (data) return data
  const r = await db().rpc('ensure_profile')
  if (r.error) throw r.error
  return { seq: r.data, role: 'user' }
}
export async function deleteChat(id) {
  const { error } = await db().from('global_messages').delete().eq('id', id)
  if (error) throw error
}
export function subscribeChat(onInsert, onDelete, onStatus) {
  const ch = db().channel('global-chat')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_messages' }, (e) => onInsert(e.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'global_messages' }, (e) => onDelete(e.old))
    .subscribe((st) => onStatus && onStatus(st))
  return () => { db().removeChannel(ch) }
}

export async function listFeedback(channel, limit = 60) {
  const { data, error } = await db().from('feedback_messages').select('*').eq('channel', channel).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data || []).reverse()
}
export async function sendFeedback(user, { channel, body, reply }) {
  const row = { channel, user_id: user.id, body, reply_to: reply ? reply.id : null }
  const { data, error } = await db().from('feedback_messages').insert(row).select().single()
  if (error) throw error
  return data
}
export async function deleteFeedback(id) {
  const { error } = await db().from('feedback_messages').delete().eq('id', id)
  if (error) throw error
}
export async function feedbackSetStatus(id, status) {
  const { error } = await db().rpc('feedback_set_status', { p_id: id, p_status: status })
  if (error) throw new Error(error.message || 'Gagal mengubah status')
}
export function subscribeFeedback(channel, onInsert, onDelete, onStatus, onUpdate) {
  const ch = db().channel('feedback-' + channel + '-' + Math.random().toString(36).slice(2, 7))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feedback_messages', filter: `channel=eq.${channel}` }, (e) => onInsert(e.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'feedback_messages', filter: `channel=eq.${channel}` }, (e) => onUpdate && onUpdate(e.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'feedback_messages' }, (e) => onDelete(e.old))
    .subscribe((st) => onStatus && onStatus(st))
  return () => { db().removeChannel(ch) }
}

export async function mentionPreview(seqs) {
  const { data, error } = await db().rpc('mention_preview', { p_seqs: seqs })
  if (error) throw error
  return data || []
}

export async function getPublicProfile(uid) {
  const { data, error } = await db().rpc('get_public_profile', { p_uid: uid })
  if (error) throw error
  return Array.isArray(data) ? data[0] || null : data || null
}
export async function getPublicHistory(uid, limit = 40) {
  const { data, error } = await db().rpc('get_public_history', { p_uid: uid, p_limit: limit })
  if (error) throw error
  return data || []
}
export async function listUserComments(uid, limit = 40) {
  const { data, error } = await db().rpc('get_public_comments', { p_uid: uid, p_limit: limit })
  if (error) throw error
  return data || []
}
export async function setMyBanner(url) {
  const { error } = await db().rpc('set_my_banner', { p_url: url || '' })
  if (error) throw error
}
export async function getUserSeqs(ids) {
  const out = {}
  if (!ids || !ids.length) return out
  const { data, error } = await db().rpc('get_user_seqs', { p_ids: ids })
  if (error) throw error
  ;(data || []).forEach((r) => { out[r.user_id] = r.seq })
  return out
}

export async function addView(animeId, episodeId) {
  const { data, error } = await db().rpc('add_view', { p_anime: String(animeId), p_episode: String(episodeId) })
  if (error) throw error
  return !!data
}
export async function getAnimeViews(ids) {
  const { data, error } = await db().rpc('get_anime_views', { p_ids: ids })
  if (error) throw error
  return data || []
}
export async function getTopAnimeByViews(limit = 10) {
  const { data, error } = await db().rpc('top_anime_by_views', { p_limit: limit })
  if (error) throw error
  return (data || []).map((r) => ({ id: String(r.id), views: Number(r.views) || 0 }))
}
export async function getEpisodeViews(ids) {
  const { data, error } = await db().rpc('get_episode_views', { p_ids: ids })
  if (error) throw error
  return data || []
}

export async function findFriend(seq) {
  const { data, error } = await db().rpc('find_friend', { p_seq: seq })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) || null
}
export async function sendFriendRequest(uid) {
  const { data, error } = await db().rpc('friend_request', { p_target: uid })
  if (error) throw error
  return data
}
export async function respondFriend(id, accept) {
  const { error } = await db().rpc('friend_respond', { p_id: id, p_accept: !!accept })
  if (error) throw error
}
export async function cancelFriendRequest(id) {
  const { error } = await db().rpc('friend_cancel', { p_id: id })
  if (error) throw error
}
export async function removeFriend(uid) {
  const { error } = await db().rpc('friend_remove', { p_other: uid })
  if (error) throw error
}
export async function listFriends() {
  const { data, error } = await db().rpc('get_friends')
  if (error) throw error
  return data || []
}
export async function listFriendRequests() {
  const { data, error } = await db().rpc('get_friend_requests')
  if (error) throw error
  return data || []
}
export async function getSocialBadge() {
  const { data, error } = await db().rpc('get_social_badge')
  if (error) throw error
  const r = (Array.isArray(data) ? data[0] : data) || {}
  return { requests: Number(r.requests) || 0, unread: Number(r.unread) || 0 }
}
export async function listFriendFeed() {
  const { data, error } = await db().rpc('get_friend_feed', { p_hours: 24 })
  if (error) throw error
  return data || []
}

export async function listPinnedFeed() {
  const { data, error } = await db().rpc('get_pinned_feed')
  if (error) return []
  return data || []
}
export async function setCommentPin(id, on) {
  const { data, error } = await db().rpc(on ? 'pin_comment' : 'unpin_comment', { p_id: id })
  if (error) throw error
  return data || { ok: false, code: 'UNKNOWN' }
}

export async function listDM(me, peer, limit = 100) {
  const { data, error } = await db().from('direct_messages').select('*')
    .or(`and(sender.eq.${me},receiver.eq.${peer}),and(sender.eq.${peer},receiver.eq.${me})`)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data || []).reverse()
}
export async function sendDM(me, peer, body) {
  const { data, error } = await db().from('direct_messages').insert({ sender: me, receiver: peer, body }).select().single()
  if (error) throw error
  return data
}
export async function deleteDM(id) {
  const { error } = await db().from('direct_messages').delete().eq('id', id)
  if (error) throw error
}
export async function markDMRead(peer) {
  const { error } = await db().rpc('dm_mark_read', { p_peer: peer })
  if (error) throw error
}
export function subscribeDM(me, onInsert, onDelete, onStatus, onUpdate) {
  const ch = db().channel('dm-' + me + '-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (e) => onInsert(e.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, (e) => onDelete(e.old))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, (e) => onUpdate && onUpdate(e.new))
    .subscribe((st) => onStatus && onStatus(st))
  return () => { db().removeChannel(ch) }
}
