import BorderFrame from '../components/BorderFrame'
import { useBorderOf } from '../lib/borders'
import { ClanTag } from '../components/ClanBadge'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context'
import { useApi } from '../hooks/useApi'
import { getPublicProfile, getPublicHistory, listUserComments, listFriends, listFriendRequests, sendFriendRequest, respondFriend, cancelFriendRequest } from '../services/db'
import { clanOfUser } from '../services/clan'
import { levelInfo } from '../lib/xp'
import { fmtAgo, fmtDur, nameColor } from '../lib/format'
import { useStaffRoles } from '../lib/roles'
import Icon from '../components/Icon'
import RoleBadge from '../components/RoleBadge'
import TopLbBadge from '../components/TopLbBadge'
import { useMonthlyTop } from '../lib/toplb'
import TopGiverBadge from '../components/TopGiverBadge'
import { useMonthlyGiver } from '../lib/topgiver'
import TopLevelBadge from '../components/TopLevelBadge'
import { useTopLevel } from '../lib/toplevel'
import LevelBadge from '../components/LevelBadge'
import LevelProgress from '../components/LevelProgress'
import RolePill from '../components/RolePill'
import { Poster } from '../components/ui'

function Face({ url, name, size , uid }) {
  const [bad, setBad] = useState(false)
  const bid = useBorderOf(size < 30 ? null : uid)
  const el = url && !bad ? <img decoding="async" className="avatar" style={{ width: size, height: size }} src={url} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <div className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?')[0].toUpperCase()}</div>
  return bid ? <BorderFrame id={bid} size={size}>{el}</BorderFrame> : el
}

const monthsSince = (iso) => {
  const d = new Date(iso)
  if (isNaN(d)) return 0
  const n = new Date()
  return Math.max(0, (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth()) - (n.getDate() < d.getDate() ? 1 : 0))
}

function ItemHead({ p, uid, role, when }) {
  return (
    <div className="up-ihead">
      <Face url={p.avatar} name={p.name} size={36} uid={p.user_id || uid} />
      <div className="up-iname">
        <b>{p.name}</b><RoleBadge role={role} uid={p.user_id || uid} />
      </div>
      <span className="up-iwhen">• {fmtAgo(when)}</span>
    </div>
  )
}


function useRelation(me, uid) {
  const [rel, setRel] = useState({ state: 'loading', reqId: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(async () => {
    if (!me || !uid || me === uid) return
    try {
      const [fr, rq] = await Promise.all([listFriends(), listFriendRequests()])
      if (!alive.current) return
      if ((fr || []).some((f) => f.user_id === uid)) return setRel({ state: 'friend', reqId: null })
      const r = (rq || []).find((x) => x.user_id === uid)
      if (r) return setRel({ state: r.direction === 'in' ? 'received' : 'sent', reqId: r.id })
      setRel({ state: 'none', reqId: null })
    } catch (e) {
      if (alive.current) setRel((c) => (c.state === 'loading' ? { state: 'error', reqId: null } : c))
    }
  }, [me, uid])
  useEffect(() => { setRel({ state: 'loading', reqId: null }); setErr(''); load() }, [load])

  const run = async (fn) => {
    if (busy) return
    setBusy(true); setErr('')
    try { await fn() } catch (e) { if (alive.current) setErr(e?.message || 'Gagal, coba lagi') }
    await load()
    if (alive.current) setBusy(false)
  }
  return {
    rel, busy, err, retry: load,
    add: () => run(() => sendFriendRequest(uid)),
    cancel: () => run(() => cancelFriendRequest(rel.reqId)),
    accept: () => run(() => respondFriend(rel.reqId, true)),
    reject: () => run(() => respondFriend(rel.reqId, false)),
  }
}

export default function UserProfile({ uid, name: nameP, avatar: avatarP, seq: seqP }) {
  const { user, nav } = useApp()
  const roles = useStaffRoles()
  const prof = useApi(() => getPublicProfile(uid).catch(() => null), [uid])
  const TOP = ['developer', 'admin']
  const isDev = TOP.includes(roles[uid]) || TOP.includes(prof.data?.role)
  const hist = useApi(() => getPublicHistory(uid, 40).catch(() => []), [uid, isDev], !isDev)
  const cms = useApi(() => listUserComments(uid, 40).catch(() => []), [uid, isDev], !isDev)
  const fr = useRelation(user?.id, uid)
  const clan = useApi(() => clanOfUser(uid).catch(() => null), [uid], !!user && user.id !== uid)
  const [tab, setTab] = useState('all')
  const [showLv, setShowLv] = useState(false)
  const [compact, setCompact] = useState(false)
  const [bannerBad, setBannerBad] = useState(false)
  const head = useRef(null)
  const sc = useRef(null)

  const raf = useRef(0)
  const onScroll = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const h = head.current, el = sc.current
      if (h && el) setCompact(el.scrollTop > h.offsetHeight - 76)
    })
  }, [])
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])
  const topRank = useMonthlyTop(uid)
  const giverRank = useMonthlyGiver(uid)
  const levelRank = useTopLevel(uid)
  const P = prof.data || {}
  const p = { name: P.name || nameP || 'User', avatar: P.avatar || avatarP || null }
  const seq = P.seq ?? seqP
  const role = roles[uid] || (P.role && P.role !== 'user' ? P.role : undefined)
  const xp = Number(P.xp) || 0
  const lv = levelInfo(xp).level
  const banner = !bannerBad && P.banner_url ? P.banner_url : null

  const feed = useMemo(() => {
    if (isDev) return []
    const h = (hist.data || []).map((r) => ({ k: 'h-' + r.episode_id, type: 'h', at: r.updated_at, r }))
    const c = (cms.data || []).map((r) => ({ k: 'c-' + r.id, type: 'c', at: r.created_at, r }))
    const all = tab === 'h' ? h : tab === 'c' ? c : [...h, ...c]
    return all.sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [hist.data, cms.data, tab, isDev])
  const loading = hist.loading || cms.loading

  const play = (r) => nav.push('player', {
    animeId: r.anime_id, episodeId: r.episode_id, episodeNumber: r.episode_number,
    anime: { id: r.anime_id, title: r.anime_title, poster: r.anime_poster },
  })

  return (
    <div className="up" ref={sc} onScroll={onScroll}>
      <div className={`up-bar ${compact ? 'solid' : ''}`}>
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
        <div className="up-bar-title">{compact && <><span>{p.name}{seq != null ? `#${seq}` : ''}</span><RoleBadge role={role} uid={p.user_id || uid} /></>}</div>
        <button className="up-me" onClick={() => nav.tab('account')}>Ke Profil Saya</button>
      </div>

      <div className="up-head" ref={head}>
        {banner && <img decoding="async" className="up-banner" src={banner} alt="" referrerPolicy="no-referrer" onError={() => setBannerBad(true)} />}
        <div className={`up-shade ${banner ? 'has' : ''}`} />
        <div className="up-ava"><Face url={p.avatar} name={p.name} size={110} uid={p.user_id || uid} /></div>
        {(topRank || giverRank || levelRank) && (
          <div className="up-badges">
            {topRank && <TopLbBadge rank={topRank} />}
            {giverRank && <TopGiverBadge rank={giverRank} />}
            {levelRank && <TopLevelBadge rank={levelRank} />}
          </div>
        )}
        <div className="up-name">
          <b style={{ color: '#fff' }}>{p.name}</b>
          <RoleBadge role={role} uid={p.user_id || uid} part="check" />
          {seq != null && <span className="up-seq">#{seq}</span>}
          <RoleBadge role={role} uid={p.user_id || uid} part="capsule" />
        </div>
        <div className="up-lvl">
          <ClanTag uid={p.user_id || uid} size={26} />
          <RolePill role={role} />
          <button className="up-lvbtn" onClick={() => setShowLv(true)} aria-label="Lihat progres level"><LevelBadge level={lv} role={role} /></button>
        </div>
        <div className="up-stats">
          <div><b>{isDev ? '∞' : Math.floor(xp).toLocaleString('id-ID')}</b><span>xp</span></div>
          <div><b>{isDev ? '∞' : Number(P.comments ?? (cms.data || []).length).toLocaleString('id-ID')}</b><span>comment</span></div>
          <div><b>{isDev ? '∞' : P.joined ? monthsSince(P.joined) : '-'}</b><span>bulan</span></div>
        </div>
      </div>


      {user && user.id !== uid && (
        <div className="up-fr">
          <div className="up-petrow">
            <button type="button" className="up-pet" onClick={() => nav.push('pet', { uid, name: p.name })} aria-label={`Lihat peliharaan ${p.name}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><ellipse cx="6.5" cy="10" rx="2.2" ry="2.8" /><ellipse cx="10.5" cy="5.8" rx="2.2" ry="2.8" /><ellipse cx="15.5" cy="5.8" rx="2.2" ry="2.8" /><ellipse cx="19" cy="10" rx="2.2" ry="2.8" /><path d="M12.8 11c-3 0-6.2 3.2-6.2 6 0 2 1.6 2.9 3.2 2.5 1-.25 1.9-.5 3-.5s2 .25 3 .5c1.6.4 3.2-.5 3.2-2.5 0-2.8-3.2-6-6.2-6z" /></svg>
              <b>Lihat Peliharaan</b><span className="up-pet-n">({p.name})</span>
            </button>
            {fr.rel.state === 'none' && (
              <button type="button" className="up-frround primary" disabled={fr.busy} onClick={fr.add} aria-label="Tambah teman" title="Tambah teman">
                <Icon name="adduser" size={20} />
              </button>
            )}
            {fr.rel.state === 'sent' && (
              <button type="button" className="up-frround" disabled={fr.busy} onClick={fr.cancel} aria-label="Batalkan permintaan" title="Batalkan permintaan">
                <Icon name="close" size={20} />
              </button>
            )}
            {fr.rel.state === 'received' && (
              <>
                <button type="button" className="up-frround primary" disabled={fr.busy} onClick={fr.accept} aria-label="Terima" title="Terima"><Icon name="check" size={20} /></button>
                <button type="button" className="up-frround" disabled={fr.busy} onClick={fr.reject} aria-label="Tolak" title="Tolak"><Icon name="close" size={20} /></button>
              </>
            )}
            {fr.rel.state === 'friend' && (
              <button type="button" className="up-frround primary" onClick={() => nav.push('dm', { uid, name: p.name, avatar: p.avatar, seq })} aria-label="Chat teman" title="Chat teman">
                <Icon name="chat" size={20} />
              </button>
            )}
            {fr.rel.state === 'error' && (
              <button type="button" className="up-frround" onClick={fr.retry} aria-label="Muat ulang status teman" title="Muat ulang status teman">
                <span aria-hidden="true">↻</span>
              </button>
            )}
          </div>
          {fr.err && <p className="up-frerr">{fr.err}</p>}
        </div>
      )}

      {user && user.id !== uid && (
        <div className="up-acts">
          <button type="button" className="up-act farm" onClick={() => nav.push('farm', { uid, name: p.name })}>
            <Icon name="basket" size={20} /><span className="up-act-tx"><b>Lihat Kebun</b><small>Mode lihat saja</small></span>
          </button>
          {clan.data ? (
            <button type="button" className="up-act clan" onClick={() => nav.push('clandetail', { id: clan.data.id })}>
              <Icon name="shield" size={20} /><span className="up-act-tx"><b>Lihat Clan</b><small>{clan.data.name}</small></span>
            </button>
          ) : (
            <button type="button" className="up-act none" disabled aria-disabled="true">
              <Icon name="lock" size={20} /><span className="up-act-tx"><b>Lihat Clan</b><small>{clan.loading ? 'Memuat…' : 'Orang ini belum ada clan'}</small></span>
            </button>
          )}
        </div>
      )}

      {!isDev && <div className="up-tabs">
        {[['all', 'Semua'], ['c', 'Komentar'], ['h', 'Riwayat']].map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>}

      {!isDev && <div className="up-feed">
        {feed.map((it) => it.type === 'h' ? (
          <button key={it.k} className="up-item" onClick={() => play(it.r)}>
            <ItemHead p={p} uid={uid} role={role} when={it.at} />
            <div className="up-anime">
              <div className="up-thumb"><Poster src={it.r.anime_poster} alt={it.r.anime_title} /></div>
              <div className="up-atext"><b>{it.r.anime_title || 'Anime'}</b><span>Episode {it.r.episode_number ?? '-'}</span></div>
            </div>
            <div className="up-prog">
              <span className="up-play"><Icon name="play" size={12} /></span>
              <div className="up-bar2"><i style={{ width: `${Math.min(100, it.r.duration ? (it.r.progress / it.r.duration) * 100 : 0)}%` }} /></div>
              <span className="up-time">{fmtDur(it.r.progress)} / {fmtDur(it.r.duration)}</span>
            </div>
          </button>
        ) : (
          <div key={it.k} className="up-item static">
            <ItemHead p={p} uid={uid} role={role} when={it.at} />
            <p className="up-cbody">{it.r.body}</p>
          </div>
        ))}
        {!feed.length && <div className="up-empty">{loading ? 'Memuat…' : tab === 'c' ? 'Belum ada komentar' : tab === 'h' ? 'Belum ada riwayat tonton' : 'Belum ada aktivitas'}</div>}
      </div>}
      {showLv && <LevelProgress level={lv} xp={xp} dev={isDev} onClose={() => setShowLv(false)} />}
    </div>
  )
}
