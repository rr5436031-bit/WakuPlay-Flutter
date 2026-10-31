import { supabase } from '../lib/supabase'

const db = () => { if (!supabase) throw new Error('Supabase belum dikonfigurasi'); return supabase }

export async function listClanChat(clanId, limit = 60) {
  const { data, error } = await db().from('clan_messages').select('*').eq('clan_id', clanId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data || []).reverse()
}
export async function sendClanChat(user, { clanId, body, reply }) {
  const row = { clan_id: clanId, user_id: user.id, body, reply_to: reply ? reply.id : null }
  const { data, error } = await db().from('clan_messages').insert(row).select().single()
  if (error) throw error
  return data
}
export async function deleteClanChat(id) {
  const { error } = await db().from('clan_messages').delete().eq('id', id)
  if (error) throw error
}
export function subscribeClanChat(clanId, onInsert, onDelete, onStatus) {
  const ch = db().channel('clan-chat-' + clanId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clan_messages', filter: `clan_id=eq.${clanId}` }, (e) => onInsert(e.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clan_messages' }, (e) => onDelete(e.old))
    .subscribe((st) => onStatus && onStatus(st))
  return () => { db().removeChannel(ch) }
}
