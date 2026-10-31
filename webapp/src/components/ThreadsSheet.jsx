import { ClanTag } from './ClanBadge'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { listReplies, addReply, deleteComment, getUserSeqs } from '../services/db'
import { useStaffRoles } from '../lib/roles'
import { fmtAgo } from '../lib/format'
import { levelInfo, getXps } from '../lib/xp'
import Icon from './Icon'
import { Avatar, UserFace, AutoTextarea } from './ui'
import RoleBadge from './RoleBadge'
import PremiumBadge from './PremiumBadge'
import RolePill from './RolePill'
import LevelBadge from './LevelBadge'
import CmBg from './CmBg'
import { useCmBanner } from '../lib/cmbanner'

function Row({ c, meta, role, big, canDelete, onReply, onDelete, onProfile }) {
  const bg = useCmBanner(c.user_id)
  return (
    <div className={`th-row ${big ? 'big' : ''} ${bg ? 'cm-bgd' : ''}`}>
      {bg && <CmBg url={bg} />}
      <button className="th-face" onClick={onProfile} aria-label="Profil"><UserFace url={c.user_avatar} name={c.user_name} size={big ? 44 : 36} uid={c.user_id} /></button>
      <div className="th-main">
        <div className="th-head">
          <b onClick={onProfile}>{c.user_name || 'User'}</b><RoleBadge role={role} uid={c.user_id} part="check" />
          {meta.seq != null && <span className="th-seq">#{meta.seq}</span>}
          <RoleBadge role={role} uid={c.user_id} part="capsule" /><PremiumBadge uid={c.user_id} />
          <span className="th-when">{fmtAgo(c.created_at)}</span>
        </div>
        <div className="th-badges"><ClanTag uid={c.user_id} /><RolePill role={role} /><LevelBadge level={levelInfo(meta.xp || 0).level} role={role} /></div>
        <p>{c.body}</p>
        <div className="th-acts">
          {onReply && <button className="th-link" onClick={onReply}>Reply</button>}
          {canDelete && <button className="th-del" onClick={onDelete} aria-label="Hapus"><Icon name="trash" size={16} /></button>}
        </div>
      </div>
    </div>
  )
}

export default function ThreadsSheet({ parent, onClose, onCount, onProfile, hideNav }) {
  const { user } = useApp()
  const roles = useStaffRoles()
  const [replies, setReplies] = useState(null)
  const [meta, setMeta] = useState({ seq: {}, xp: {} })
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const asked = useRef(new Set())
  const listEl = useRef(null)
  const isStaff = !!roles[user.id]

  useEffect(() => {
    if (!hideNav) return undefined
    const el = document.documentElement
    el.classList.add('th-hidenav')
    return () => el.classList.remove('th-hidenav')
  }, [hideNav])

  useEffect(() => {
    let alive = true
    listReplies(parent.id).then((r) => alive && setReplies(r)).catch((e) => { if (alive) { setReplies([]); setErr(e?.message || 'Balasan belum tersedia') } })
    return () => { alive = false }
  }, [parent.id])

  useEffect(() => {
    const ids = [...new Set([parent.user_id, ...(replies || []).map((r) => r.user_id)])].filter((id) => !asked.current.has(id))
    if (!ids.length) return
    ids.forEach((id) => asked.current.add(id))
    Promise.all([getUserSeqs(ids).catch(() => ({})), getXps(ids).catch(() => ({}))])
      .then(([seq, xp]) => setMeta((m) => ({ seq: { ...m.seq, ...seq }, xp: { ...m.xp, ...xp } })))
  }, [replies, parent.user_id])

  const send = useCallback(async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const row = await addReply(user, { parentId: parent.id, body })
      setReplies((l) => { const n = [...(l || []), row]; onCount && onCount(parent.id, n.length); return n })
      setText(''); setErr('')
      setTimeout(() => { const el = listEl.current; if (el) el.scrollTop = el.scrollHeight }, 50)
    } catch (e) { setErr(e?.message || 'Gagal mengirim balasan') }
    setSending(false)
  }, [text, sending, user, parent.id, onCount])

  async function remove(r) {
    if (!window.confirm('Hapus balasan ini?')) return
    try { await deleteComment(r.id); setReplies((l) => { const n = l.filter((x) => x.id !== r.id); onCount && onCount(parent.id, n.length); return n }) } catch { setErr('Gagal menghapus balasan') }
  }

  const profile = (c) => onProfile && onProfile(c)
  const parentMeta = { seq: parent.seq ?? meta.seq[parent.user_id], xp: parent.xp ?? meta.xp[parent.user_id] }
  return (
    <div className="th-bg" onClick={onClose}>
      <div className="th-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="th-grip" onClick={onClose} aria-label="Tutup"><i /></button>
        <h3 className="th-title">Threads</h3>
        <div className="th-list" ref={listEl}>
          <Row c={parent} meta={parentMeta} role={roles[parent.user_id] || parent.role} big onProfile={() => profile(parent)} />
          <div className="th-sep">{replies ? (replies.length ? `${replies.length} balasan` : 'Belum ada balasan') : 'Memuat balasan…'}</div>
          {(replies || []).map((r) => (
            <Row key={r.id} c={r} meta={{ seq: meta.seq[r.user_id], xp: meta.xp[r.user_id] }} role={roles[r.user_id]}
              canDelete={r.user_id === user.id || isStaff}
              onReply={() => setText((t) => (t.startsWith(`@${r.user_name} `) ? t : `@${r.user_name} ${t}`))}
              onDelete={() => remove(r)} onProfile={() => profile(r)} />
          ))}
          {err && <p className="muted small" style={{ padding: '8px 4px' }}>{err}</p>}
        </div>
        <div className="th-input">
          <Avatar user={user} size={40} />
          <AutoTextarea value={text} maxLength={500} placeholder="Tulis balasan..." onChange={(e) => setText(e.target.value)} />
          <button className="cm-send" disabled={!text.trim() || sending} onClick={send} aria-label="Kirim"><Icon name="send" size={20} /></button>
        </div>
      </div>
    </div>
  )
}
