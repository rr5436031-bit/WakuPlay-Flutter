import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { useApp } from '../context'
import { getLeaderboard, fmtXpShort } from '../lib/xp'
import { getTopGivers } from '../services/topgiver'
import { getTopLevels } from '../services/toplevel'
import LevelBadge from './LevelBadge'
import { AnimeViewsText } from './Views'
import { ClanTag } from './ClanBadge'
import { loadImageNative, peekImage } from '../lib/img'

const MAX = 10
const EVERY = 3000

function Face({ url, name, size = 34 }) {
  const [bad, setBad] = useState(false)
  if (url && !bad) return <img decoding="async" className="avatar" style={{ width: size, height: size }} src={url} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} />
  return <div className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?')[0].toUpperCase()}</div>
}

function TopAnimeSlide({ pool, onOpen }) {
  const list = pool.slice(0, MAX)
  const urls = list.map((a) => a.cover || a.poster)
  const key = urls.join('|')
  const [i, setI] = useState(0)
  const [ready, setReady] = useState(() => new Map(urls.map((u, k) => [k, u && peekImage(u)]).filter(([, v]) => v)))
  const held = useRef([])

  useEffect(() => {
    let alive = true
    const mark = (k, src) => alive && setReady((p) => (p.has(k) ? p : new Map(p).set(k, src)))
    const warm = (k, u) => {
      const im = new Image()
      im.referrerPolicy = 'origin'
      held.current[k] = im
      im.onload = () => { (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => mark(k, u)) }
      im.onerror = () => {}
      im.src = u
    }
    urls.forEach((u, k) => {
      if (!u) return
      const hit = peekImage(u)
      if (hit) { warm(k, hit); return }
      loadImageNative(u).then((r) => { if (alive) warm(k, r || u) }).catch(() => { if (alive) warm(k, u) })
    })
    return () => { alive = false }
  }, [key])

  useEffect(() => {
    if (!ready.has(i) && ready.size) setI(Math.min(...ready.keys()))
  }, [ready, i])

  useEffect(() => {
    if (list.length < 2) return
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible' || document.documentElement.classList.contains('has-overlay')) return
      for (let step = 1; step < list.length; step++) {
        const n = (i + step) % list.length
        if (ready.has(n)) { setI(n); return }
      }
    }, EVERY)
    return () => clearInterval(t)
  }, [list.length, i, ready])
  const a = list[i % list.length]
  const words = a.title.split(' ')
  return (
    <div className="hb-slide hb-hero">
      <button className="hb-hero-card" onClick={() => onOpen(a)}>
        {list.map((it, k) => ready.has(k) && <img key={k} className={`hb-img ${k === i ? 'on' : ''}`} src={ready.get(k)} alt={k === i ? it.title : ''} referrerPolicy="origin" decoding="sync" draggable={false} />)}
        <div className="hero-shade" />
        <span className="hb-hero-rank">#{i + 1}</span>
        {a.id != null && <span className="hb-hero-views"><Icon name="eye" size={14} /> <AnimeViewsText id={a.id} /></span>}
        <span className="hb-hero-title"><b>{words[0]}</b> {words.slice(1).join(' ')}</span>
      </button>
      {list.length > 1 && <span className="hb-hero-dots">{list.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span>}
    </div>
  )
}

function Pod({ r, rank, size }) {
  return (
    <div className={`tl-pod p${rank}`}>
      {rank === 1 && <svg className="tl-crown" viewBox="0 0 48 30" aria-hidden="true"><defs><linearGradient id="tlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe27a" /><stop offset="1" stopColor="#e09a12" /></linearGradient></defs><path d="M4 26L2 8l12 8L24 2l10 14 12-8-2 18z" fill="url(#tlg)" stroke="#b97a08" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="24" cy="6" r="2" fill="#fff6c9" /></svg>}
      <div className="tl-av">
        {r ? <Face url={r.avatar} name={r.name} size={size} /> : <i className="avatar tl-empty" style={{ width: size, height: size }} />}
        <span className={`tl-rk r${rank}`}>{rank}</span>
      </div>
      <span className="tl-name">{r ? r.name : '—'}</span>
      <span className="tl-tag">{r && <ClanTag uid={r.user_id} size={14} />}</span>
      <b className="tl-val">{r ? <>{fmtXpShort(r.gain)}<small> XP</small></> : ''}</b>
    </div>
  )
}
function TopXpSlide({ rows, loading, onOpen }) {
  const r = (n) => rows[n - 1] || null
  return (
    <button className="hb-slide hb-xp tl" onClick={onOpen} aria-label="Buka leaderboard XP">
      <i className="tl-glow" />
      <div className="tl-head">
        <span className="tl-title"><Icon name="crown" size={18} /> TOP LEADER<em>HARIAN</em></span>
        <span className="tl-all">Lihat semua <Icon name="chevron" size={15} /></span>
      </div>
      {rows.length === 0 ? <div className="hb-xp-empty">{loading ? 'Memuat…' : 'Belum ada yang dapat XP hari ini'}</div> : (
        <>
          <div className="tl-podium"><Pod r={r(2)} rank={2} size={44} /><Pod r={r(1)} rank={1} size={56} /><Pod r={r(3)} rank={3} size={44} /></div>
          <div className="tl-chips">
            {[4, 5].map((n) => (
              <span key={n} className="tl-chip">
                {r(n) ? <Face url={r(n).avatar} name={r(n).name} size={20} /> : <i className="avatar tl-empty" style={{ width: 20, height: 20 }} />}
                <em>#{n}</em><span className="tl-cn">{r(n)?.name || ''}</span>{r(n) && <b className="tl-val">{fmtXpShort(r(n).gain)}</b>}
              </span>
            ))}
          </div>
        </>
      )}
    </button>
  )
}

function GivPod({ r, rank, size }) {
  return (
    <div className={`tl-pod p${rank}`}>
      {rank === 1 && <svg className="tl-crown" viewBox="0 0 48 30" aria-hidden="true"><defs><linearGradient id="tgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe27a" /><stop offset="1" stopColor="#e09a12" /></linearGradient></defs><path d="M4 26L2 8l12 8L24 2l10 14 12-8-2 18z" fill="url(#tgg)" stroke="#b97a08" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="24" cy="6" r="2" fill="#fff6c9" /></svg>}
      <div className="tl-av">
        {r ? <Face url={r.avatar} name={r.name} size={size} /> : <i className="avatar tl-empty" style={{ width: size, height: size }} />}
        <span className={`tl-rk r${rank}`}>{rank}</span>
      </div>
      <span className="tl-name">{r ? r.name : '—'}</span>
      <span className="tl-tag">{r && <ClanTag uid={r.user_id} size={14} />}</span>
      <b className="tl-val">{r ? <>{fmtXpShort(r.days)}<small> hari</small></> : ''}</b>
    </div>
  )
}
function TopGiverSlide({ rows, loading, onOpen }) {
  const r = (n) => rows[n - 1] || null
  return (
    <button className="hb-slide hb-xp tl tg-slide" onClick={onOpen} aria-label="Buka Top Giver">
      <i className="tl-glow" />
      <div className="tl-head">
        <span className="tl-title"><Icon name="gift" size={18} /> TOP GIVER<em>GIVEAWAY</em></span>
        <span className="tl-all">Lihat semua <Icon name="chevron" size={15} /></span>
      </div>
      {rows.length === 0 ? <div className="hb-xp-empty">{loading ? 'Memuat…' : 'Belum ada giver. Buat giveaway di Chat Global!'}</div> : (
        <>
          <div className="tl-podium"><GivPod r={r(2)} rank={2} size={44} /><GivPod r={r(1)} rank={1} size={56} /><GivPod r={r(3)} rank={3} size={44} /></div>
          <div className="tl-chips">
            {[4, 5].map((n) => (
              <span key={n} className="tl-chip">
                {r(n) ? <Face url={r(n).avatar} name={r(n).name} size={20} /> : <i className="avatar tl-empty" style={{ width: 20, height: 20 }} />}
                <em>#{n}</em><span className="tl-cn">{r(n)?.name || ''}</span>{r(n) && <b className="tl-val">{fmtXpShort(r(n).days)}h</b>}
              </span>
            ))}
          </div>
        </>
      )}
    </button>
  )
}

function LvPod({ r, rank, size }) {
  return (
    <div className={`tl-pod p${rank}`}>
      {rank === 1 && <svg className="tl-crown" viewBox="0 0 48 30" aria-hidden="true"><defs><linearGradient id="tlv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe27a" /><stop offset="1" stopColor="#e09a12" /></linearGradient></defs><path d="M4 26L2 8l12 8L24 2l10 14 12-8-2 18z" fill="url(#tlv)" stroke="#b97a08" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="24" cy="6" r="2" fill="#fff6c9" /></svg>}
      <div className="tl-av">
        {r ? <Face url={r.avatar} name={r.name} size={size} /> : <i className="avatar tl-empty" style={{ width: size, height: size }} />}
        <span className={`tl-rk r${rank}`}>{rank}</span>
      </div>
      <span className="tl-name">{r ? r.name : '—'}</span>
      <span className="tl-tag">{r && <ClanTag uid={r.user_id} size={14} />}</span>
      <b className="tl-val">{r ? <LevelBadge xp={r.total_xp} role="user" dot className="lb-lvl" /> : ''}</b>
    </div>
  )
}
function TopLevelSlide({ rows, loading, onOpen }) {
  const r = (n) => rows[n - 1] || null
  return (
    <button className="hb-slide hb-xp tl tlv-slide" onClick={onOpen} aria-label="Buka Top Level">
      <i className="tl-glow" />
      <div className="tl-head">
        <span className="tl-title"><Icon name="crown" size={18} /> TOP LEVEL<em>TERTINGGI</em></span>
        <span className="tl-all">Lihat semua <Icon name="chevron" size={15} /></span>
      </div>
      {rows.length === 0 ? <div className="hb-xp-empty">{loading ? 'Memuat…' : 'Belum ada yang masuk peringkat level'}</div> : (
        <>
          <div className="tl-podium"><LvPod r={r(2)} rank={2} size={44} /><LvPod r={r(1)} rank={1} size={56} /><LvPod r={r(3)} rank={3} size={44} /></div>
          <div className="tl-chips">
            {[4, 5].map((n) => (
              <span key={n} className="tl-chip">
                {r(n) ? <Face url={r(n).avatar} name={r(n).name} size={20} /> : <i className="avatar tl-empty" style={{ width: 20, height: 20 }} />}
                <em>#{n}</em><span className="tl-cn">{r(n)?.name || ''}</span>{r(n) && <b className="tl-val"><LevelBadge xp={r(n).total_xp} role="user" dot className="lb-lvl" /></b>}
              </span>
            ))}
          </div>
        </>
      )}
    </button>
  )
}

export default function HomeBanner({ items, onOpen }) {
  const { nav, focusKey } = useApp()
  const ref = useRef(null)
  const [idx, setIdx] = useState(0)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [givers, setGivers] = useState([])
  const [gLoading, setGLoading] = useState(true)
  const [levels, setLevels] = useState([])
  const [lLoading, setLLoading] = useState(true)

  useEffect(() => {
    let off = false
    getLeaderboard('daily').then((r) => { if (!off) setRows(r) }).catch(() => {}).finally(() => { if (!off) setLoading(false) })
    return () => { off = true }
  }, [focusKey])

  useEffect(() => {
    let off = false
    getTopGivers('all', 5).then((r) => { if (!off) setGivers(r) }).catch(() => {}).finally(() => { if (!off) setGLoading(false) })
    return () => { off = true }
  }, [focusKey])

  useEffect(() => {
    let off = false
    getTopLevels(5).then((r) => { if (!off) setLevels(r) }).catch(() => {}).finally(() => { if (!off) setLLoading(false) })
    return () => { off = true }
  }, [focusKey])

  const pool = useMemo(() => items.slice(0, 18), [items])
  if (!pool.length) return null
  return (
    <div className="hb-wrap">
      <div className="hb" ref={ref} onScroll={() => { const el = ref.current; if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth)) }}>
        <div className="hb-cell"><TopAnimeSlide pool={pool} onOpen={onOpen} /></div>
        <div className="hb-cell"><TopXpSlide rows={rows} loading={loading} onOpen={() => nav.push('leaderboard')} /></div>
        <div className="hb-cell"><TopGiverSlide rows={givers} loading={gLoading} onOpen={() => nav.push('topgiver')} /></div>
        <div className="hb-cell"><TopLevelSlide rows={levels} loading={lLoading} onOpen={() => nav.push('toplevel')} /></div>
      </div>
      <div className="dots">{[0, 1, 2, 3].map((i) => <i key={i} className={i === idx ? 'on' : ''} />)}</div>
    </div>
  )
}
