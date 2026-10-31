import { TIER_DEFS, DEV_LEVEL } from './LevelBadge'
import Icon from './Icon'
import { XP_PER_MIN } from '../lib/xp'

const fmt = (n) => Math.floor(n).toLocaleString('id-ID')
const fmtTime = (xp) => {
  const m = Math.floor(xp / XP_PER_MIN)
  const h = Math.floor(m / 60)
  return h ? `${h.toLocaleString('id-ID')}j ${m % 60}m` : `${m}m`
}

export default function LevelProgress({ level, xp, dev, onClose }) {
  const lv = dev ? DEV_LEVEL : level
  const cur = TIER_DEFS.findIndex((t) => lv <= t.max)
  const t = TIER_DEFS[cur]
  const next = TIER_DEFS[cur + 1]
  const pct = !next ? 100 : Math.min(100, Math.max(0, ((lv - t.min) / (t.max - t.min + 1)) * 100))
  return (
    <div className="lp-bg" onClick={onClose}>
      <div className="lp-card" role="dialog" aria-label="Level Progress" onClick={(e) => e.stopPropagation()}>
        <h3>Level Progress</h3>
        <p className="lp-sub">Level {fmt(lv)} · {t.name}</p>
        <div className="lp-list">
          {TIER_DEFS.map((x, i) => {
            const done = i < cur, now = i === cur
            return (
              <div key={x.name} className={`lp-row ${done ? 'done' : now ? 'now' : 'lock'}`} style={{ '--tc': x.color }}>
                <img decoding="async" src={x.icon} alt="" draggable="false" />
                <div className="lp-info">
                  <b>{x.name}</b>
                  <span>Level {fmt(x.min)}{x.max === Infinity ? '+' : ` - ${fmt(x.max)}`}</span>
                  {now && (
                    <>
                      <div className="lp-bar"><i style={{ width: `${pct}%` }} /></div>
                      <small>{next ? `${Math.floor(pct)}% · ${fmt(x.max + 1 - lv)} level lagi ke ${next.name}` : 'Tier tertinggi tercapai'}</small>
                    </>
                  )}
                </div>
                <span className="lp-state">
                  {done ? <span className="lp-ok"><Icon name="check" size={16} /></span> : now ? <span className="lp-ok cur"><Icon name="check" size={16} /></span> : <span className="lp-hg">⏳</span>}
                </span>
              </div>
            )
          })}
        </div>
        <div className="lp-foot"><span>EXP: {dev ? '∞' : fmt(xp)}</span><i /><span>Waktu: {dev ? '∞' : fmtTime(xp)}</span></div>
      </div>
    </div>
  )
}
