import { useEffect, useState } from 'react'
import { prefetchImages, prefetchSlow, snapshotImages } from '../lib/img'
import { useApp } from '../context'
import { useApi } from '../hooks/useApi'
import { api, peekApi } from '../services/animeApi'
import { listHistory, latestPerAnime, listChat, getMyProfile, getPublicProfile, getTopAnimeByViews } from '../services/db'
import { Avatar, SearchBar, SectionHeader, GridSkeleton, ErrorState, Chip, Skeleton, Poster } from '../components/ui'
import AnimeCard from '../components/AnimeCard'
import HomeBanner from '../components/HomeBanner'
import { fmtDur, userName, nameColor } from '../lib/format'
import RoleBadge from '../components/RoleBadge'
import { DiamondIcon } from '../components/PremiumBadge'
import { usePremiumFlag } from '../lib/premium'
import { useStaffRoles } from '../lib/roles'
import { levelInfo, useMyXp } from '../lib/xp'
import LevelBadge from '../components/LevelBadge'
import { useSettings, setSetting } from '../lib/settings'
import { bumpReader } from '../lib/neweps'
import Icon from '../components/Icon'
import { useNotifs } from '../lib/notif'
import { useGold, fmtNum } from '../lib/gold'
import { ClanTag } from '../components/ClanBadge'
import GoldCoin from '../components/GoldCoin'

const SKIP = new Set(['wa', 'ga', 'no', 'ni', 'wo', 'to', 'de', 'ha', 'the', 'of', 'a', 'in', 'on', 'season', 'part', 'cour', 'final', 'movie', 'ova', 'ii', 'iii', 'iv'])
const seriesKey = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter((w) => w && !SKIP.has(w) && !/^(s?\d+(st|nd|rd|th)?)$/.test(w)).slice(0, 3).join(' ')

const isFinished = (a) => /(tamat|complete|finish|selesai|\bend(ed)?\b)/i.test(String(a.status ?? ''))

const isAiring = (a) => a.isNew || /(ongoing|airing|tayang|berlangsung|currently)/i.test(String(a.status ?? ''))

function pickNew(h, week, hidden, n = 6) {
  const bumped = bumpReader()
  const seen = new Set(), out = []
  const add = (a, fresh) => {
    const key = seriesKey(a.title)
    if (!a.title || a.title === 'Tanpa judul' || isFinished(a) || hidden.includes(String(a.id)) || seen.has(key)) return false
    seen.add(key)
    const b = bumped(a.id)
    out.push(fresh || b ? { ...a, isNew: true, t: Math.max(a.t || 0, b) } : a)
    return out.length >= n
  }
  for (const k of ['fresh', 'today']) for (const a of h[k] || []) if (add(a, true)) return rank(out)
  if (week && week.length === 7) {
    const t = (new Date().getDay() + 6) % 7
    for (let i = 0; i < 7; i++) for (const a of week[(t - i + 7) % 7] || []) if (add(a, true)) return rank(out)
  }
  for (const k of ['hot', 'popular', 'random', 'waiting', 'trailer']) for (const a of h[k] || []) if (isAiring(a) && add(a, false)) return rank(out)
  return rank(out)
}

const rank = (list) => list.map((a, i) => [a, i]).sort((x, y) => (y[0].t || 0) - (x[0].t || 0) || x[1] - y[1]).map((x) => x[0])

function Grid({ items, onOpen, limit = 6, onHold }) {
  return (
    <div className="grid3">
      {items.slice(0, limit).map((a) => <AnimeCard key={a.id} anime={a} onClick={() => onOpen(a)} onHold={onHold} />)}
    </div>
  )
}

function Row({ items, onOpen, ranked }) {
  return (
    <div className="hrow">
      {items.slice(0, 12).map((a, i) => (
        <AnimeCard key={a.id} anime={a} rank={ranked ? i + 1 : undefined} onClick={() => onOpen(a)} />
      ))}
    </div>
  )
}

export default function Home({ focusKey }) {
  const { user, nav } = useApp()
  const st = useSettings()
  const { unread } = useNotifs()
  const gold = useGold()
  const [newN, setNewN] = useState(12)
  const home = useApi((s) => api.home(s), [focusKey], true, peekApi.home)
  const genres = useApi((s) => api.genres(s), [], true, peekApi.genres)
  const week = useApi((s) => api.weekSchedule(s), [])
  const cw = useApi(
    () => (user ? listHistory(user.id, 40).then(latestPerAnime).catch(() => []) : Promise.resolve([])),
    [user?.id, focusKey]
  )

  const open = (a) => nav.push('detail', { id: a.id, preview: a })
  const resume = (r) =>
    nav.push('player', {
      animeId: r.anime_id, episodeId: r.episode_id, episodeNumber: r.episode_number,
      anime: { id: r.anime_id, title: r.anime_title, poster: r.anime_poster },
    })

  const prof = useApi(() => getMyProfile(user.id).catch(() => null), [user?.id])
  const pubProf = useApi(() => getPublicProfile(user.id).catch(() => null), [user?.id])
  const [bnBad, setBnBad] = useState(false)
  const myBanner = !bnBad && pubProf.data?.banner_url ? pubProf.data.banner_url : null
  const xp = useMyXp(user?.id)
  const roles = useStaffRoles()
  const lv = levelInfo(xp || 0)
  const lastChat = useApi(() => listChat(1).then((r) => r[r.length - 1] || null).catch(() => null), [user?.id, focusKey])
  const meta = user?.user_metadata || {}
  const h = home.data
  const real = (a) => a.title && a.title !== 'Tanpa judul'
  const topViews = useApi(() => getTopAnimeByViews(10).catch(() => []), [])
  const [extra, setExtra] = useState({})
  const apiPool = h
    ? (() => {
        const seen = new Set(), out = []
        for (const l of [h.hot, h.popular, h.fresh, h.slider, h.today]) {
          for (const a of l || []) {
            if (!real(a) || seen.has(String(a.id))) continue
            seen.add(String(a.id)); out.push(a)
          }
        }
        return out
      })()
    : []
  const topIds = (topViews.data || []).map((r) => r.id).join(',')
  useEffect(() => {
    if (!h || !topIds) return
    const have = new Set(apiPool.map((a) => String(a.id)))
    const need = topIds.split(',').filter((id) => !have.has(id) && !extra[id])
    if (!need.length) return
    let alive = true
    need.forEach((id) => api.anime(id).then((a) => { if (alive && a && real(a)) setExtra((p) => (p[id] ? p : { ...p, [id]: { ...a, id: a.id ?? id } })) }).catch(() => {}))
    return () => { alive = false }
  }, [topIds, h])
  const heroItems = h
    ? (() => {
        const byId = new Map(apiPool.map((a) => [String(a.id), a]))
        const seen = new Set(), out = []
        for (const r of topViews.data || []) {
          const a = byId.get(r.id) || extra[r.id]
          if (!a || !real(a) || seen.has(r.id)) continue
          seen.add(r.id); out.push(a)
        }
        for (const a of apiPool) {
          if (out.length >= 10) break
          if (!seen.has(String(a.id))) { seen.add(String(a.id)); out.push(a) }
        }
        return out
      })()
    : []

  const newPool = h ? pickNew(h, week.data, st.hidden || [], 120) : []

  useEffect(() => {
    if (!h) return
    const urls = []
    Object.values(h).forEach((v) => { if (Array.isArray(v)) v.forEach((a) => a && urls.push(a.cover, a.poster)) })
    prefetchImages(heroItems.slice(0, 6).map((a) => a.cover || a.poster), false)
    const idle = (fn, ms) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: ms }) : setTimeout(fn, ms))
    const cancelIdle = (id) => ('cancelIdleCallback' in window ? window.cancelIdleCallback(id) : clearTimeout(id))
    let stopSlow = null
    const i1 = idle(() => { stopSlow = prefetchSlow(urls.slice(0, 160)) }, 2500)
    const i2 = idle(() => {
      snapshotImages(heroItems.slice(0, 6).map((a) => a.cover || a.poster), 540, 6)
      snapshotImages(urls, 280, 18)
    }, 15000)
    return () => { cancelIdle(i1); cancelIdle(i2); if (stopSlow) stopSlow() }
  }, [h])

  const isPrem = usePremiumFlag(user?.id)

  return (
    <div className="page-scroll">
      <div className={`hp-wrap ${myBanner ? 'has-bn' : ''}`}>
        {myBanner && <><img decoding="async" className="hp-banner" src={myBanner} alt="" referrerPolicy="no-referrer" onError={() => setBnBad(true)} /><div className="hp-shade" /></>}
        <button className="hp-bell" onClick={() => nav.push('notifications')} aria-label="Notifikasi">
          <Icon name="bell" size={26} />{unread > 0 && <i className="hp-badge">{unread > 99 ? '99+' : unread}</i>}
        </button>
        <button className="hp-card" onClick={() => nav.push('userprofile', { uid: user.id, name: userName(user, 'Pengguna'), avatar: meta.avatar_url, seq: prof.data?.seq })} aria-label="Buka profil">
          <Avatar user={user} size={64} />
          <div className="hp-info">
            <div className="hp-name">
              <b style={{ color: nameColor(user?.id) }}>{userName(user, 'Pengguna')}</b>
              {prof.data?.seq != null && <span className="hp-id">#{prof.data.seq}</span>}
              <RoleBadge role={roles[user?.id]} uid={user?.id} part="check" />
            </div>
            <div className="hp-tags">
              <ClanTag uid={user?.id} size={20} />
              <RoleBadge role={roles[user?.id]} uid={user?.id} part="capsule" />
            </div>
          </div>
        </button>
        <button className="hp-lvstrip" onClick={() => nav.push('userprofile', { uid: user.id, name: userName(user, 'Pengguna'), avatar: meta.avatar_url, seq: prof.data?.seq })} aria-label="Level dan XP">
          <div className="hp-lvl">
            <LevelBadge level={lv.level} role={roles[user?.id]} />
            <span className="hp-xp">{lv.into.toFixed(1)} / {lv.need.toFixed(1)} XP</span>
          </div>
          <div className="xp-bar hp-bar"><i style={{ width: `${Math.round(lv.pct * 100)}%` }} /></div>
        </button>
        <div className="hp-sub">
          <div className="hp-gold"><GoldCoin size={26} /><b>{gold == null ? '…' : fmtNum(gold)}</b><span>WakuGold</span></div>
          <button className="hp-games" onClick={() => nav.push('wakugames')}><Icon name="star" size={18} solid />WakuGames</button>
        </div>
      </div>
      <div className="pm-home-wrap">
        <button className="pm-home" onClick={() => nav.push('premium')} aria-label="Beli Premium">
          <span className="pm-home-ic"><DiamondIcon size={22} /></span>
          <span className="pm-home-tx"><b>BELI PREMIUM</b><small>{isPrem ? 'Premium aktif · ketuk untuk perpanjang' : 'Lihat paket & keuntungan Premium'}</small></span>
          <Icon name="chevron" size={22} />
        </button>
      </div>

      <div className="hs-sticky">
        <SearchBar readOnly onClick={() => nav.push('search', { focus: true })} />
      </div>

      {home.loading && (
        <>
          <Skeleton style={{ height: 190, borderRadius: 18, margin: '8px 14px' }} />
          <GridSkeleton />
        </>
      )}
      {home.error && <ErrorState error={home.error} onRetry={home.retry} />}

      {h && (
        <>
          {heroItems.length > 0 && <HomeBanner items={heroItems} onOpen={open} />}
          <button className="gchat-bar" onClick={() => nav.push('chat')}>
            <span className="gchat-ic"><Icon name="chat" size={22} /></span>
            <b>Chat Global</b>
            <i className="gchat-sep" />
            <span className="gchat-last">
              {lastChat.data ? <><em>{lastChat.data.user_name}</em>: {lastChat.data.body}</> : 'Ayo mulai ngobrol'}
            </span>
            <Icon name="chevron" size={22} />
          </button>

          {cw.data && cw.data.length > 0 && (
            <section>
              <SectionHeader title="Terakhir Ditonton" action="Lihat Lainnya" onAction={() => nav.tab('history')} />
              <div className="hrow">
                {cw.data.slice(0, 10).map((r) => {
                  const pct = r.duration ? Math.min(100, (r.progress / r.duration) * 100) : 0
                  return (
                    <button key={r.episode_id} className="cwcard" onClick={() => resume(r)}>
                      <div className="cw-thumb">
                        <Poster src={r.anime_poster} alt={r.anime_title} />
                        <span className="acard-eps">Eps {r.episode_number}</span>
                        <div className="cw-bar"><i style={{ width: pct + '%' }} /></div>
                      </div>
                      <div className="acard-title">{r.anime_title}</div>
                      {r.duration > 0 && <div className="muted tiny">{fmtDur(r.progress)} / {fmtDur(r.duration)}</div>}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {newPool.length > 0 && (
            <section>
              <SectionHeader title="New Eps Anime" action="Lihat Jadwal" onAction={() => nav.tab('schedule')} />
              <Grid
                items={newPool}
                limit={newN}
                onOpen={open}
                onHold={(a) => { if (window.confirm(`Sembunyikan "${a.title}" dari New Eps Anime?`)) setSetting('hidden', [...(st.hidden || []), String(a.id)]) }}
              />
              {newPool.length > newN && (
                <button className="showmore" onClick={() => setNewN((n) => n + 12)}>Show more</button>
              )}
            </section>
          )}
          {genres.data && genres.data.length > 0 && (
        <section>
          <SectionHeader title="Genres" />
          <div className="chips">
                {genres.data.map((g) => (
              <Chip key={g.id} onClick={() => nav.push('search', { genre: g })}>{g.name}</Chip>
            ))}
          </div>
        </section>
      )}
          {h.today.length > 0 && (
            <section>
              <SectionHeader title="Rilis Hari Ini" />
              <Row items={h.today} onOpen={open} />
            </section>
          )}
          {h.hot.length > 0 && (
            <section>
              <SectionHeader title="Anime Hot" />
              <Row items={h.hot} onOpen={open} ranked />
            </section>
          )}
          {h.popular.length > 0 && (
            <section>
              <SectionHeader title="Popular Anime" />
              <Grid items={h.popular} onOpen={open} />
            </section>
          )}
          {h.waiting.length > 0 && (
            <section>
              <SectionHeader title="Segera Rilis" />
              <Row items={h.waiting} onOpen={open} />
            </section>
          )}
          {h.random.length > 0 && (
            <section>
              <SectionHeader title="Random Anime" />
              <Row items={h.random} onOpen={open} />
            </section>
          )}
          {h.trailer.length > 0 && (
            <section>
              <SectionHeader title="Trailer Anime" />
              <Row items={h.trailer} onOpen={open} />
            </section>
          )}
        </>
      )}

      <div style={{ height: 24 }} />
    </div>
  )
}
