import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context'
import { useApi } from '../hooks/useApi'
import { listFriends, listFriendRequests, respondFriend, cancelFriendRequest, subscribeDM } from '../services/db'
import { useStaffRoles } from '../lib/roles'
import { lvOf } from '../lib/social'
import Icon from '../components/Icon'
import { UserFace } from '../components/ui'
import RoleBadge from '../components/RoleBadge'
import RolePill from '../components/RolePill'
import { ClanTag } from '../components/ClanBadge'
import LevelBadge from '../components/LevelBadge'

function Person({ f, role, children, onOpen }) {
  return (
    <div className="cn-card">
      <div className="cn-main">
        <button className="cn-face" onClick={onOpen} aria-label="Lihat profil"><UserFace url={f.avatar} name={f.name} size={52} uid={f.user_id} /></button>
        <div className="cn-info">
          <div className="cn-name"><b>{f.name}</b><RoleBadge role={role} uid={f.user_id} part="check" />{f.seq != null && <span className="cn-seq">#{f.seq}</span>}<RoleBadge role={role} uid={f.user_id} part="capsule" /></div>
          <div className="cn-meta">
            <ClanTag uid={f.user_id} />
            <RolePill role={role} />
            <LevelBadge level={lvOf(f.xp)} role={role} dot />
          </div>
        </div>
        {children.side}
      </div>
      {children.below}
    </div>
  )
}

export default function Connections() {
  const { user, nav, focusKey } = useApp()
  const roles = useStaffRoles()
  const [tab, setTab] = useState('friends')
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [info, setInfo] = useState(false)
  const [busy, setBusy] = useState(0)
  const [toast, setToast] = useState('')
  const friends = useApi(() => listFriends(), [focusKey])
  const reqs = useApi(() => listFriendRequests(), [focusKey])

  useEffect(() => {
    let off = () => {}
    try { off = subscribeDM(user.id, () => friends.retry(), () => {}) } catch { }
    return () => off()
  }, [user.id])

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200) }
  const openProfile = (f) => nav.push('userprofile', { uid: f.user_id, name: f.name, avatar: f.avatar, seq: f.seq })
  const openChat = (f) => nav.push('dm', { uid: f.user_id, name: f.name, avatar: f.avatar, seq: f.seq })

  const act = useCallback(async (fn, okMsg) => {
    setBusy((n) => n + 1)
    try { await fn(); okMsg && flash(okMsg) } catch (e) { flash(e?.message || 'Gagal') }
    setBusy((n) => n - 1)
    friends.retry(); reqs.retry()
  }, [])

  const incoming = (reqs.data || []).filter((r) => r.direction === 'in')
  const outgoing = (reqs.data || []).filter((r) => r.direction === 'out')
  const list = (friends.data || []).filter((f) => !q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase()) || String(f.seq) === q.trim().replace(/^#/, ''))

  return (
    <div className="cn-page">
      <div className="cn-head">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
        <h1>Friend</h1>
        <button className="iconbtn" onClick={() => setInfo(true)} aria-label="Info"><Icon name="info" size={26} solid /></button>
        <button className={`iconbtn ${searching ? 'on' : ''}`} onClick={() => { setSearching((v) => !v); setQ('') }} aria-label="Cari teman"><Icon name="search" size={26} /></button>
        <button className="iconbtn" onClick={() => nav.push('findfriend')} aria-label="Tambah teman"><Icon name="adduser" size={26} /></button>
      </div>

      <div className="cn-tabs">
        <button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>Teman</button>
        <button className={tab === 'req' ? 'on' : ''} onClick={() => setTab('req')}>Permintaan{incoming.length > 0 && <i className="cn-dot">{incoming.length}</i>}</button>
      </div>

      {searching && tab === 'friends' && (
        <div className="cn-search"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau ID teman" /></div>
      )}

      <div className="cn-scroll">
        {tab === 'friends' && <>
          {friends.loading && !friends.data && <p className="cn-empty">Memuat…</p>}
          {friends.error && <p className="cn-empty">Gagal memuat teman. <button className="link" onClick={friends.retry}>Coba lagi</button><br /><span className="small">Pastikan supabase/teman-chat.sql sudah dijalankan.</span></p>}
          {friends.data && !list.length && <p className="cn-empty">{q ? 'Teman tidak ditemukan' : 'Belum ada teman. Ketuk ikon tambah teman di kanan atas.'}</p>}
          {list.map((f) => (
            <Person key={f.user_id} f={f} role={roles[f.user_id] || (f.role !== 'user' ? f.role : undefined)} onOpen={() => openProfile(f)}>
              {{ side: (
                <button className="cn-chat" onClick={() => openChat(f)} aria-label={`Chat ${f.name}`}>
                  <Icon name="chat" size={30} />
                  {Number(f.unread) > 0 && <i className="cn-dot abs">{Number(f.unread) > 99 ? '99+' : f.unread}</i>}
                </button>
              ) }}
            </Person>
          ))}
        </>}

        {tab === 'req' && <>
          <h3 className="cn-sec">Permintaan Masuk</h3>
          {!incoming.length && <p className="cn-empty small">Tidak ada permintaan masuk</p>}
          {incoming.map((r) => (
            <Person key={r.id} f={r} role={roles[r.user_id] || (r.role !== 'user' ? r.role : undefined)} onOpen={() => openProfile(r)}>
              {{ below: (
                <div className="cn-actions">
                  <button className="cn-btn primary" disabled={busy > 0} onClick={() => act(() => respondFriend(r.id, true), `Sekarang berteman dengan ${r.name}`)}>Accept</button>
                  <button className="cn-btn" disabled={busy > 0} onClick={() => act(() => respondFriend(r.id, false))}>Reject</button>
                </div>
              ) }}
            </Person>
          ))}
          <h3 className="cn-sec">Permintaan Terkirim</h3>
          {!outgoing.length && <p className="cn-empty small">Tidak ada permintaan terkirim</p>}
          {outgoing.map((r) => (
            <Person key={r.id} f={r} role={roles[r.user_id] || (r.role !== 'user' ? r.role : undefined)} onOpen={() => openProfile(r)}>
              {{ below: (
                <>
                  <p className="cn-wait">Menunggu konfirmasi</p>
                  <div className="cn-actions"><button className="cn-btn" disabled={busy > 0} onClick={() => act(() => cancelFriendRequest(r.id))}>Batal</button></div>
                </>
              ) }}
            </Person>
          ))}
        </>}
      </div>

      {info && (
        <div className="cn-modal" onClick={() => setInfo(false)}>
          <div className="cn-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Tentang Friend</h3>
            <p>• Ketuk ikon tambah teman, lalu masukkan <b>ID persis</b> (mis. 1 hanya menemukan #1).</p>
            <p>• Teman yang sudah menerima bisa kamu chat pribadi.</p>
            <p>• Komentar anime dari temanmu muncul di halaman SocialLine selama 24 jam.</p>
            <button className="cn-btn primary" onClick={() => setInfo(false)}>Mengerti</button>
          </div>
        </div>
      )}
      {toast && <div className="cn-toast">{toast}</div>}
    </div>
  )
}
