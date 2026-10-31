import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context'
import Icon from '../components/Icon'
import GoldCoin from '../components/GoldCoin'
import CosmicBg from '../components/CosmicBg'
import { ClanEmblem, WallIcon, CarrotIcon, BorderIcon, BadgeIcon } from '../components/GameIcons'
import { GAME_INFO, NEWS, lastUpdated, isNewGame } from '../lib/gameInfo'

const ICONS = { start: () => <GoldCoin size={40} />, clans: ClanEmblem, farm: CarrotIcon, gacha: WallIcon, avborder: BorderIcon, badge: BadgeIcon }
const dateId = (iso) => { try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return iso } }

function Rich({ text }) {
  return String(text).split('**').map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))
}

function Topic({ g, t, n, open, onToggle }) {
  return (
    <div className={`gi-topic ${open ? 'open' : ''}`}>
      <button className="gi-th" onClick={onToggle} aria-expanded={open}>
        <span className="gi-num">{n}</span>
        <span className="gi-tt"><b>{t.title}{t.isNew && <em className="gi-new">BARU</em>}</b>{t.summary && <small>{t.summary}</small>}</span>
        <Icon name="chevdown" size={20} />
      </button>
      {open && (
        <div className="gi-tb">
          <ol className="gi-steps">{t.steps.map((s, i) => <li key={i}><i>{i + 1}</i><p><Rich text={s} /></p></li>)}</ol>
          {t.tips?.map((s, i) => <div key={i} className="gi-tip"><Icon name="bolt" size={16} /><p><b>Tips: </b><Rich text={s} /></p></div>)}
          {t.warn && <div className="gi-warn"><Icon name="shield" size={16} /><p><Rich text={t.warn} /></p></div>}
        </div>
      )}
    </div>
  )
}

export default function GameInfo({ section }) {
  const { nav } = useApp()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set(GAME_INFO.map((g) => `${g.id}/${g.topics[0].id}`)))
  const [active, setActive] = useState(section || GAME_INFO[0].id)
  const body = useRef(null)
  const refs = useRef({})
  const chips = useRef(null)
  const lock = useRef(0)
  const ql = q.trim().toLowerCase()

  const games = useMemo(() => GAME_INFO.map((g) => ({
    ...g,
    shown: g.topics.filter((t) => !ql || [t.title, t.summary, ...(t.steps || []), ...(t.tips || []), t.warn].filter(Boolean).join(' ').toLowerCase().includes(ql)),
  })).filter((g) => g.shown.length > 0), [ql])

  const goTo = (id, smooth = true) => {
    const el = refs.current[id]
    if (!el || !body.current) return
    lock.current = Date.now()
    setActive(id)
    body.current.scrollTo({ top: Math.max(0, el.offsetTop - 6), behavior: smooth ? 'smooth' : 'auto' })
  }
  useEffect(() => { if (section) setTimeout(() => goTo(section, false), 60) }, [])

  const onScroll = () => {
    if (Date.now() - lock.current < 700) return
    const top = (body.current?.scrollTop || 0) + 40
    let cur = games[0]?.id
    for (const g of games) { const el = refs.current[g.id]; if (el && el.offsetTop <= top) cur = g.id }
    if (cur && cur !== active) setActive(cur)
  }
  useEffect(() => {
    const el = chips.current?.querySelector('.on')
    if (el && chips.current) chips.current.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' })
  }, [active])

  const toggle = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const isOpen = (g, t) => !!ql || open.has(`${g.id}/${t.id}`)

  return (
    <div className="cs-page">
      <CosmicBg />
      <div className="gi-head">
        <div className="gi-bar">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <div><h1>Info!</h1><small>Tutorial &amp; panduan WakuGames</small></div>
        </div>
        <label className="gi-search"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tutorial, misal: daily, panen, border" />{q && <button onClick={() => setQ('')} aria-label="Hapus"><Icon name="close" size={16} /></button>}</label>
        {games.length > 0 && (
          <div className="gi-chips" ref={chips}>
            {games.map((g) => { const I = ICONS[g.id]; return (
              <button key={g.id} className={active === g.id ? 'on' : ''} style={{ '--ac': g.accent }} onClick={() => goTo(g.id)}>
                <span className="gi-ci">{I && <I />}</span>{g.title}{isNewGame(g) && <i className="gi-dot" />}
              </button>
            ) })}
          </div>
        )}
      </div>

      <div className="cs-scroll gi-body page-scroll" ref={body} onScroll={onScroll}>
        {!ql && (
          <div className="gi-news">
            <h2><Icon name="star" size={16} /> Yang baru</h2>
            {NEWS.slice(0, 3).map((n, i) => <p key={i}><b>{dateId(n.date)}</b><span>{n.text}</span></p>)}
          </div>
        )}

        {games.length === 0 && <p className="gi-empty">Tidak ada tutorial yang cocok dengan “{q}”.</p>}

        {games.map((g) => {
          const I = ICONS[g.id]
          return (
            <section key={g.id} className="gi-sec" ref={(el) => { refs.current[g.id] = el }} style={{ '--ac': g.accent }}>
              <div className="gi-hero">
                <span className="gi-hi">{I && <I />}</span>
                <div className="gi-ht"><h2>{g.title}{isNewGame(g) && <em className="gi-new">BARU</em>}</h2><p>{g.tagline}</p></div>
                {g.route && <button className="gi-go" onClick={() => nav.push(g.route)}>Buka<Icon name="chevron" size={15} /></button>}
              </div>
              <div className="gi-list">
                {g.shown.map((t, i) => <Topic key={t.id} g={g} t={t} n={i + 1} open={isOpen(g, t)} onToggle={() => toggle(`${g.id}/${t.id}`)} />)}
              </div>
            </section>
          )
        })}

        <p className="gi-foot">Info diperbarui {dateId(lastUpdated())}. Ada game atau fitur baru? Halaman ini ikut diperbarui.</p>
      </div>
    </div>
  )
}
