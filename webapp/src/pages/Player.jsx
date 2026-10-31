import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context'
import { media } from '../lib/media'
import { setNowPlaying } from '../lib/xp'
import ThreadsSheet from '../components/ThreadsSheet'
import { useApi } from '../hooks/useApi'
import { api } from '../services/animeApi'
import { saveProgress, getEpisodeProgress, listWatchedIds, listComments, addComment, deleteComment, getReplyCounts, sendReport, getUserSeqs, addView } from '../services/db'
import { levelInfo, getXps } from '../lib/xp'
import RolePill from '../components/RolePill'
import LevelBadge from '../components/LevelBadge'
import { useSettings, getSettings } from '../lib/settings'
import { ClanTag } from '../components/ClanBadge'
import RoleBadge from '../components/RoleBadge'
import CmBg from '../components/CmBg'
import { useCmBanner } from '../lib/cmbanner'
import { useStaffRoles } from '../lib/roles'
import { usePerk } from '../lib/perks'
import { setLandscape, setImmersive } from '../lib/pip'
import { fmtDur, fmtAgo, fmtDateId } from '../lib/format'
import { EpisodeViewsText } from '../components/Views'
import { bumpView } from '../lib/views'
import Icon from '../components/Icon'
import { ErrorState, EmptyState, Skeleton, Poster, Avatar, UserFace, AutoTextarea } from '../components/ui'

function pickQuality(sources, pref) {
  if (!sources.length) return null
  if (pref === 'Auto') return sources[0]
  const want = parseInt(pref, 10)
  const q = (s) => parseInt(String(s.quality).replace(/\D/g, ''), 10) || 0
  const exact = sources.find((s) => q(s) === want)
  if (exact) return exact
  const lower = sources.filter((s) => q(s) && q(s) <= want)
  return lower[0] || sources[sources.length - 1]
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const RANGE = 50
const REASONS = ['Video tidak bisa diputar', 'Episode salah / tertukar', 'Subtitle bermasalah', 'Kualitas video buruk', 'Lainnya']

function CommentRow({ c, mine, role, seq, xp, replies, onReply, onDelete, onProfile }) {
  const bg = useCmBanner(c.user_id)
  return (
    <div className={`cm ${bg ? 'cm-bgd' : ''}`}>
      {bg && <CmBg url={bg} />}
      <span className="avatar-link" style={{ flex: 'none', display: 'inline-flex' }} onClick={onProfile}><UserFace url={c.user_avatar} name={c.user_name} size={38} uid={c.user_id} /></span>
      <div className="cm-main">
        <div className="cm-head"><b className="avatar-link" onClick={onProfile}>{c.user_name || 'User'}</b><RoleBadge role={role} uid={c.user_id} part="check" />{seq != null && <span className="cm-seq">#{seq}</span>}<RoleBadge role={role} uid={c.user_id} part="capsule" /><span className="muted tiny cm-when">{fmtAgo(c.created_at)}</span></div>
        <div className="cm-badges"><ClanTag uid={c.user_id} /><RolePill role={role} /><LevelBadge level={levelInfo(xp || 0).level} role={role} /></div>
        <p>{c.body}</p>
        <div className="cm-reply"><button onClick={onReply}>Reply</button>{replies > 0 && <span>{replies} balasan</span>}</div>
      </div>
      {mine && <button className="iconbtn" onClick={onDelete} aria-label="Hapus"><Icon name="trash" size={18} /></button>}
    </div>
  )
}

export default function Player({ animeId, episodeId, episodeNumber, anime, startAt = 0 }) {
  const { user, nav } = useApp()
  const settings = useSettings()
  const roles = useStaffRoles()
  const pkSkip = usePerk('skipIntro', user?.id)
  const [epId, setEpId] = useState(episodeId)
  const [epNum, setEpNum] = useState(episodeNumber)
  const [skipped, setSkipped] = useState(false)
  useEffect(() => { setSkipped(false) }, [epId])
  useEffect(() => { setNowPlaying(animeId, epId) }, [animeId, epId])
  const eps = useApi((s) => api.episodes(animeId, s), [animeId])
  const st = useApi((s) => api.stream(epId, s), [epId])
  const info = useApi((s) => api.anime(animeId, s), [animeId])
  const sources = useMemo(() => st.data || [], [st.data])

  const [seen, setSeen] = useState(() => new Set())
  const [quality, setQuality] = useState(null)
  const [forceUrl, setForceUrl] = useState(null)
  const tried = useRef(new Set())
  const stallT = useRef(null)
  const shownT = useRef(0)
  const fo = useRef(() => {})
  const [mode, setMode] = useState('video')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [show, setShow] = useState(true)
  const [fs, setFs] = useState(false)
  const [menu, setMenu] = useState(null)
  const [fill, setFill] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [sheet, setSheet] = useState(null)
  const [descMore, setDescMore] = useState(false)
  const [open, setOpen] = useState(true)
  const [range, setRange] = useState(0)
  const [toast, setToast] = useState('')
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [cms, setCms] = useState(null)
  const [cmErr, setCmErr] = useState('')
  const [thread, setThread] = useState(null)
  const [rc, setRc] = useState({})
  const [cmMeta, setCmMeta] = useState({ seq: {}, xp: {} })
  const cmAsked = useRef(new Set())
  useEffect(() => {
    if (!cms || !cms.length) return
    const ids = [...new Set(cms.map((c) => c.user_id))].filter((id) => !cmAsked.current.has(id))
    if (!ids.length) return
    ids.forEach((id) => cmAsked.current.add(id))
    Promise.all([getUserSeqs(ids).catch(() => ({})), getXps(ids).catch(() => ({}))])
      .then(([seq, xp]) => setCmMeta((m) => ({ seq: { ...m.seq, ...seq }, xp: { ...m.xp, ...xp } })))
  }, [cms])
  const rowRef = useRef(null)
  const firstStart = useRef(startAt)

  const wrap = useRef(null)
  const video = useRef(media.el)
  const vhost = useRef(null)
  const hnd = useRef({})
  const seekTo = useRef(0)
  const lastSave = useRef(0)
  const hideT = useRef(null)
  const fsRef = useRef(false)
  const live = useRef({})

  const current = (forceUrl && sources.find((s) => s.url === forceUrl)) || sources.find((s) => s.quality === quality) || pickQuality(sources, settings.quality)
  live.current = { epId, epNum, time, dur, animeId, anime, user, url: current?.url, mode, playing, sources }

  fo.current = () => {
    const l = live.current
    if (l.mode !== 'video' || !l.url) return
    tried.current.add(l.url)
    const nxt = (l.sources || []).find((s) => !tried.current.has(s.url))
    if (nxt) { flash(`Video gagal dimuat, mencoba ${nxt.quality}…`); setForceUrl(nxt.url); return }
    setMode('iframe')
  }

  const viewed = useRef(new Set())
  const countView = (t) => {
    const l = live.current
    if (t < 10 || !l.user || l.epId == null || !l.animeId || viewed.current.has(String(l.epId))) return
    const key = String(l.epId)
    viewed.current.add(key)
    addView(l.animeId, l.epId).then((isNew) => { if (isNew) bumpView(l.animeId, l.epId) }).catch(() => viewed.current.delete(key))
  }

  const save = useCallback(() => {
    const l = live.current
    if (!l.user || !l.dur || l.time < 3) return
    saveProgress(l.user.id, {
      animeId: l.animeId, episodeId: l.epId, episodeNumber: l.epNum,
      title: l.anime?.title, poster: l.anime?.poster, progress: l.time, duration: l.dur,
    }).then(() => setSeen((s) => (s.has(String(l.epId)) ? s : new Set(s).add(String(l.epId))))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    let alive = true
    listWatchedIds(user.id, animeId).then((ids) => alive && setSeen((s) => new Set([...s, ...ids]))).catch(() => {})
    return () => { alive = false }
  }, [animeId, user?.id])

  useEffect(() => {
    shownT.current = 0
    setQuality(null); setTime(0); setDur(0); setMode('video'); setCms(null); setCmErr(''); setMenu(null)
    tried.current = new Set(); setForceUrl(null); clearTimeout(stallT.current)
    if (media.key != null && String(media.key) !== String(epId)) media.release()
    if (vhost.current) { media.mount(vhost.current, 'pvideo'); media.el.autoplay = true }
    seekTo.current = firstStart.current || 0
    firstStart.current = 0
    let alive = true
    if (user) {
      getEpisodeProgress(user.id, epId).then((p) => {
        if (!alive || !p || seekTo.current > 0) return
        if (p.progress > 5 && (!p.duration || p.duration - p.progress > 10)) {
          seekTo.current = p.progress
          const v = video.current
          if (v && v.readyState >= 1 && v.currentTime < 2) v.currentTime = p.progress
        }
      }).catch(() => {})
    }
    return () => { alive = false }
  }, [epId])

  useEffect(() => {
    if (mode === 'iframe') { media.release(); return }
    if (!current) return
    if (vhost.current && media.el.parentNode !== vhost.current) { media.mount(vhost.current, 'pvideo'); media.el.autoplay = true }
    const r = media.setSource(current.url, { key: epId, autoplay: true, onFatal: () => fo.current() })
    clearTimeout(stallT.current)
    if (r === 'new') {
      const u = current.url
      stallT.current = setTimeout(() => { if (live.current.url === u && live.current.mode === 'video' && media.el.readyState < 2) fo.current() }, 15000)
    }
    if (r === 'same') {
      const v = media.el
      setDur(v.duration || 0); setTime(v.currentTime || 0); setPlaying(!v.paused)
      v.playbackRate = speed
    }
  }, [current?.url, mode])

  useEffect(() => {
    const types = ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended', 'error']
    const fns = types.map((t) => [t, (e) => hnd.current[t] && hnd.current[t](e)])
    fns.forEach(([t, f]) => media.el.addEventListener(t, f))
    return () => fns.forEach(([t, f]) => media.el.removeEventListener(t, f))
  }, [])
  hnd.current = {
    loadedmetadata: () => {
      const v = media.el
      setDur(v.duration || 0)
      v.playbackRate = speed
      if (seekTo.current > 0) v.currentTime = seekTo.current
    },
    timeupdate: () => {
      const t = media.el.currentTime
      if (Math.abs(t - shownT.current) >= 1) { shownT.current = t; setTime(t) }
      countView(t)
      if (Date.now() - lastSave.current > 15000) { lastSave.current = Date.now(); live.current.time = t; save() }
    },
    play: () => { setPlaying(true); poke() },
    pause: () => { setPlaying(false); setShow(true); live.current.time = media.el.currentTime || 0; save() },
    ended: () => { save(); if (settings.autoNext && next) go(next) },
    error: () => { if (media.url) fo.current() },
  }
  useLayoutEffect(() => {
    if (mode === 'iframe' || !vhost.current) return
    media.mount(vhost.current, 'pvideo')
    media.el.autoplay = true
  }, [mode])
  useLayoutEffect(() => () => media.park(), [])

  const poke = useCallback(() => {
    setShow(true)
    clearTimeout(hideT.current)
    hideT.current = setTimeout(() => setShow(false), 3200)
  }, [])

  useEffect(() => () => { clearTimeout(stallT.current); setLandscape(false); setImmersive(getSettings().fullscreen !== false) }, [])

  const exitFs = useCallback(() => {
    fsRef.current = false
    setFs(false)
    setLandscape(false); setImmersive(getSettings().fullscreen !== false)
    try { document.fullscreenElement && document.exitFullscreen() } catch { }
    try { screen.orientation?.unlock?.() } catch { }
  }, [])
  const enterFs = useCallback(async () => {
    fsRef.current = true
    setFs(true)
    setLandscape(true); setImmersive(true)
    try { await wrap.current?.requestFullscreen?.() } catch { }
    try { await screen.orientation?.lock?.('landscape') } catch { }
  }, [])

  useEffect(() => {
    nav.setGuard(() => {
      if (fsRef.current) { exitFs(); return true }
      return false
    })
    return () => {
      nav.setGuard(null); exitFs(); clearTimeout(hideT.current); save()
      const l = live.current
      if (l.url && l.mode === 'video' && l.user) {
        nav.minimize({
          animeId: l.animeId, episodeId: l.epId, episodeNumber: l.epNum, anime: l.anime,
          url: l.url, time: l.time || 0, duration: l.dur || 0, playing: !!l.playing,
        })
      } else {
        media.release()
      }
    }
  }, [])

  const list = eps.data || []
  const idx = list.findIndex((e) => String(e.id) === String(epId))
  const prev = idx > 0 ? list[idx - 1] : null
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null
  const go = (e) => { save(); setEpId(e.id); setEpNum(e.number) }
  const curEp = idx >= 0 ? list[idx] : null
  const a = { ...(anime || {}), ...(info.data || {}) }
  const ranges = Math.ceil(list.length / RANGE)
  const shownEps = list.slice(range * RANGE, range * RANGE + RANGE)

  useEffect(() => { if (idx >= 0) setRange(Math.floor(idx / RANGE)) }, [idx])
  useEffect(() => {
    const el = rowRef.current?.querySelector('.ep-sq.current')
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [epId, range, list.length, open])

  useEffect(() => {
    let alive = true
    listComments(epId).then((r) => { if (!alive) return; setCms(r); getReplyCounts(r.map((x) => x.id)).then((c) => alive && setRc(c)) }).catch((e) => { if (alive) { setCms([]); setCmErr(e?.message || 'Komentar belum tersedia') } })
    return () => { alive = false }
  }, [epId])

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  async function post() {
    const body = text.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      const row = await addComment(user, { episodeId: epId, animeId, body, title: a.title, poster: a.poster, episodeNumber: epNum })
      setCms((c) => [row, ...(c || [])]); setText(''); setCmErr('')
    } catch (e) { flash(e?.message || 'Gagal mengirim komentar') } finally { setPosting(false) }
  }
  async function removeCm(c) {
    try { await deleteComment(c.id); setCms((l) => l.filter((x) => x.id !== c.id)) } catch { flash('Gagal menghapus') }
  }
  async function report(reason) {
    setSheet(null)
    try { await sendReport(user.id, { animeId, episodeId: epId, reason }); flash('Laporan terkirim, terima kasih') } catch { flash('Gagal mengirim laporan') }
  }
  function download() {
    if (!current) return
    if (/\.m3u8(\?|$)/i.test(current.url)) return flash('Episode ini berformat streaming, belum bisa diunduh')
    window.open(current.url, '_blank')
  }
  function skipIntro() {
    const v = video.current
    if (v) { v.currentTime = Math.min((v.duration || 1e9) - 1, v.currentTime + 85); poke() }
    setSkipped(true)
  }
  function seekBy(sec) {
    const v = video.current
    if (v) { v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + sec)); poke() }
  }
  function pickSpeed(r) {
    setSpeed(r); setMenu(null)
    if (video.current) video.current.playbackRate = r
    poke()
  }

  function toggle() {
    const v = video.current
    if (!v) return
    if (v.paused) v.play().catch(() => {}); else v.pause()
    poke()
  }

  const [fx, setFx] = useState(null)
  const [boost, setBoost] = useState(false)
  const g = useRef({ down: false, moved: false, long: false, sx: 0, sy: 0, press: null, tap: null, lastTap: 0, chain: false, total: 0, side: 0, fxT: null })
  useEffect(() => () => { const q = g.current; clearTimeout(q.press); clearTimeout(q.tap); clearTimeout(q.fxT) }, [])
  const endBoost = useCallback(() => {
    const q = g.current
    if (q.long) { q.long = false; if (media.el) media.el.playbackRate = live.current.speed || 1; setBoost(false) }
  }, [])
  useEffect(() => { if (mode !== 'video') endBoost() }, [mode, endBoost])

  function quietSeek(sec) {
    const v = media.el
    v.currentTime = Math.max(0, Math.min(v.duration || 1e9, v.currentTime + sec))
  }
  function showFx(side) {
    const q = g.current
    q.total = q.side === side && q.fxT ? q.total + 10 : 10
    q.side = side
    setFx({ side, total: q.total, id: Math.random() })
    clearTimeout(q.fxT)
    q.fxT = setTimeout(() => { q.fxT = null; setFx(null); q.chain = false }, 750)
  }
  function onGDown(e) {
    if (mode !== 'video' || !current) return
    if (e.target.closest('button, input, a, .pbar, .ptop, .skipintro')) return
    const q = g.current
    q.down = true; q.moved = false; q.long = false; q.sx = e.clientX; q.sy = e.clientY
    clearTimeout(q.press)
    q.press = setTimeout(() => {
      if (!q.down || q.moved) return
      clearTimeout(q.tap); q.lastTap = 0; q.chain = false
      q.long = true
      const v = media.el
      if (v.paused) v.play().catch(() => {})
      v.playbackRate = 2
      setBoost(true)
      try { navigator.vibrate && navigator.vibrate(15) } catch { }
    }, 380)
  }
  function onGMove(e) {
    const q = g.current
    if (!q.down || q.moved) return
    if (Math.abs(e.clientX - q.sx) > 14 || Math.abs(e.clientY - q.sy) > 14) { q.moved = true; clearTimeout(q.press); endBoost() }
  }
  function onGUp(e) {
    const q = g.current
    if (!q.down) return
    q.down = false
    clearTimeout(q.press)
    if (q.long) { endBoost(); return }
    if (q.moved) return
    const now = Date.now()
    const r = wrap.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const side = x < 0.4 ? -1 : x > 0.6 ? 1 : 0
    const quick = now - q.lastTap < 300
    if (quick && (q.chain || q.tap)) {
      clearTimeout(q.tap); q.tap = null
      q.lastTap = now; q.chain = true
      if (side === 0) { const v = media.el; if (v.paused) v.play().catch(() => {}); else v.pause(); return }
      quietSeek(side * 10); showFx(side)
      return
    }
    q.lastTap = now; q.chain = false
    clearTimeout(q.tap)
    q.tap = setTimeout(() => { q.tap = null; setMenu(null); if (live.current.show) setShow(false); else poke() }, 270)
  }
  function onGCancel() { const q = g.current; q.down = false; clearTimeout(q.press); endBoost() }

  function changeQuality(q) {
    seekTo.current = video.current?.currentTime || 0
    setForceUrl(null)
    setQuality(q)
    setMenu(null); setSheet(null)
  }

  live.current.show = show; live.current.speed = speed
  const pct = dur ? Math.min(100, (time / dur) * 100) : 0
  const showSkip = !!settings.skipIntro && pkSkip.ok && !skipped && mode === 'video' && current && dur > 600 && time >= 0 && time < 220

  return (
    <div className="player-page">
      <div className={`pwrap ${fs ? 'fs' : ''} ${fill ? 'fillmode' : ''}`} ref={wrap} onPointerDown={onGDown} onPointerMove={onGMove} onPointerUp={onGUp} onPointerCancel={onGCancel} onContextMenu={(e) => e.preventDefault()}>
        {mode === 'iframe' && current ? (
          <iframe title="player" src={current.url} allowFullScreen allow="autoplay; fullscreen" className="pframe" />
        ) : (
          <div ref={vhost} className="pvhost" />
        )}

        {st.loading && !media.url && (
          <div className="pload"><Skeleton style={{ position: 'absolute', inset: 0 }} /></div>
        )}

        {fx && (
          <div key={fx.id} className={`gfx-seek ${fx.side < 0 ? 'l' : 'r'}`}>
            <Icon name={fx.side < 0 ? 'replay10' : 'forward10'} size={34} />
            <b>{fx.side < 0 ? '-' : '+'}{fx.total} detik</b>
          </div>
        )}
        {boost && <div className="gfx-boost"><Icon name="forward10" size={16} /> 2×</div>}

        {showSkip && (
          <button className="skipintro" style={{ bottom: show ? 58 : 14 }} onClick={skipIntro}>
            <Icon name="forward10" size={20} /> Skip Intro
          </button>
        )}

        {mode === 'video' && current && (
          <div className={`pctrl ${show ? 'show' : ''}`}>
            <div className="ptop">
              <button className="iconbtn" onClick={() => (fs ? exitFs() : nav.back())} aria-label="Kembali"><Icon name="back" /></button>
              <span style={{ flex: 1 }} />
              <button className="ptxtbtn" onClick={() => { setFill(!fill); poke() }}><Icon name="fill" size={22} /> Fill</button>
              <button className="iconbtn" onClick={() => (fs ? exitFs() : enterFs())} aria-label="Layar penuh"><Icon name={fs ? 'exitfs' : 'fullscreen'} size={24} /></button>
            </div>

            <div className="pmid">
              <button className="iconbtn big" disabled={!prev} onClick={() => prev && go(prev)} aria-label="Sebelumnya"><Icon name="prev" size={26} /></button>
              <button className="iconbtn big" onClick={() => seekBy(-10)} aria-label="Mundur 10 detik"><Icon name="replay10" size={34} /></button>
              <button className="playbtn" onClick={toggle} aria-label="Putar/Jeda"><Icon name={playing ? 'pause' : 'play'} size={32} /></button>
              <button className="iconbtn big" onClick={() => seekBy(10)} aria-label="Maju 10 detik"><Icon name="forward10" size={34} /></button>
              <button className="iconbtn big" disabled={!next} onClick={() => next && go(next)} aria-label="Berikutnya"><Icon name="next" size={26} /></button>
            </div>

            <div className="pbar">
              <div className="prow">
                <span className="ptime">{fmtDur(time)} / {fmtDur(dur)}</span>
                <span style={{ flex: 1 }} />
                {sources.length > 1 && <button className="ptxtbtn" onClick={() => { setMenu(menu === 'quality' ? null : 'quality'); poke() }}>{current.quality}</button>}
                <button className="ptxtbtn" onClick={() => { setMenu(menu === 'speed' ? null : 'speed'); poke() }}>{speed}x</button>
              </div>
              <input
                className="seek"
                type="range"
                min="0"
                max={dur || 0}
                step="1"
                style={{ '--p': `${pct}%` }}
                value={Math.min(time, dur || 0)}
                onChange={(e) => { const v = video.current; if (v) v.currentTime = Number(e.target.value); shownT.current = Number(e.target.value); setTime(Number(e.target.value)); poke() }}
              />
            </div>

            {menu && (
              <div className="qmenu">
                {menu === 'quality'
                  ? sources.map((s) => <button key={s.url} className={s.url === current.url ? 'on' : ''} onClick={() => changeQuality(s.quality)}>{s.quality}</button>)
                  : SPEEDS.map((r) => <button key={r} className={r === speed ? 'on' : ''} onClick={() => pickSpeed(r)}>{r}x</button>)}
              </div>
            )}
          </div>
        )}

        {mode === 'iframe' && (
          <button className="iconbtn floating" onClick={() => (fs ? exitFs() : nav.back())}><Icon name="back" /></button>
        )}
      </div>

      <div className="player-body">
        {st.error && <ErrorState error={st.error} onRetry={st.retry} />}
        {!st.loading && !st.error && sources.length === 0 && (
          <EmptyState title="Stream tidak tersedia" text="Sumber video untuk episode ini belum tersedia. Coba episode lain." />
        )}

        <div className="pinfo">
          <div className="pinfo-poster"><Poster src={a.poster} alt={a.title} /></div>
          <div className="pinfo-main">
            <h2>{a.title}</h2>
            <div className="pinfo-line">
              <span>Episode {epNum}</span>
              {epId != null && <span className="dot"><Icon name="eye" size={16} /> <EpisodeViewsText id={epId} /></span>}
              {curEp?.date && !isNaN(new Date(String(curEp.date).replace(' ', 'T'))) && <span className="dot">{fmtDateId(String(curEp.date).replace(' ', 'T'))}</span>}
            </div>
          </div>
        </div>

        {a.synopsis && (
          <div className="pdesc">
            <p className={descMore ? '' : 'clamp3'}>{a.synopsis}</p>
            <button className="link" onClick={() => setDescMore(!descMore)}>{descMore ? 'Tutup' : 'Selengkapnya'} <Icon name={descMore ? 'chevup' : 'chevron'} size={14} /></button>
          </div>
        )}

        <div className="pactions">
          {sources.length > 1 && <button className="pill" onClick={() => setSheet('quality')}><Icon name="sliders" size={18} /> {current?.quality} Quality</button>}
          <button className="pill" onClick={download}><Icon name="download" size={18} /> Download</button>
          <button className="pill" onClick={() => setSheet('report')}><Icon name="flag" size={18} /> Report</button>
        </div>

        <div className="eplist-head">
          <h2>Episode List</h2>
          <button className="sqbtn" onClick={() => setOpen(!open)} aria-label="Buka/tutup"><Icon name={open ? 'chevup' : 'chevdown'} size={22} /></button>
        </div>
        {open && (
          <>
            {eps.loading && <div style={{ padding: '0 14px' }}><Skeleton style={{ height: 80 }} /></div>}
            {eps.error && <ErrorState error={eps.error} onRetry={eps.retry} />}
            {ranges > 1 && (
              <div className="hscroll">
                {Array.from({ length: ranges }, (_, i) => (
                  <button key={i} className={`rchip ${i === range ? 'on' : ''}`} onClick={() => setRange(i)}>
                    {i * RANGE + 1}-{Math.min(list.length, (i + 1) * RANGE)}
                  </button>
                ))}
              </div>
            )}
            <div className="hscroll" ref={rowRef}>
              {shownEps.map((e) => (
                <button key={e.id} className={`ep-sq ${String(e.id) === String(epId) ? 'current' : ''} ${seen.has(String(e.id)) ? 'seen' : ''}`} onClick={() => go(e)}>{e.number}</button>
              ))}
            </div>
          </>
        )}

        <div className="cm-note">
          <span className="cm-note-ic"><Icon name="info" size={26} /></span>
          <span>Ingatlah untuk selalu memberikan komentar yang sopan dan tidak menyinggung pengguna lain.</span>
        </div>

        <div className="cm-wrap">
          <h2>{cms ? cms.length : 0} Komentar</h2>
          <div className="cm-input">
            <Avatar user={user} size={38} />
            <AutoTextarea value={text} maxLength={500} placeholder="Tulis komentar.." onChange={(e) => setText(e.target.value)} />
            <button className="cm-send" disabled={!text.trim() || posting} onClick={post} aria-label="Kirim"><Icon name="send" size={20} /></button>
          </div>
          {cms === null && <Skeleton style={{ height: 60, marginTop: 14 }} />}
          {cmErr && <p className="muted small" style={{ marginTop: 12 }}>Komentar belum aktif ({cmErr}). Jalankan ulang supabase/schema.sql.</p>}
          {cms && cms.length === 0 && !cmErr && <p className="muted" style={{ marginTop: 14 }}>Belum ada komentar. Jadi yang pertama!</p>}
          {cms && cms.map((c) => <CommentRow key={c.id} c={c} replies={rc[c.id] || 0} onReply={() => setThread(c)} role={roles[c.user_id]} seq={cmMeta.seq[c.user_id]} xp={cmMeta.xp[c.user_id]} mine={c.user_id === user.id || !!roles[user.id]} onDelete={() => removeCm(c)} onProfile={() => { try { video.current?.pause() } catch { } nav.push('userprofile', { uid: c.user_id, name: c.user_name, avatar: c.user_avatar, seq: cmMeta.seq[c.user_id] }) }} />)}
        </div>
      </div>

      {sheet && (
        <div className="sheet-bg" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{sheet === 'quality' ? 'Kualitas video' : 'Laporkan masalah'}</h3>
            {sheet === 'quality'
              ? sources.map((s) => <button key={s.url} className={s.url === current?.url ? 'on' : ''} onClick={() => changeQuality(s.quality)}>{s.quality}</button>)
              : REASONS.map((r) => <button key={r} onClick={() => report(r)}>{r}</button>)}
          </div>
        </div>
      )}
      {thread && (
        <ThreadsSheet
          parent={{ ...thread, seq: cmMeta.seq[thread.user_id], xp: cmMeta.xp[thread.user_id] }}
          onClose={() => setThread(null)}
          onCount={(id, n) => setRc((m) => ({ ...m, [id]: n }))}
          onProfile={(c) => { try { video.current?.pause() } catch { } nav.push('userprofile', { uid: c.user_id, name: c.user_name, avatar: c.user_avatar }) }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
