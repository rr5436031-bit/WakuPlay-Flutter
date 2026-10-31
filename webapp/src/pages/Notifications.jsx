import { useEffect, useRef } from 'react'
import { useApp } from '../context'
import { useNotifs, openNotif, markAllRead, clearAll } from '../lib/notif'
import Icon from '../components/Icon'

const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'baru saja'
  if (s < 3600) return Math.floor(s / 60) + ' mnt lalu'
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'
  return Math.floor(s / 86400) + ' hari lalu'
}
const ICON = { friend_request: 'adduser', friend_accept: 'adduser', dm: 'chat', episode: 'play', new_anime: 'play', mention: 'people', reply: 'chat', clan_request: 'shield' }

export default function Notifications() {
  const { user, nav } = useApp()
  const { list, loaded } = useNotifs()
  const fresh = useRef(null)
  if (fresh.current === null && loaded) fresh.current = new Set(list.filter((n) => !n.read_at).map((n) => n.id))
  useEffect(() => { if (loaded) { const t = setTimeout(markAllRead, 800); return () => clearTimeout(t) } }, [loaded])

  return (
    <div className="nt page-scroll">
      <div className="nt-top">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
        <h1>Notifikasi</h1>
        {list.length > 0 && <button className="nt-clear" onClick={() => clearAll(user.id)}>Hapus semua</button>}
      </div>
      {!loaded ? <p className="muted nt-empty">Memuat…</p> : list.length === 0 ? (
        <div className="nt-empty"><Icon name="bell" size={44} /><p>Belum ada notifikasi</p><span className="muted">Permintaan teman, chat pribadi, tag, dan episode baru akan muncul di sini.</span></div>
      ) : (
        <div className="nt-list">
          {list.map((n) => (
            <button key={n.id} className={`nt-item ${fresh.current?.has(n.id) ? 'new' : ''}`} onClick={() => openNotif(n, nav)}>
              {(n.type === 'episode' || n.type === 'new_anime') && n.data?.poster ? <img decoding="async" className="nt-poster" src={n.data.poster} alt="" /> : <span className={`nt-ico ${n.type}`}><Icon name={ICON[n.type] || 'bell'} size={22} /></span>}
              <span className="nt-txt">
                <b>{n.title}{n.type === 'dm' && n.data?.count > 1 ? ` (${n.data.count})` : ''}</b>
                <span>{n.body}</span>
                <small>{ago(n.created_at)}</small>
              </span>
              {fresh.current?.has(n.id) && <i className="nt-dot" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
