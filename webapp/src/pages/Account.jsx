import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { useApi } from '../hooks/useApi'
import { getMyNumber, listFriendFeed, listPinnedFeed, setCommentPin } from '../services/db'
import { userName, fmtAgo } from '../lib/format'
import Icon from '../components/Icon'
import { Avatar, Poster, UserFace } from '../components/ui'
import { levelInfo, useMyXp } from '../lib/xp'
import LevelBadge from '../components/LevelBadge'
import RoleBadge from '../components/RoleBadge'
import RolePill from '../components/RolePill'
import { ClanTag } from '../components/ClanBadge'
import { useStaffRoles } from '../lib/roles'
import { useSocialBadge, lvOf } from '../lib/social'
import ThreadsSheet from '../components/ThreadsSheet'
import CmBg from '../components/CmBg'
import ActionSheet from '../components/ActionSheet'
import { useCmBanner } from '../lib/cmbanner'

function FeedItem({ c, role, count, pinned, onLong, onFriend, onWatch, onReply }) {
  const bg = useCmBanner(c.user_id)
  const lp = useRef({ t: null, x: 0, y: 0, fired: false })
  const stop = () => { clearTimeout(lp.current.t); lp.current.t = null }
  const hold = onLong ? {
    onPointerDown: (e) => { const r = lp.current; r.fired = false; r.x = e.clientX; r.y = e.clientY; stop(); r.t = setTimeout(() => { r.t = null; r.fired = true; onLong(c) }, 550) },
    onPointerMove: (e) => { const r = lp.current; if (r.t && (Math.abs(e.clientX - r.x) > 10 || Math.abs(e.clientY - r.y) > 10)) stop() },
    onPointerUp: stop, onPointerCancel: stop, onPointerLeave: stop,
    onContextMenu: (e) => e.preventDefault(),
    onClickCapture: (e) => { if (lp.current.fired) { lp.current.fired = false; e.preventDefault(); e.stopPropagation() } },
  } : {}
  return (
    <article className={`sf-item ${bg ? 'cm-bgd' : ''} ${pinned ? 'pinned' : ''} ${onLong ? 'holdable' : ''}`} {...hold}>
      {bg && <CmBg url={bg} />}
      <button className="sf-face" onClick={() => onFriend(c)} aria-label={`Profil ${c.name}`}><UserFace url={c.avatar} name={c.name} size={48} uid={c.user_id} /></button>
      <div className="sf-body">
        {pinned && <div className="sf-pin"><Icon name="pin" size={14} /> Disematkan</div>}
        <div className="sf-head">
          <button className="sf-name" onClick={() => onFriend(c)}><b>{c.name}</b></button>
          <RoleBadge role={role} uid={c.user_id} part="check" />
          {c.seq != null && <span className="sf-seq">#{c.seq}</span>}
          <RoleBadge role={role} uid={c.user_id} part="capsule" />
          <span className="sf-when">{fmtAgo(c.created_at)}</span>
        </div>
        <div className="sf-badges"><ClanTag uid={c.user_id} /><RolePill role={role} /><LevelBadge level={lvOf(c.xp)} role={role} dot /></div>
        <button className="sf-anime" onClick={() => onWatch(c)}>
          <div className="sf-poster"><Poster src={c.anime_poster} alt={c.anime_title} /></div>
          <div className="sf-atext"><b>{c.anime_title || 'Anime'}</b><span>Episode {c.episode_number ?? '-'}</span></div>
        </button>
        <p className="sf-text">{c.body}</p>
        <div className="cm-reply"><button onClick={() => onReply(c)}>Reply</button>{count(c) > 0 && <span>{count(c)} balasan</span>}</div>
      </div>
    </article>
  )
}

export default function Account({ focusKey }) {
  const { user, nav } = useApp()
  const meta = user?.user_metadata || {}
  const num = useApi(() => getMyNumber(user.id).catch(() => null), [user.id])
  const feed = useApi(async () => {
    const [list, pins] = await Promise.all([listFriendFeed(), listPinnedFeed().catch(() => [])])
    return { list: list || [], pins: pins || [] }
  }, [user.id, focusKey])
  const xp = useMyXp(user.id)
  const roles = useStaffRoles()
  const lv = levelInfo(xp || 0)
  const badge = useSocialBadge(user.id, focusKey)

  useEffect(() => { const t = setInterval(feed.retry, 60000); return () => clearInterval(t) }, [feed.retry])

  const openMe = () => nav.push('userprofile', { uid: user.id, name: userName(user, 'Pengguna'), avatar: meta.avatar_url, seq: num.data })
  const openFriend = (c) => nav.push('userprofile', { uid: c.user_id, name: c.name, avatar: c.avatar, seq: c.seq })
  const watch = (c) => nav.push('player', {
    animeId: c.anime_id, episodeId: c.episode_id, episodeNumber: c.episode_number,
    anime: { id: c.anime_id, title: c.anime_title, poster: c.anime_poster },
  })
  const pins = feed.data?.pins || []
  const pinIds = new Set(pins.map((c) => c.id))
  const items = [...pins, ...(feed.data?.list || []).filter((c) => !pinIds.has(c.id))]
  const canPin = ['admin', 'developer'].includes(roles[user.id])
  const [menu, setMenu] = useState(null)
  const [note, setNote] = useState('')
  const flash = (t) => { setNote(t); setTimeout(() => setNote(''), 2600) }
  const longPress = (c) => {
    const r = roles[c.user_id] || (c.role !== 'user' ? c.role : undefined)
    if (!['admin', 'developer'].includes(r)) { flash('Hanya komentar admin/developer yang bisa disematkan'); return }
    setMenu(c)
  }
  const togglePin = async (c) => {
    const on = !pinIds.has(c.id)
    try {
      const r = await setCommentPin(c.id, on)
      if (r.ok) { flash(on ? 'Komentar disematkan' : 'Sematan dilepas'); feed.retry() }
      else flash({ LIMIT: 'Maksimal 3 sematan. Lepas salah satu dulu', FORBIDDEN: 'Hanya admin/developer yang bisa menyematkan', NOT_STAFF_COMMENT: 'Hanya komentar admin/developer yang bisa disematkan', REPLY: 'Balasan tidak bisa disematkan', NOT_FOUND: 'Komentar sudah tidak ada' }[r.code] || 'Gagal mengubah sematan')
    } catch { flash('Gagal mengubah sematan. Pastikan pin-komentar.sql sudah dijalankan') }
  }
  const [thread, setThread] = useState(null)
  const [rc, setRc] = useState({})
  const count = (c) => (rc[c.id] ?? Number(c.reply_count || 0))

  return (
    <div className="social">
      <div className="social-top">
        <button className="social-me" onClick={openMe} aria-label="Lihat profil saya">
          <Avatar user={user} size={56} />
          <div className="social-meinfo">
            <div className="social-mename"><strong>{userName(user, 'Pengguna')}</strong><RoleBadge role={roles[user.id]} uid={user.id} part="check" />{num.data != null && <span className="muted">#{num.data}</span>}<RoleBadge role={roles[user.id]} uid={user.id} part="capsule" /></div>
            <div className="social-mebadges"><ClanTag uid={user.id} /><RolePill role={roles[user.id]} /><LevelBadge level={lv.level} role={roles[user.id]} dot /></div>
          </div>
        </button>
        <button className="iconbtn" onClick={() => nav.push('settings')} aria-label="Pengaturan"><Icon name="gear" size={28} solid /></button>
      </div>

      <div className="social-feed">
        {feed.loading && !feed.data && <p className="cn-empty">Memuat komentar teman…</p>}
        {feed.error && <p className="cn-empty">Gagal memuat komentar teman. <button className="link" onClick={feed.retry}>Coba lagi</button><br /><span className="small">Pastikan supabase/teman-chat.sql sudah dijalankan.</span></p>}
        {items.map((c) => {
          const role = roles[c.user_id] || (c.role !== 'user' ? c.role : undefined)
          return <FeedItem key={c.id} c={c} role={role} count={count} pinned={pinIds.has(c.id)} onLong={canPin ? longPress : null} onFriend={openFriend} onWatch={watch} onReply={setThread} />
        })}
        <div style={{ height: 96 }} />
      </div>

      {menu && <ActionSheet title="Komentar" onClose={() => setMenu(null)} items={[{ icon: 'pin', label: pinIds.has(menu.id) ? 'Lepas sematan' : 'Sematkan komentar', onClick: () => togglePin(menu) }]} />}
      {note && <div className="sf-toast" role="status">{note}</div>}
      {thread && (
        <ThreadsSheet hideNav
          parent={{ id: thread.id, user_id: thread.user_id, user_name: thread.name, user_avatar: thread.avatar, body: thread.body, created_at: thread.created_at, seq: thread.seq, xp: thread.xp, role: thread.role !== 'user' ? thread.role : undefined }}
          onClose={() => setThread(null)}
          onCount={(id, n) => setRc((m) => ({ ...m, [id]: n }))}
          onProfile={(c) => nav.push('userprofile', { uid: c.user_id, name: c.user_name || c.name, avatar: c.user_avatar || c.avatar })}
        />
      )}
      <button className="fab-social" onClick={() => nav.push('connections')} aria-label="Teman">
        <Icon name="people" size={30} />
        {badge > 0 && <i className="cn-dot abs">{badge > 99 ? '99+' : badge}</i>}
      </button>
    </div>
  )
}
