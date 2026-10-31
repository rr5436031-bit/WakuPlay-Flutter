import { useCallback, useEffect, useRef, useState } from 'react'
import * as C from '../services/clan'
import { fmtNum, refreshGold } from '../lib/gold'
import GoldCoin from './GoldCoin'
import Icon from './Icon'
import { Sheet } from './ClanSheets'

const pad = (n) => String(n).padStart(2, '0')
const hms = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`

export default function DailyClan({ act, focusKey }) {
  const [st, setSt] = useState(null)
  const [left, setLeft] = useState(0)
  const [rules, setRules] = useState(false)
  const endAt = useRef(0)

  const apply = useCallback((s) => {
    setSt(s)
    const r = Number(s?.remaining) || 0
    endAt.current = performance.now() + r * 1000
    setLeft(r)
  }, [])
  const load = useCallback(() => C.clanDailyStatus().then(apply).catch(() => {}), [apply])
  useEffect(() => { load() }, [load, focusKey])

  useEffect(() => {
    if (!st?.in_clan || !(left > 0)) return
    const t = setInterval(() => {
      const r = Math.max(0, Math.ceil((endAt.current - performance.now()) / 1000))
      setLeft(r)
      if (r === 0) load()
    }, 500)
    return () => clearInterval(t)
  }, [st, left > 0, load])

  if (!st || !st.in_clan) return null

  const off = !st.enabled
  const ready = st.enabled && left === 0 && st.reward > 0
  const claim = () => act.run(async () => {
    if (!ready) return
    const r = await C.clanDailyClaim(C.newReq())
    apply(r.status); refreshGold()
    act.say(`Daily Clan: +${fmtNum(r.gold)} WakuGold`)
  }).finally(load)

  return (
    <>
      <div className={`cl-daily ${ready ? 'ready' : ''} ${off ? 'off' : ''}`}>
        <button className="cl-daily-info" onClick={() => setRules(true)} aria-label="Aturan Daily Clan">
          <span className="cl-daily-ico"><GoldCoin size={30} /></span>
          <span className="cl-daily-txt">
            <b>Daily Clan</b>
            <small>{off ? 'Sedang dinonaktifkan' : st.reward > 0 ? <>Hadiah Lv.{st.level}: <em>+{fmtNum(st.reward)}</em> Gold</> : 'Hadiah belum diatur'}</small>
          </span>
        </button>
        <button className="cl-daily-act" disabled={!ready || act.busy} onClick={claim}>
          {off ? 'Nonaktif' : ready ? (act.busy ? 'Memproses…' : 'Klaim') : <><Icon name="clock" size={16} />{hms(left)}</>}
        </button>
      </div>

      {rules && (
        <Sheet title="Aturan Daily Clan" onClose={() => setRules(false)}>
          <ul className="cl-rules">
            <li>Klaim <b>{fmtNum(st.reward)} WakuGold</b> sekali tiap <b>{st.hours} jam</b>.</li>
            <li>Baru masuk clan? Tunggu {st.hours} jam dulu sejak waktu masuk.</li>
            <li>Setelah klaim, timer mulai lagi {st.hours} jam. Keluar atau pindah clan <b>tidak</b> mereset timer.</li>
            <li>Hadiah mengikuti level clan saat kamu klaim. Waktu memakai jam server.</li>
            {st.next_level && <li>Level clan naik ke Lv.{st.next_level} → hadiah jadi <b>{fmtNum(st.next_reward)}</b> Gold.</li>}
          </ul>
          <h3 className="cl-h3">Hadiah per level clan</h3>
          <div className="cl-tiers">
            {(st.tiers || []).map((t, i, a) => {
              const end = a[i + 1] ? a[i + 1].min_level - 1 : null
              const me = st.level >= t.min_level && (end === null || st.level <= end)
              return <div key={t.min_level} className={me ? 'on' : ''}><span>{end === null ? `Lv.${t.min_level}+` : end === t.min_level ? `Lv.${t.min_level}` : `Lv.${t.min_level}–${end}`}</span><b><GoldCoin size={16} />{fmtNum(t.gold)}</b></div>
            })}
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>Total klaim kamu: {fmtNum(st.total_claims)}×</p>
        </Sheet>
      )}
    </>
  )
}
