import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context'
import { useGold, setGoldLocal, fmtNum } from '../lib/gold'
import { fxLow } from '../lib/perf'
import { petInfo, petHabitat, petPlace, petStore, petClaim, petClaimAll, petSell, petView, PET_RARITY, PET_RARITY_ORDER } from '../services/pet'
import Icon from '../components/Icon'
import GoldCoin from '../components/GoldCoin'
import PetSkyBg from '../components/PetSkyBg'
import SkyIsland from '../components/SkyIsland'
import PetGacha from '../components/PetGacha'
import { PetIcon } from '../components/GameIcons'

const MAX_VIS = 15
const rnd = Math.random
const clamp = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b))
const fmtLeft = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`
}
const fmtShort = (n) => { n = Number(n); return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '')}Jt` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace('.', ',').replace(/,0$/, '')}K` : fmtNum(n) }
const fmtRange = (a, b) => (Number(a) === Number(b) ? fmtNum(a) : `${fmtNum(a)}-${fmtNum(b)}`)

// ===== Area jalan pet = permukaan rumput pulau (elips) =====
// SVG pulau berukuran 100x150 dengan preserveAspectRatio "slice", jadi koordinat SVG dikonversi ke piksel stage
// memakai skala + offset yang sama persis dengan yang dipakai browser. Titik yang dibatasi adalah TELAPAK KAKI pet,
// lalu lebar badan dan label nama dikurangkan dari lebar elips, sehingga seluruh pet + namanya tetap di atas rumput.
const FOOT = 0.96
const walkArea = (W, H, size) => {
  const k = Math.max(W / 100, H / 150)
  const ox = (W - 100 * k) / 2, oy = (H - 150 * k) / 2
  return {
    cx: ox + 50 * k,
    cy: oy + 94 * k,
    rx: Math.max(12, 41 * k - size * 0.75 - 4),
    ry: Math.max(8, 18 * k),
  }
}
const inArea = (a, fx, fy) => ((fx - a.cx) / a.rx) ** 2 + ((fy - a.cy) / a.ry) ** 2 <= 1
const randIn = (a) => { const t = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.94; return { fx: a.cx + Math.cos(t) * r * a.rx, fy: a.cy + Math.sin(t) * r * a.ry } }
const pullIn = (a, fx, fy) => {
  const nx = (fx - a.cx) / a.rx, ny = (fy - a.cy) / a.ry, d = Math.hypot(nx, ny)
  if (!(d > 0.96)) return { fx, fy }
  const k = 0.96 / d
  return { fx: a.cx + nx * k * a.rx, fy: a.cy + ny * k * a.ry }
}
// posisi awal: disebar rata (pola bunga matahari) supaya pet tidak menumpuk di satu titik
const spawn = (a, i, n) => { const t = i * 2.39996, r = Math.sqrt((i + 0.5) / Math.max(1, n)) * 0.88; return { fx: a.cx + Math.cos(t) * r * a.rx, fy: a.cy + Math.sin(t) * r * a.ry } }

const Wander = memo(function Wander({ p, W, H, size, idx, count, paused, tappable, onTap }) {
  const ref = useRef(null)
  const pos = useRef(null)      // telapak kaki pet: { fx, fy } dalam piksel stage
  const area = useMemo(() => walkArea(W, H, size), [W, H, size])

  const put = useCallback((el, c, dur) => {
    el.style.transition = dur ? `transform ${dur.toFixed(2)}s linear` : 'none'
    el.style.transform = `translate3d(${(c.fx - size / 2).toFixed(1)}px,${(c.fy - size * FOOT).toFixed(1)}px,0)`
    el.style.zIndex = String(Math.round(c.fy))
  }, [size])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = pos.current || spawn(area, idx, count)
    const c = pullIn(area, from.fx, from.fy)
    pos.current = c
    put(el, c, 0)
  }, [area, put])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current
    if (!el || paused || fxLow()) return
    let t = 0, dead = false
    const go = () => {
      if (dead || !pos.current) return
      const c = pos.current
      let n = null
      for (let k = 0; k < 8 && !n; k++) {          // cari tujuan yang masih di dalam pulau; kalau di luar, undi ulang
        const ang = rnd() * Math.PI * 2
        const dist = 40 + rnd() * Math.max(40, area.rx * 1.2)
        const tx = c.fx + Math.cos(ang) * dist, ty = c.fy + Math.sin(ang) * dist * 0.5
        if (inArea(area, tx, ty)) n = { fx: tx, fy: ty }
      }
      if (!n) n = randIn(area)
      const d = Math.hypot(n.fx - c.fx, n.fy - c.fy)
      if (d < 10) { t = setTimeout(go, 250); return }
      const dur = d / (14 + rnd() * 18)
      pos.current = n
      put(el, n, dur)
      t = setTimeout(go, dur * 1000 + 500 + rnd() * 2600)
    }
    t = setTimeout(go, rnd() * 1800)
    return () => { dead = true; clearTimeout(t) }
  }, [paused, area, put])

  const rc = PET_RARITY[p.rarity]
  return (
    <div
      ref={ref}
      className={`pw ${p.ready ? 'ready' : ''} ${tappable ? 'tap' : ''}`}
      style={{ width: size, '--rc': rc?.color }}
      onClick={tappable ? () => onTap(p) : undefined}
      role={tappable ? 'button' : undefined}
      aria-label={tappable ? `${p.name}${p.ready ? ', WakuGold siap diklaim' : ''}` : undefined}
    >
      {p.ready && <span className="pw-coin"><GoldCoin size={20} /></span>}
      <div className="pt-fig" style={{ '--d': `${-(Number(p.key) % 7) * 0.5}s` }}>
        <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
        <i className="pt-shadow" />
      </div>
      <span className="pt-name"><i>{rc?.short}</i><span>{p.name}</span></span>
    </div>
  )
})

const Habitat = memo(function Habitat({ pets, paused, tappable, onTap, children }) {
  const ref = useRef(null)
  const [dim, setDim] = useState({ w: 0, h: 0 })
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.hidden)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setDim((d) => (d.w === el.clientWidth && d.h === el.clientHeight ? d : { w: el.clientWidth, h: el.clientHeight }))
    read()
    let ro = null
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(read); ro.observe(el) } else window.addEventListener('resize', read)
    return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', read) }
  }, [])
  useEffect(() => {
    const f = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])
  const size = clamp(dim.w * 0.14, 40, 60)
  const stop = paused || hidden
  return (
    <div ref={ref} className={`pt-stage ${stop ? 'dim' : ''}`}>
      <SkyIsland />
      {dim.w > 0 && pets.slice(0, MAX_VIS).map((p, i, arr) => (
        <Wander key={p.key} p={p} W={dim.w} H={dim.h} size={size} idx={i} count={arr.length} paused={stop} tappable={tappable} onTap={onTap} />
      ))}
      {children}
    </div>
  )
})

function PetHome() {
  const { nav } = useApp()
  const gold = useGold()
  const [hab, setHab] = useState(null)
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [sheet, setSheet] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [, setTick] = useState(0)
  const alive = useRef(true)
  const busyRef = useRef(false)
  const seq = useRef(0)
  const skew = useRef(0)
  const toastT = useRef(0)

  const flash = useCallback((text, ok = false) => {
    if (!alive.current) return
    setToast({ text, ok }); clearTimeout(toastT.current)
    toastT.current = setTimeout(() => alive.current && setToast(null), 2600)
  }, [])

  const load = useCallback(async () => {
    const my = ++seq.current
    try {
      const [i, h] = await Promise.all([petInfo(), petHabitat()])
      if (!alive.current || my !== seq.current) return
      skew.current = Date.parse(h.now) - Date.now() || 0
      setInfo(i); setHab(h); setErr('')
    } catch (e) { if (alive.current && my === seq.current) setErr(e.message || 'Gagal memuat pet') }
  }, [])
  useEffect(() => {
    alive.current = true
    load()
    const tk = setInterval(() => { if (!document.hidden) setTick((n) => (n + 1) % 1e9) }, 1000)
    const vis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', vis)
    return () => { alive.current = false; clearInterval(tk); clearTimeout(toastT.current); document.removeEventListener('visibilitychange', vis) }
  }, [load])

  const now = Date.now() + skew.current
  const placed = useMemo(() => (hab?.placed || []).map((u) => ({ ...u, key: u.unit, readyMs: Date.parse(u.ready_at) })), [hab])
  const readyKey = placed.map((u) => (u.readyMs <= now ? '1' : '0')).join('')
  const pets = useMemo(() => placed.map((u, i) => ({ ...u, ready: readyKey[i] === '1' })), [placed, readyKey])
  const readyCount = (readyKey.match(/1/g) || []).length
  const maxSlot = hab?.max ?? 15
  const storedCount = (hab?.stored || []).reduce((a, s) => a + Number(s.count), 0)
  const totalUnits = placed.length + storedCount

  const run = useCallback(async (fn) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true)
    try { await fn() } catch (e) { flash(e?.message || 'Gagal, coba lagi') }
    await load()
    busyRef.current = false
    if (alive.current) setBusy(false)
  }, [load, flash])

  const claimOne = useCallback((unit) => run(async () => {
    const r = await petClaim(unit)
    if (r?.ok) { setGoldLocal(Number(r.gold)); flash(`+${fmtNum(r.earned)} WakuGold`, true) } else flash('Belum waktunya diklaim')
  }), [run, flash])
  const claimAll = useCallback(() => run(async () => {
    const r = await petClaimAll()
    if (r?.ok) { setGoldLocal(Number(r.gold)); flash(`+${fmtNum(r.earned)} WakuGold dari ${r.count} pet`, true) } else flash('Belum ada WakuGold yang bisa diklaim')
  }), [run, flash])
  const place = useCallback((petId) => run(() => petPlace(petId)), [run])
  const sell = useCallback((s) => {
    const price = Number(s.min)
    if (busyRef.current || !(price >= 1)) return
    if (!window.confirm(`Jual 1 ${s.name} (${PET_RARITY[s.rarity]?.label || s.rarity}) seharga ${fmtNum(price)} WakuGold?\nPet yang dijual hilang permanen dan tidak bisa dikembalikan.`)) return
    return run(async () => {
      const r = await petSell(s.pet_id, price)
      setGoldLocal(Number(r.gold)); flash(`${s.name} terjual +${fmtNum(r.price)} WakuGold`, true)
    })
  }, [run, flash])
  const store = useCallback((u) => {
    if (u.readyMs <= Date.now() + skew.current) return flash('Klaim WakuGold-nya dulu sebelum menyimpan pet ini')
    return run(() => petStore(u.unit))
  }, [run, flash])

  const tapPet = useCallback((p) => {
    if (busyRef.current) return
    if (p.ready) claimOne(p.unit)
    else flash(`${p.name}: siap diklaim ${fmtLeft(p.readyMs - (Date.now() + skew.current))} lagi`)
  }, [claimOne, flash])

  const total = info?.total ?? 0
  const owned = info?.owned ?? 0
  const loaded = hab !== null

  return (
    <div className="cs-page pt-sky">
      <PetSkyBg />
      <div className="cs-scroll pt-wrap page-scroll">
        <div className="pt-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <h1>Pet</h1>
          <span className="pt-gold" aria-label="Saldo WakuGold"><GoldCoin size={22} /><b>{gold == null ? '…' : fmtNum(gold)}</b></span>
        </div>

        <Habitat pets={pets} paused={sheet !== null} tappable onTap={tapPet}>
          {!loaded && !err && <div className="pt-state"><span className="pt-spin" /><p>Memuat pet…</p></div>}
          {err && !loaded && <div className="pt-state"><b>Gagal memuat</b><p>{err}</p><button className="pt-retry" onClick={load}>Coba lagi</button></div>}
          {loaded && totalUnits === 0 && (
            <div className="pt-state empty">
              <span className="pt-eggico"><PetIcon /></span>
              <b>Habitatmu masih kosong</b>
              <p>Tekan <em>Gacha</em> untuk mendapatkan pet pertamamu.</p>
            </div>
          )}
          {loaded && totalUnits > 0 && placed.length === 0 && (
            <div className="pt-state empty">
              <span className="pt-eggico"><PetIcon /></span>
              <b>Belum ada pet terpasang</b>
              <p>Buka <em>Kelola</em> lalu <em>Pasang</em> pet-mu. Pet terpasang menghasilkan WakuGold tiap 24 jam.</p>
            </div>
          )}
        </Habitat>
        {loaded && placed.length > 0 && <p className="pt-more">Ketuk pet yang berkoin untuk klaim WakuGold</p>}
        {err && loaded && <p className="pt-more warn">{err}</p>}
      </div>

      {readyCount > 0 && sheet === null && (
        <button className="pt-claimall" disabled={busy} onClick={claimAll}>
          <GoldCoin size={22} /><b>Klaim semua WakuGold</b><em>{readyCount}</em>
        </button>
      )}

      {sheet !== 'manage' && sheet !== 'catalog' && (
        <div className="pt-dock">
          <button className="pt-d gacha" onClick={() => setSheet('gacha')}><span className="pt-di"><PetIcon /></span><b>Gacha</b></button>
          <button className={`pt-d manage ${sheet === 'manage' ? 'on' : ''}`} onClick={() => setSheet(sheet === 'manage' ? null : 'manage')}>
            <span className="pt-di"><PetIcon /></span><b>Kelola</b><small>{loaded ? `${placed.length}/${maxSlot}` : ''}</small>
            {readyCount > 0 && <span className="pt-badge" aria-label={`${readyCount} pet siap klaim`}>{readyCount}</span>}
          </button>
          <button className={`pt-d cat ${sheet === 'catalog' ? 'on' : ''}`} onClick={() => setSheet(sheet === 'catalog' ? null : 'catalog')}>
            <span className="pt-di"><Icon name="library" size={26} /></span><b>Katalog</b><small>{info ? `${owned}/${total}` : ''}</small>
          </button>
        </div>
      )}

      {toast && <div className={`pt-toast ${toast.ok ? 'ok' : ''}`} role="status">{toast.ok && <GoldCoin size={18} />}<span>{toast.text}</span></div>}

      {sheet === 'gacha' && <PetGacha info={info} onClose={() => setSheet(null)} onDone={load} />}
      {sheet === 'manage' && (
        <Manage hab={hab} placed={placed} now={now} busy={busy} readyCount={readyCount} err={err} onRetry={load}
          onClaim={claimOne} onClaimAll={claimAll} onStore={store} onPlace={place} onSell={sell} onClose={() => setSheet(null)} />
      )}
      {sheet === 'catalog' && <Catalog info={info} err={err} onRetry={load} onClose={() => setSheet(null)} />}
    </div>
  )
}

function PetVisit({ uid, name }) {
  const { nav } = useApp()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const alive = useRef(true)
  const load = useCallback(async () => {
    setErr('')
    try { const d = await petView(uid); if (alive.current) setData(d) }
    catch (e) { if (alive.current) setErr(e.message || 'Gagal memuat peliharaan') }
  }, [uid])
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false } }, [load])

  const pets = useMemo(() => (data?.pets || []).slice(0, MAX_VIS).map((p, i) => ({ key: i + 1, name: p.name, rarity: p.rarity, image_url: p.image_url, ready: false })), [data])
  const who = name || 'Pemain'
  return (
    <div className="cs-page pt-sky">
      <PetSkyBg />
      <div className="cs-scroll pt-wrap visit page-scroll">
        <div className="pt-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <h1>Peliharaan {who}</h1>
        </div>
        <p className="pt-ro"><Icon name="eye" size={15} /> Mode lihat saja</p>
        <Habitat pets={pets} paused={false} tappable={false}>
          {!data && !err && <div className="pt-state"><span className="pt-spin" /><p>Memuat peliharaan…</p></div>}
          {err && !data && <div className="pt-state"><b>Gagal memuat</b><p>{err}</p><button className="pt-retry" onClick={load}>Coba lagi</button></div>}
          {data && pets.length === 0 && (
            <div className="pt-state empty">
              <span className="pt-eggico"><PetIcon /></span>
              <b>Belum ada peliharaan</b>
              <p>{who} belum memasang pet di habitatnya.</p>
            </div>
          )}
        </Habitat>
        {data && pets.length > 0 && <p className="pt-more">{pets.length} pet terpasang</p>}
      </div>
    </div>
  )
}

function Sheet({ title, onClose, children, foot }) {
  return (
    <div className="ps-bg" onClick={onClose}>
      <div className="ps-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <i className="ps-grip" />
        <div className="ps-head"><h3>{title}</h3><button className="ps-x" onClick={onClose} aria-label="Tutup">✕</button></div>
        <div className="ps-body">{children}</div>
        {foot}
      </div>
    </div>
  )
}
const RarityPill = ({ r }) => <span className={`ps-rar ${r}`}>{PET_RARITY[r]?.label || r}</span>
const Income = ({ a, b }) => <span className="ps-inc"><small>HASILKAN</small><GoldCoin size={16} /><b>{fmtRange(a, b)}</b><em>/hari</em></span>

function Manage({ hab, placed, now, busy, readyCount, err, onRetry, onClaim, onClaimAll, onStore, onPlace, onSell, onClose }) {
  const stored = hab?.stored || []
  const max = hab?.max ?? 15
  const full = placed.length >= max
  return (
    <Sheet title="Kelola Pet" onClose={onClose}>
      {!hab && !err && <p className="ps-note">Memuat…</p>}
      {!hab && err && <><p className="ps-note warn">{err}</p><button className="ps-btn blue" onClick={onRetry}>Coba lagi</button></>}
      {hab && (
        <>
          {readyCount > 0 && (
            <button className="ps-claimall" disabled={busy} onClick={onClaimAll}><GoldCoin size={20} /> Klaim semua WakuGold <em>{readyCount}</em></button>
          )}
          <div className="ps-sec act"><i /><b>Pet Aktif</b><span>{placed.length}/{max}</span></div>
          {placed.length === 0 && <p className="ps-note">Belum ada pet terpasang. Pasang dari Penyimpanan di bawah.</p>}
          {placed.map((u) => {
            const left = u.readyMs - now
            const ready = left <= 0
            return (
              <div key={u.unit} className="ps-row act">
                <div className="ps-img"><img src={u.image_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /></div>
                <div className="ps-mid"><b>{u.name}</b><RarityPill r={u.rarity} /><Income a={u.min} b={u.max} /></div>
                <div className="ps-act">
                  {ready
                    ? <button className="ps-btn gold" disabled={busy} onClick={() => onClaim(u.unit)}><GoldCoin size={16} />Klaim</button>
                    : <span className="ps-timer">{fmtLeft(left)}</span>}
                  <button className="ps-btn blue" disabled={busy || ready} onClick={() => onStore(u)}>Simpan</button>
                </div>
              </div>
            )
          })}

          <div className="ps-sec sto"><i /><b>Penyimpanan</b><span>{stored.reduce((a, s) => a + Number(s.count), 0)}</span></div>
          {stored.length === 0 && <p className="ps-note">Penyimpanan kosong.</p>}
          {stored.map((s) => (
            <div key={s.pet_id} className="ps-row sto">
              <div className="ps-img"><img src={s.image_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /></div>
              <div className="ps-mid">
                <b>{s.name}{Number(s.count) > 1 && <em className="ps-cnt">×{s.count}</em>}</b>
                <RarityPill r={s.rarity} /><Income a={s.min} b={s.max} />
              </div>
              <div className="ps-act">
                <button className="ps-btn green" disabled={busy || full} onClick={() => onPlace(s.pet_id)}><Icon name="star" size={14} />Pasang</button>
                <button className="ps-btn red" disabled={busy || !(Number(s.min) >= 1)} onClick={() => onSell(s)} aria-label={`Jual ${s.name} seharga ${fmtNum(s.min)} WakuGold`}><GoldCoin size={14} />Jual {fmtShort(s.min)}</button>
              </div>
            </div>
          ))}
          {full && stored.length > 0 && <p className="ps-note">Habitat penuh. Simpan satu pet aktif dulu untuk memasang yang lain.</p>}
          <p className="ps-note small">Hitung mundur 24 jam mulai saat pet dipasang. Pet yang disimpan tidak menghasilkan.</p>
          <p className="ps-note small">Harga jual = pendapatan minimum pet per 24 jam. Hanya pet di Penyimpanan yang bisa dijual, satu per satu.</p>
        </>
      )}
    </Sheet>
  )
}

function Catalog({ info, err, onRetry, onClose }) {
  const rows = info?.rarity || []
  return (
    <Sheet title="Katalog Pet" onClose={onClose}>
      {!info && !err && <p className="ps-note">Memuat…</p>}
      {!info && err && <><p className="ps-note warn">{err}</p><button className="ps-btn blue" onClick={onRetry}>Coba lagi</button></>}
      {info && info.total === 0 && info.list.length === 0 && <p className="ps-note">Belum ada pet. Tunggu developer menambahkannya.</p>}
      {info && info.list.length > 0 && (
        <>
          <p className="ps-sub">Kamu punya {info.owned} dari {info.total} pet</p>
          <div className="ps-chips">
            {PET_RARITY_ORDER.map((k) => { const r = rows.find((x) => x.rarity === k); return r ? <span key={k} style={{ '--rc': PET_RARITY[k].color }}><i />{PET_RARITY[k].label}<b>{Number(r.pct).toFixed(2)}%</b></span> : null })}
          </div>
          <div className="ps-grid">
            {info.list.map((p) => (
              <div key={p.id} className={`ps-gi ${p.owned ? '' : 'lock'}`} style={{ '--rc': PET_RARITY[p.rarity]?.color }}>
                {p.owned ? <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" /> : <span className="ps-q">?</span>}
                <i>{PET_RARITY[p.rarity]?.short}</i>
                {p.count > 1 && <em>×{p.count}</em>}
                <b>{p.owned ? p.name : '???'}</b>
                {p.owned && p.income_min != null && <small>{fmtRange(p.income_min, p.income_max)}/hari</small>}
              </div>
            ))}
          </div>
          <p className="ps-note small">Hasil gacha diundi di server. Persen di atas adalah peluang asli.</p>
        </>
      )}
    </Sheet>
  )
}

export default function Pet({ uid, name }) {
  const { user } = useApp()
  if (uid && uid !== user?.id) return <PetVisit uid={uid} name={name} />
  return <PetHome />
}
