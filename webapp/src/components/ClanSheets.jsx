import { useMemo, useState } from 'react'
import { useAct, ago } from '../lib/clanui'
import { fmtNum } from '../lib/gold'
import { newReq, clanCreate, clanDonate } from '../services/clan'
import { refreshGold } from '../lib/gold'
import GoldCoin from './GoldCoin'
import ClanBadge from './ClanBadge'

export function Sheet({ title, onClose, children }) {
  return (
    <div className="cl-bg" onClick={onClose}>
      <div className="cl-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <i className="cl-grab" />
        {title && <h2 className="cl-sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

export function Confirm({ title, body, yes = 'Ya', danger, busy, onYes, onNo }) {
  return (
    <div className="cl-bg center" style={{ zIndex: 120 }} onClick={busy ? undefined : onNo}>
      <div className="cl-confirm" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="cl-confirm-btns">
          <button className="cl-btn ghost" onClick={onNo} disabled={busy}>Batal</button>
          <button className={`cl-btn ${danger ? 'danger' : 'primary'}`} onClick={onYes} disabled={busy}>{busy ? 'Memproses…' : yes}</button>
        </div>
      </div>
    </div>
  )
}

export function CreateClanSheet({ cfg, gold, onClose, onDone }) {
  const [tag, setTag] = useState('')
  const [name, setName] = useState('')
  const [ask, setAsk] = useState(false)
  const req = useMemo(newReq, [])
  const { busy, msg, run } = useAct()
  const cost = Number(cfg?.create_cost || 3500)
  const tagOk = /^[A-Z0-9]{2,6}$/.test(tag)
  const nameOk = /^[A-Za-z0-9 _.-]{3,20}$/.test(name.trim())
  const enough = (gold || 0) >= cost
  const err = !tag ? '' : !tagOk ? 'Tag 2-6 huruf/angka' : ''
  const nerr = !name ? '' : !nameOk ? 'Nama 3-20 karakter (huruf, angka, spasi, - _ .)' : ''
  const submit = () => run(async () => {
    const id = await clanCreate(tag, name.trim(), req)
    await refreshGold()
    onDone(id)
  })
  return (
    <Sheet title="Buat Clan" onClose={onClose}>
      <div className="cl-prev"><ClanBadge tag={tagOk ? tag : 'TAG'} tier={1} size={30} /></div>
      <label className="cl-field"><span>Tag Clan</span>
        <input value={tag} maxLength={6} placeholder="contoh: STARK" autoCapitalize="characters" onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        {err && <small className="bad">{err}</small>}
      </label>
      <label className="cl-field"><span>Nama Clan</span>
        <input value={name} maxLength={20} placeholder="contoh: Maou" onChange={(e) => setName(e.target.value)} />
        {nerr && <small className="bad">{nerr}</small>}
      </label>
      <div className="cl-cost"><span>Biaya pembuatan</span><b><GoldCoin size={18} /> {fmtNum(cost)}</b></div>
      <div className="cl-cost"><span>WakuGold kamu</span><b className={enough ? '' : 'bad'}><GoldCoin size={18} /> {fmtNum(gold)}</b></div>
      {!enough && <p className="cl-warn">WakuGold belum cukup untuk membuat clan.</p>}
      {msg && <p className="cl-warn">{msg}</p>}
      <button className="cl-btn primary wide" disabled={!tagOk || !nameOk || !enough || busy} onClick={() => setAsk(true)}>Buat Clan</button>
      {ask && <Confirm title="Buat clan?" body={`WakuGold kamu akan dipotong ${fmtNum(cost)} untuk membuat clan [${tag}] ${name.trim()}. Tindakan ini tidak bisa dibatalkan.`} yes={`Bayar ${fmtNum(cost)}`} busy={busy} onNo={() => setAsk(false)} onYes={submit} />}
    </Sheet>
  )
}

export function DonateSheet({ cfg, gold, onClose, onDone }) {
  const rate = Number(cfg?.donate_gold_per_xp || 1)
  const min = Number(cfg?.donate_min || 10)
  const [v, setV] = useState('')
  const [ask, setAsk] = useState(false)
  const req = useMemo(newReq, [])
  const { busy, msg, run } = useAct()
  const n = Math.floor(Number(v) || 0)
  const xp = Math.floor(n / rate)
  const ok = n >= min && n <= (gold || 0) && xp >= 1
  const submit = () => run(async () => {
    const r = await clanDonate(n, req)
    await refreshGold()
    onDone(r)
  })
  return (
    <Sheet title="Setor Gold" onClose={onClose}>
      <p className="cl-sub">Tarif: <b>{fmtNum(rate)} WakuGold = 1 XPGold</b>. Minimal setor {fmtNum(min)} WakuGold.</p>
      <div className="cl-cost"><span>WakuGold kamu</span><b><GoldCoin size={18} /> {fmtNum(gold)}</b></div>
      <label className="cl-field"><span>Jumlah WakuGold</span>
        <input inputMode="numeric" value={v} placeholder="0" onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 9))} />
      </label>
      <div className="cl-chips">{[100, 500, 1000, 5000].map((x) => <button key={x} onClick={() => setV(String(Math.min(x, gold || 0)))}>{fmtNum(x)}</button>)}<button onClick={() => setV(String(gold || 0))}>Semua</button></div>
      <div className="cl-cost"><span>Kamu mendapat</span><b className="gold">+{fmtNum(xp)} XPGold</b></div>
      {n > (gold || 0) && <p className="cl-warn">Saldo WakuGold tidak cukup.</p>}
      {msg && <p className="cl-warn">{msg}</p>}
      <button className="cl-btn primary wide" disabled={!ok || busy} onClick={() => setAsk(true)}>Setor</button>
      {ask && <Confirm title="Setor ke clan?" body={`${fmtNum(n)} WakuGold akan dipotong dan clan menerima ${fmtNum(xp)} XPGold.`} yes="Setor" busy={busy} onNo={() => setAsk(false)} onYes={submit} />}
    </Sheet>
  )
}

export { ago }
