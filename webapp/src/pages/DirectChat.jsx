import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { listDM, sendDM, deleteDM, markDMRead, subscribeDM, removeFriend } from '../services/db'
import { fmtClock, fmtDateId } from '../lib/format'
import { useStaffRoles } from '../lib/roles'
import Icon from '../components/Icon'
import { Avatar, UserFace, AutoTextarea } from '../components/ui'
import RoleBadge from '../components/RoleBadge'
import ActionSheet from '../components/ActionSheet'
import { copyText } from '../lib/clipboard'
import { useStickBottom } from '../lib/stickbottom'

function dayLabel(iso) {
  const d = new Date(iso), n = new Date()
  if (d.toDateString() === n.toDateString()) return 'Hari ini'
  const y = new Date(n); y.setDate(n.getDate() - 1)
  return d.toDateString() === y.toDateString() ? 'Kemarin' : fmtDateId(iso)
}

const Msg = memo(function Msg({ m, me, onMenu }) {
  const timer = useRef(null)
  const start = () => { timer.current = setTimeout(() => { onMenu(m, me) }, 450) }
  const stop = () => clearTimeout(timer.current)
  return (
    <div className={`dm-row ${me ? 'mine' : ''}`}>
      <div className="dm-bubble" onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}>
        <p>{m.body}</p>
        <span className="dm-time">{fmtClock(m.created_at)}{me && <em className={m.read_at ? 'read' : ''}>{m.read_at ? ' ✓✓' : ' ✓'}</em>}</span>
      </div>
    </div>
  )
})

export default function DirectChat({ uid, name, avatar, seq }) {
  const { user, nav } = useApp()
  const roles = useStaffRoles()
  const [msgs, setMsgs] = useState(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)
  const [online, setOnline] = useState(false)
  const [menu, setMenu] = useState(false)
  const list = useRef(null)
  const stick = useStickBottom(list, msgs)
  const [sheet, setSheet] = useState(null)
  const [toast, setToast] = useState('')
  const openMenu = useCallback((m, mine) => setSheet({ m, mine }), [])

  const add = useCallback((row) => setMsgs((l) => (!l || l.some((x) => x.id === row.id) ? l : [...l, row])), [])

  useEffect(() => {
    let alive = true
    listDM(user.id, uid).then((r) => { if (!alive) return; setMsgs(r); markDMRead(uid).catch(() => {}) }).catch((e) => { if (alive) { setMsgs([]); setErr(e?.message || 'Chat belum tersedia') } })
    const off = subscribeDM(
      user.id,
      (row) => {
        if (!alive) return
        const mine = row.sender === user.id && row.receiver === uid
        const theirs = row.sender === uid && row.receiver === user.id
        if (!mine && !theirs) return
        add(row)
        if (theirs) markDMRead(uid).catch(() => {})
      },
      (old) => alive && setMsgs((l) => l && l.filter((x) => x.id !== old.id)),
      (st) => alive && setOnline(st === 'SUBSCRIBED'),
      (row) => alive && setMsgs((l) => l && l.map((x) => (x.id === row.id ? { ...x, read_at: row.read_at } : x)))
    )
    return () => { alive = false; off() }
  }, [user.id, uid, add])


  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try { const row = await sendDM(user.id, uid, body); stick.current = true; add(row); setText(''); setErr('') }
    catch (e) { setErr(e?.message || 'Gagal mengirim pesan') }
    setSending(false)
  }
  const remove = useCallback(async (m) => {
    if (!window.confirm('Hapus pesan ini?')) return
    try { await deleteDM(m.id); setMsgs((l) => l.filter((x) => x.id !== m.id)) } catch { setErr('Gagal menghapus pesan') }
  }, [])
  async function unfriend() {
    setMenu(false)
    if (!window.confirm(`Hapus ${name} dari daftar teman?`)) return
    try { await removeFriend(uid); nav.back() } catch (e) { setErr(e?.message || 'Gagal menghapus teman') }
  }

  let lastDay = ''
  return (
    <div className="gc-page">
      <div className="gc-head dm-head">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
        <button className="dm-who" onClick={() => nav.push('userprofile', { uid, name, avatar, seq })}>
          <UserFace url={avatar} name={name} size={38} uid={uid} />
          <div><b>{name}<RoleBadge role={roles[uid]} uid={uid} /></b><span>{seq != null ? `#${seq} · ` : ''}{online ? 'Online' : 'Menyambung…'}</span></div>
        </button>
        <button className="iconbtn" onClick={() => setMenu((v) => !v)} aria-label="Menu"><Icon name="more" size={22} /></button>
        {menu && <div className="dm-menu"><button onClick={unfriend}>Hapus teman</button></div>}
      </div>

      <div className="gc-list dm-list" ref={list}>
        {msgs === null && <p className="muted gc-empty">Memuat pesan...</p>}
        {msgs && msgs.length === 0 && !err && <p className="muted gc-empty">Belum ada pesan. Sapa {name}!</p>}
        {msgs && msgs.map((m) => {
          const d = dayLabel(m.created_at), head = d !== lastDay
          lastDay = d
          return <div key={m.id}>{head && <div className="dm-day"><span>{d}</span></div>}<Msg m={m} me={m.sender === user.id} onMenu={openMenu} /></div>
        })}
        {err && <p className="muted small gc-empty">{err}</p>}
      </div>

      {toast && <div className="cn-toast">{toast}</div>}
      {sheet && (
        <ActionSheet
          onClose={() => setSheet(null)}
          items={[
            { icon: 'copy', label: 'Salin teks', onClick: async () => { setToast((await copyText(sheet.m.body)) ? 'Teks disalin' : 'Gagal menyalin'); setTimeout(() => setToast(''), 1800) } },
            sheet.mine && { icon: 'trash', label: 'Hapus pesan', danger: true, onClick: () => remove(sheet.m) },
          ]}
        />
      )}
      <div className="gc-input">
        <Avatar user={user} size={44} />
        <AutoTextarea value={text} maxLength={500} placeholder={`Pesan untuk ${name}...`} onChange={(e) => setText(e.target.value)} />
        <button className="cm-send" disabled={!text.trim() || sending} onClick={send} aria-label="Kirim"><Icon name="send" size={20} /></button>
      </div>
    </div>
  )
}
