import { useEffect, useRef, useState } from 'react'
import { useGold, setGoldLocal, fmtNum } from '../lib/gold'
import { petSummon, PET_RARITY } from '../services/pet'
import GoldCoin from './GoldCoin'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const short = (n) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}K` : fmtNum(n))
const preload = (list) => Promise.race([
  Promise.all([...new Set(list.map((p) => p.image_url))].map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u }))),
  sleep(1800),
])

function Egg() {
  return (
    <svg viewBox="0 0 120 150" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="pgEg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff07a" /><stop offset=".5" stopColor="#ffbf1a" /><stop offset="1" stopColor="#c47a00" /></linearGradient>
        <linearGradient id="pgSh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#b86e00" stopOpacity="0" /><stop offset="1" stopColor="#b86e00" stopOpacity=".55" /></linearGradient>
      </defs>
      <path d="M60 6C88 6 108 46 108 88c0 33-22 56-48 56S12 121 12 88C12 46 32 6 60 6z" fill="url(#pgEg)" />
      <path d="M60 6C88 6 108 46 108 88c0 33-22 56-48 56 20-14 30-40 26-70C84 44 74 20 60 6z" fill="url(#pgSh)" />
      <ellipse cx="42" cy="44" rx="13" ry="12" fill="#fff" opacity=".85" />
      <ellipse cx="82" cy="98" rx="11" ry="7" fill="#fff" opacity=".35" transform="rotate(-25 82 98)" />
    </svg>
  )
}

export default function PetGacha({ info, onClose, onDone }) {
  const gold = useGold()
  const [phase, setPhase] = useState('idle')
  const [res, setRes] = useState(null)
  const [msg, setMsg] = useState('')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const c1 = Number(info?.cost1 ?? 500), c10 = Number(info?.cost10 ?? 5000)
  const empty = info && info.total === 0
  const busy = phase === 'shake' || phase === 'burst'

  async function pull(n) {
    if (busy || !info) return
    const cost = n === 1 ? c1 : c10
    if (gold != null && gold < cost) { setMsg(`WakuGold tidak cukup (butuh ${fmtNum(cost)}).`); return }
    setMsg(''); setPhase('shake')
    const t0 = Date.now()
    try {
      const r = await petSummon(n)
      setGoldLocal(Number(r.gold))
      onDone && onDone()
      await Promise.all([preload(r.results), sleep(Math.max(0, 1100 - (Date.now() - t0)))])
      if (!alive.current) return
      setPhase('burst'); await sleep(320)
      if (!alive.current) return
      setRes(r); setPhase('reveal')
    } catch (e) {
      if (!alive.current) return
      setPhase('idle'); setMsg(e.message || 'Gagal, coba lagi')
    }
  }
  const again = () => { setRes(null); setPhase('idle'); setMsg('') }

  const best = res && res.results.reduce((a, b) => (Object.keys(PET_RARITY).indexOf(b.rarity) < Object.keys(PET_RARITY).indexOf(a.rarity) ? b : a))
  const many = res && res.results.length > 1

  return (
    <div className="pt-bg" onClick={() => !busy && onClose()}>
      <div className="pt-pop" onClick={(e) => e.stopPropagation()}>
        {phase !== 'reveal' ? (
          <>
            <h3>Gacha Pet</h3>
            <p className="pt-sub">Mari mencari pet lucu</p>
            <div className={`pt-egg ${phase}`}>
              <i className="pt-glow" />
              <div className="pt-egg-in"><Egg /></div>
              <i className="pt-flash" />
            </div>
            {phase === 'shake' && <p className="pt-note">Telur bergetar…</p>}
            <div className="pt-btns">
              <button className="pt-pull big one" disabled={busy || empty} onClick={() => pull(1)}><b>1x</b><span><GoldCoin size={18} />{short(c1)}</span></button>
              <button className="pt-pull big ten" disabled={busy || empty} onClick={() => pull(10)}><b>10x</b><span><GoldCoin size={18} />{short(c10)}</span></button>
            </div>
            {empty && <p className="pt-note warn">Belum ada pet di gacha. Tunggu developer menambahkannya.</p>}
            {msg && <p className="pt-note warn">{msg}</p>}
            <p className="pt-bal"><GoldCoin size={16} />{gold == null ? '…' : fmtNum(gold)} WakuGold</p>
            <button className="pt-back" disabled={busy} onClick={onClose}>Kembali</button>
          </>
        ) : (
          <>
            <h3>{many ? 'Hasil Gacha' : 'Pet Baru!'}</h3>
            {!many ? (
              <div className="pt-one" style={{ '--rc': PET_RARITY[best.rarity].color }}>
                <i className="pt-halo" />
                <img src={best.image_url} alt={best.name} decoding="async" draggable={false} referrerPolicy="no-referrer" />
                <span className="pt-chip-r">{PET_RARITY[best.rarity].label}</span>
                <b>{best.name}</b>
                <small>{best.dupe ? 'Pet kembar, jumlahnya bertambah' : 'Masuk ke Penyimpanan. Pasang lewat Kelola'}</small>
              </div>
            ) : (
              <div className="pt-many">
                {res.results.map((p, k) => (
                  <div key={k} className="pt-cell" style={{ '--rc': PET_RARITY[p.rarity].color, '--d': `${k * 55}ms` }}>
                    <img src={p.image_url} alt={p.name} decoding="async" draggable={false} referrerPolicy="no-referrer" />
                    <i>{PET_RARITY[p.rarity].short}</i>
                    <b>{p.name}</b>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-btns">
              <button className="pt-pull one" disabled={empty} onClick={again}><b>Gacha lagi</b></button>
              <button className="pt-pull ghost" onClick={onClose}><b>Selesai</b></button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
