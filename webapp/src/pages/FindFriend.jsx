import { useState } from 'react'
import { useApp } from '../context'
import { findFriend, sendFriendRequest, respondFriend, cancelFriendRequest } from '../services/db'
import { parseUserId, lvOf } from '../lib/social'
import { useStaffRoles } from '../lib/roles'
import Icon from '../components/Icon'
import { UserFace } from '../components/ui'
import RoleBadge from '../components/RoleBadge'
import RolePill from '../components/RolePill'
import { ClanTag } from '../components/ClanBadge'
import LevelBadge from '../components/LevelBadge'

export default function FindFriend() {
  const { nav } = useApp()
  const roles = useStaffRoles()
  const [val, setVal] = useState('')
  const [res, setRes] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function search() {
    const n = parseUserId(val)
    setRes(null)
    if (n == null) return setMsg('Masukkan ID berupa angka, contoh: 1')
    setBusy(true); setMsg('')
    try {
      const r = await findFriend(n)
      if (!r) setMsg(`ID #${n} tidak ditemukan`)
      else setRes(r)
    } catch (e) { setMsg(e?.message || 'Gagal mencari') }
    setBusy(false)
  }

  async function run(fn) {
    setBusy(true); setMsg('')
    try { await fn(); const r = await findFriend(res.seq); setRes(r) } catch (e) { setMsg(e?.message || 'Gagal') }
    setBusy(false)
  }

  const role = res ? roles[res.user_id] || (res.role !== 'user' ? res.role : undefined) : undefined
  return (
    <div className="cn-page">
      <div className="cn-head">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
        <h1>Cari Teman</h1>
      </div>

      <div className="ff-bar">
        <input
          value={val} inputMode="numeric" autoFocus placeholder="User ID"
          onChange={(e) => setVal(e.target.value.replace(/[^\d#]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button className="ff-go" onClick={search} disabled={busy || !val.trim()}>Cari</button>
      </div>

      {msg && <p className="cn-empty">{msg}</p>}

      {res && (
        <div className="cn-card ff-res">
          <div className="cn-main">
            <button className="cn-face" onClick={() => nav.push('userprofile', { uid: res.user_id, name: res.name, avatar: res.avatar, seq: res.seq })}><UserFace url={res.avatar} name={res.name} size={56} uid={res.user_id} /></button>
            <div className="cn-info">
              <div className="cn-name"><b>{res.name}</b><RoleBadge role={role} uid={res.user_id} part="check" /><span className="cn-seq">#{res.seq}</span><RoleBadge role={role} uid={res.user_id} part="capsule" /></div>
              <div className="cn-meta"><ClanTag uid={res.user_id} /><RolePill role={role} /><LevelBadge level={lvOf(res.xp)} role={role} dot /></div>
            </div>
          </div>
          <div className="cn-actions">
            {res.relation === 'none' && <button className="cn-btn primary" disabled={busy} onClick={() => run(() => sendFriendRequest(res.user_id))}>Tambah Teman</button>}
            {res.relation === 'sent' && <>
              <button className="cn-btn" disabled>Menunggu konfirmasi</button>
              <button className="cn-btn" disabled={busy} onClick={() => run(() => cancelFriendRequest(res.request_id))}>Batal</button>
            </>}
            {res.relation === 'received' && <>
              <button className="cn-btn primary" disabled={busy} onClick={() => run(() => respondFriend(res.request_id, true))}>Accept</button>
              <button className="cn-btn" disabled={busy} onClick={() => run(() => respondFriend(res.request_id, false))}>Reject</button>
            </>}
            {res.relation === 'friend' && <button className="cn-btn primary" onClick={() => nav.push('dm', { uid: res.user_id, name: res.name, avatar: res.avatar, seq: res.seq })}>Sudah berteman · Chat</button>}
          </div>
        </div>
      )}
    </div>
  )
}
