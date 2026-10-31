import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context'
import { useGold, setGoldLocal, fmtNum } from '../lib/gold'
import { farmState, farmView, farmHarvest, farmUpgrade, farmBuy, farmEquip, CATS, RAR, FENCE_COLOR, fmtCountdown, fmtDur } from '../services/farm'
import Icon from '../components/Icon'
import GoldCoin from '../components/GoldCoin'
import { TreeArt, LampArt, PetArt, PersonArt, ItemArt } from '../components/FarmArt'

const SLOTS = (() => {
  const rows = [[214, 4], [232, 5], [250, 6]], out = []
  rows.forEach(([y, n], r) => { const span = 200 + r * 40, x0 = 180 - span / 2; for (let i = 0; i < n; i++) out.push([x0 + (span / (n - 1)) * i, y]) })
  return out
})()

function Plant({ x, y, ripe }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {ripe && <path d="M-5 -2 L5 -2 L0 13 Z" fill="#ff8a1f" stroke="#c75d00" strokeWidth=".8" />}
      <path d="M0 -3 C-9 -9 -9 -19 0 -22 C9 -19 9 -9 0 -3Z" fill="#3fb85a" />
      <path d="M-1 -3 C-14 -4 -16 -14 -9 -17 C-6 -11 -3 -7 -1 -3Z" fill="#2f9d49" />
      <path d="M1 -3 C14 -4 16 -14 9 -17 C6 -11 3 -7 1 -3Z" fill="#2f9d49" />
    </g>
  )
}

const Scene = memo(function Scene({ level, stock, eq, items }) {
  const shown = level > 0 ? Math.min(SLOTS.length, 3 + level * 2) : 0
  const ripe = Math.min(stock, shown)
  const fence = FENCE_COLOR[eq.fence]
  return (
    <div className="fm-scene">
      <i className="fm-sun" />
      <i className="fm-cloud c1" /><i className="fm-cloud c2" />
      <i className="fm-stars" />
      <div className="fm-stage">
        <svg viewBox="0 0 360 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <defs>
            <linearGradient id="fmh1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b7d63" /><stop offset="1" stopColor="#14493e" /></linearGradient>
            <linearGradient id="fmh2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#39a066" /><stop offset="1" stopColor="#1f6b49" /></linearGradient>
            <linearGradient id="fmsoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a4d2b" /><stop offset="1" stopColor="#5a3519" /></linearGradient>
          </defs>
          <path d="M0 118 Q90 70 190 108 T360 96 V300 H0Z" fill="url(#fmh1)" />
          <path d="M0 172 Q120 132 240 166 T360 150 V300 H0Z" fill="url(#fmh2)" />
          <polygon points="52,196 308,196 340,268 20,268" fill="url(#fmsoil)" stroke="#3d2411" strokeWidth="2" />
          {[214, 232, 250].map((y) => <line key={y} x1={180 - (100 + (y - 214) * 2.2)} x2={180 + (100 + (y - 214) * 2.2)} y1={y + 4} y2={y + 4} stroke="#4a2c14" strokeWidth="2.4" opacity=".7" />)}
          {SLOTS.slice(0, shown).map(([x, y], i) => <Plant key={i} x={x} y={y} ripe={i < ripe} />)}
          {level === 0 && (
            <g transform="translate(180 226)"><rect x="-44" y="-18" width="88" height="30" rx="6" fill="#b9803f" stroke="#6e4515" strokeWidth="2" /><text x="0" y="3" textAnchor="middle" fontSize="13" fontWeight="800" fill="#3d2411">Kosong</text><rect x="-3" y="12" width="6" height="14" fill="#8a5a22" /></g>
          )}
          {fence && (
            <g>
              <rect x="14" y="272" width="332" height="5" rx="2" fill={fence} opacity=".9" /><rect x="14" y="282" width="332" height="5" rx="2" fill={fence} opacity=".9" />
              {Array.from({ length: 14 }).map((_, i) => <rect key={i} x={16 + i * 25.5} y="266" width="7" height="28" rx="2.500" fill={fence} stroke="rgba(0,0,0,.25)" strokeWidth="1" />)}
            </g>
          )}
        </svg>
        {eq.tree && <div className="fm-tree"><TreeArt id={eq.tree} /></div>}
        {eq.lamp && <div className="fm-lamp"><i className="fm-glow" /><LampArt id={eq.lamp} /></div>}
        {eq.pet && <div className="fm-pet"><div className="fm-pet-in"><PetArt id={eq.pet} /></div></div>}
        {eq.person && <div className="fm-person"><PersonArt id={eq.person} /></div>}
      </div>
    </div>
  )
})

function Clock({ to, skew }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [])
  return fmtCountdown(to - (Date.now() + skew))
}

function FarmMine() {
  const { nav } = useApp()
  const gold = useGold()
  const [st, setSt] = useState(null)
  const [skew, setSkew] = useState(0)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [pop, setPop] = useState(null)
  const [shop, setShop] = useState(false)
  const [cat, setCat] = useState('fence')
  const [sel, setSel] = useState(null)
  const [up, setUp] = useState(false)
  const [info, setInfo] = useState(false)
  const alive = useRef(true)

  const flash = (t) => { setToast(t); setTimeout(() => setToast(''), 2200) }
  const apply = useCallback((s) => {
    setSt(s); setSkew(new Date(s.server_now).getTime() - Date.now())
    if (s.gold != null) setGoldLocal(Number(s.gold))
  }, [])
  const load = useCallback(async () => { try { apply(await farmState()) } catch (e) { flash(e.message) } }, [apply])
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false } }, [load])

  const nextAt = st?.next_at ? new Date(st.next_at).getTime() : null
  useEffect(() => {
    if (!nextAt) return
    const ms = nextAt - (Date.now() + skew) + 800
    if (ms > 2147483000) return
    const t = setTimeout(load, Math.max(ms, 800))
    return () => clearTimeout(t)
  }, [nextAt, skew, load])

  const eq = useMemo(() => {
    const e = { ...(st?.equipped || {}) }
    if (sel) e[sel.cat] = sel.id
    return e
  }, [st, sel])

  async function run(fn, after) {
    if (busy) return
    setBusy(true)
    try { const r = await fn(); apply(r); after?.(r) } catch (e) { flash(e.message) }
    setBusy(false)
  }
  const harvest = () => run(farmHarvest, (r) => {
    if (r.ok === false) return flash('Belum ada wortel yang siap')
    setPop({ text: `+${fmtNum(r.earned)}` }); setTimeout(() => setPop(null), 1600)
  })
  const upgrade = () => run(farmUpgrade, () => { setUp(false); flash('Kebun naik level!') })
  const buy = (it) => run(() => farmBuy(it.id), () => flash(`${it.name} dibeli`))
  const equip = (cat2, id) => run(() => farmEquip(cat2, id), () => {})

  if (!st) return <div className="fm-page"><div className="fm-load">{toast || 'Memuat kebun…'}</div></div>
  const empty = st.level === 0
  const full = !empty && st.stock >= st.cap
  const pct = empty ? 0 : Math.min(1, st.stock / st.cap)
  const worth = st.stock * Number(st.carrot_gold)
  const items = st.items.filter((i) => i.cat === cat)
  const owned = new Set(st.owned)
  const nx = st.next

  return (
    <div className="fm-page">
      <Scene level={st.level} stock={st.stock} eq={eq} items={st.items} />

      <div className="fm-top">
        <button className="fm-ib" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={22} /></button>
        <div className="fm-title"><b>Kebun Waku</b><span>{empty ? 'Belum ditanami' : `Level ${st.level}`}</span></div>
        <div className="fm-gold"><GoldCoin size={20} /><b>{gold == null ? '…' : fmtNum(gold)}</b></div>
        <button className="fm-ib" onClick={() => setInfo(true)} aria-label="Info"><Icon name="info" size={20} /></button>
      </div>

      <div className="fm-card">
        <div className="fm-ring" style={{ '--p': `${pct * 360}deg` }}><span>{empty ? '–' : `${st.stock}/${st.cap}`}</span></div>
        <div className="fm-card-tx">
          <small>{empty ? 'KEBUN KOSONG' : full ? 'KERANJANG PENUH' : 'WORTEL BERIKUTNYA'}</small>
          <b>{empty ? 'Upgrade untuk mulai' : full ? 'Panen dulu ya' : nextAt == null ? '--:--:--' : <Clock to={nextAt} skew={skew} />}</b>
          {!empty && <em>+{st.yield} wortel / {fmtDur(st.interval_min)} · 1 wortel = {st.carrot_gold} Gold</em>}
        </div>
      </div>

      {pop && <div className="fm-pop"><GoldCoin size={26} />{pop.text}</div>}
      {toast && <div className="fm-toast">{toast}</div>}

      <div className="fm-dock">
        <button className="fm-btn harvest" disabled={busy || empty || st.stock === 0} onClick={harvest}>
          <Icon name="basket" size={22} /><b>Panen</b><span>{empty ? 'kosong' : st.stock > 0 ? `${fmtNum(worth)} Gold` : 'belum ada'}</span>
        </button>
        <button className="fm-btn up" disabled={busy || !nx} onClick={() => setUp(true)}>
          <Icon name="chevron-up" size={22} /><b>{empty ? 'Tanam' : 'Upgrade'}</b><span>{nx ? <><GoldCoin size={13} />{fmtNum(nx.cost)}</> : 'MAX'}</span>
        </button>
        <button className="fm-btn shop" onClick={() => { setShop(true); setSel(null) }}>
          <Icon name="store" size={22} /><b>Toko</b><span>dekorasi</span>
        </button>
      </div>

      {up && nx && (
        <div className="fm-bg" onClick={() => !busy && setUp(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{empty ? 'Tanam Wortel' : `Upgrade ke Level ${nx.level}`}</h3>
            <div className="fm-cmp">
              <div><small>Waktu berbuah</small><b>{empty ? '—' : fmtDur(st.interval_min)}</b><i>→</i><b className="g">{fmtDur(nx.interval_min)}</b></div>
              <div><small>Wortel per panen</small><b>{empty ? '—' : st.yield}</b><i>→</i><b className="g">{nx.yield}</b></div>
              <div><small>Kapasitas keranjang</small><b>{empty ? '—' : st.cap}</b><i>→</i><b className="g">{nx.cap}</b></div>
            </div>
            <button className="fm-ok" disabled={busy} onClick={upgrade}>{busy ? 'Memproses…' : <>{empty ? 'Tanam' : 'Upgrade'} <GoldCoin size={16} /> {fmtNum(nx.cost)}</>}</button>
            {gold != null && gold < nx.cost && <p className="fm-warn">WakuGold kurang {fmtNum(nx.cost - gold)}</p>}
            <button className="fm-link" onClick={() => setUp(false)}>Batal</button>
          </div>
        </div>
      )}

      {shop && (
        <div className="fm-sheet-bg" onClick={() => { setShop(false); setSel(null) }}>
          <div className="fm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fm-sh-head"><b>Toko Dekorasi</b><button className="fm-ib sm" onClick={() => { setShop(false); setSel(null) }} aria-label="Tutup"><Icon name="close" size={18} /></button></div>
            <div className="fm-cats">{CATS.map((c) => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => { setCat(c.id); setSel(null) }}>{c.label}</button>)}</div>
            <div className="fm-items">
              {items.map((it) => {
                const has = owned.has(it.id), on = st.equipped[it.cat] === it.id
                return (
                  <button key={it.id} className={`fm-it ${sel?.id === it.id ? 'sel' : ''} ${on ? 'on' : ''}`} style={{ '--rc': RAR[it.rarity].color }} onClick={() => setSel(sel?.id === it.id ? null : it)}>
                    <span className="fm-it-ic"><ItemArt it={it} /></span>
                    <b>{it.name}</b><em>{RAR[it.rarity].label}</em>
                    <span className="fm-it-p">{on ? 'Terpasang' : has ? 'Dimiliki' : <><GoldCoin size={13} />{fmtNum(it.price)}</>}</span>
                  </button>
                )
              })}
            </div>
            {sel ? (
              owned.has(sel.id) ? (
                st.equipped[sel.cat] === sel.id
                  ? <button className="fm-ok alt" disabled={busy} onClick={() => equip(sel.cat, null)}>Copot {sel.name}</button>
                  : <button className="fm-ok" disabled={busy} onClick={() => equip(sel.cat, sel.id)}>Pasang {sel.name}</button>
              ) : (
                <button className="fm-ok" disabled={busy || (gold != null && gold < sel.price)} onClick={() => buy(sel)}>
                  {gold != null && gold < sel.price ? `WakuGold kurang ${fmtNum(sel.price - gold)}` : <>Beli <GoldCoin size={16} /> {fmtNum(sel.price)}</>}
                </button>
              )
            ) : <p className="fm-hint">Ketuk item untuk melihat pratinjau di kebunmu</p>}
          </div>
        </div>
      )}

      {info && (
        <div className="fm-bg" onClick={() => setInfo(false)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Cara main</h3>
            <ul className="fm-rules">
              <li>Kebun awalnya kosong. <b>Upgrade</b> ke level 1 untuk menanam wortel.</li>
              <li>Wortel berbuah tiap beberapa menit (level 1 = {fmtDur(st.next?.interval_min || st.interval_min || 60)}). Buah menumpuk di keranjang walau aplikasi ditutup.</li>
              <li>Keranjang penuh = produksi berhenti, jadi panen sebelum penuh.</li>
              <li><b>1 wortel = {st.carrot_gold} WakuGold.</b> Tekan Panen untuk menukarnya.</li>
              <li>Tiap upgrade: waktu lebih singkat, wortel lebih banyak, keranjang lebih besar.</li>
              <li>Hiasi kebun dengan pagar, lampu, pohon, pet, dan orang dari Toko.</li>
            </ul>
            <button className="fm-ok" onClick={() => setInfo(false)}>Mengerti</button>
          </div>
        </div>
      )}
    </div>
  )
}

function FarmView({ uid, name }) {
  const { nav } = useApp()
  const [st, setSt] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let on = true
    setSt(null); setErr('')
    farmView(uid).then((s) => on && setSt(s)).catch((e) => on && setErr(e.message || 'Gagal memuat kebun'))
    return () => { on = false }
  }, [uid])
  const who = name || 'Pemain'
  if (!st) {
    return (
      <div className="fm-page">
        <div className="fm-top"><button className="fm-ib" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={22} /></button></div>
        <div className="fm-load">{err || 'Memuat kebun…'}</div>
      </div>
    )
  }
  const level = Number(st.level) || 0
  const max = Math.max(1, Number(st.max_level) || 1)
  return (
    <div className="fm-page fm-visit">
      <Scene level={level} stock={Number(st.ripe) || 0} eq={st.equipped || {}} items={[]} />
      <div className="fm-top">
        <button className="fm-ib" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={22} /></button>
        <div className="fm-title"><b>Kebun {who}</b><span>{level === 0 ? 'Belum ditanami' : `Level ${level}`}</span></div>
      </div>
      <div className="fm-card">
        <div className="fm-ring" style={{ '--p': `${Math.min(1, level / max) * 360}deg` }}><span>Lv {level}</span></div>
        <div className="fm-card-tx">
          <small>KEBUN {who.toUpperCase()}</small>
          <b>{level === 0 ? 'Masih kosong' : `${Number(st.ripe) || 0} wortel matang`}</b>
          <em><Icon name="eye" size={13} /> Mode lihat saja, tidak bisa diubah</em>
        </div>
      </div>
    </div>
  )
}

export default function Farm({ uid, name }) {
  const { user } = useApp()
  if (uid && uid !== user?.id) return <FarmView uid={uid} name={name} />
  return <FarmMine />
}
