import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context'
import { useGold, setGoldLocal, fmtNum } from '../lib/gold'
import { borderShop, borderBuy, borderEquip } from '../services/borders'
import { RARITY, RARITY_ORDER, setBorderLocal } from '../lib/borders'
import Icon from '../components/Icon'
import GoldCoin from '../components/GoldCoin'
import CosmicBg from '../components/CosmicBg'
import BorderFrame from '../components/BorderFrame'
import { Avatar } from '../components/ui'

const Rar = ({ r }) => <span className={`ab-rar ${RARITY[r]?.[1] || ''}`}>{RARITY[r]?.[0] || r}</span>
const SORTS = [['new', 'Terbaru'], ['price_asc', 'Harga termurah'], ['price_desc', 'Harga termahal'], ['rarity', 'Rarity']]

function LazyFrame({ id, size, user }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() } }, { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return (
    <div ref={ref} style={{ width: size, height: size }}>
      {seen ? <BorderFrame id={id} size={size}><Avatar user={user} size={size} plain /></BorderFrame> : <Avatar user={user} size={size} plain />}
    </div>
  )
}

export default function AvatarBorders() {
  const { user, nav } = useApp()
  const gold = useGold()
  const [shop, setShop] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('shop')
  const [q, setQ] = useState('')
  const [rar, setRar] = useState('all')
  const [sort, setSort] = useState('new')
  const [sel, setSel] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const alive = useRef(true)
  const selRef = useRef(null)
  selRef.current = sel

  useEffect(() => () => { alive.current = false }, [])
  const flash = useCallback((text, bad) => { setToast({ text, bad }); setTimeout(() => alive.current && setToast(null), 2600) }, [])

  const load = useCallback(async () => {
    try { const s = await borderShop(); if (!alive.current) return; setShop(s); setErr(''); setGoldLocal(Number(s.gold) || 0) }
    catch (e) { if (alive.current) setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    nav.setGuard(() => { if (selRef.current) { setSel(null); setConfirm(false); return true } return false })
    return () => nav.setGuard(null)
  }, [nav])

  const list = shop?.list || []
  const owned = useMemo(() => new Set(shop?.owned || []), [shop])
  const equipped = shop?.equipped || null
  const byId = useMemo(() => new Map(list.map((b) => [b.id, b])), [list])
  const cur = equipped ? byId.get(equipped) : null

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase()
    let a = list.filter((b) => (tab === 'shop' || owned.has(b.id)) && (rar === 'all' || b.rarity === rar) && (!ql || b.name.toLowerCase().includes(ql)))
    const ro = (b) => RARITY_ORDER.indexOf(b.rarity)
    if (sort === 'price_asc') a = a.sort((x, y) => x.price - y.price)
    else if (sort === 'price_desc') a = a.sort((x, y) => y.price - x.price)
    else if (sort === 'rarity') a = a.sort((x, y) => ro(y) - ro(x) || y.price - x.price)
    else a = a.sort((x, y) => y.sort - x.sort)
    return a
  }, [list, owned, tab, q, rar, sort])

  const open = (id) => { setSel(id); setConfirm(false) }
  const close = () => { setSel(null); setConfirm(false) }

  async function buy(b) {
    if (busy) return
    setBusy(true)
    try {
      const r = await borderBuy(b.id)
      if (!alive.current) return
      setGoldLocal(Number(r.gold) || 0)
      setShop((s) => ({ ...s, gold: r.gold, owned: [...(s.owned || []), b.id] }))
      setConfirm(false)
      flash(`Berhasil membeli ${b.name}!`)
    } catch (e) {
      if (!alive.current) return
      const m = /tidak cukup/i.test(e.message) ? 'WakuGold kamu tidak cukup' : /sudah memiliki/i.test(e.message) ? 'Kamu sudah memiliki border ini' : e.message
      flash(m, true); setConfirm(false); load()
    } finally { alive.current && setBusy(false) }
  }
  async function equip(id) {
    if (busy) return
    setBusy(true)
    try {
      await borderEquip(id)
      if (!alive.current) return
      setBorderLocal(user.id, id)
      setShop((s) => ({ ...s, equipped: id }))
      flash(id ? 'Border dipakai' : 'Border dilepas')
    } catch (e) { alive.current && flash(e.message, true) } finally { alive.current && setBusy(false) }
  }

  const drag = useRef(null)
  const sheetRef = useRef(null)
  const onTS = (e) => { if ((sheetRef.current?.scrollTop || 0) <= 0) drag.current = e.touches[0].clientY }
  const onTM = (e) => { if (drag.current == null) return; const dy = e.touches[0].clientY - drag.current; if (dy > 0 && sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)` }
  const onTE = (e) => {
    if (drag.current == null) return
    const dy = e.changedTouches[0].clientY - drag.current; drag.current = null
    if (sheetRef.current) sheetRef.current.style.transform = ''
    if (dy > 90) close()
  }

  const b = sel ? byId.get(sel) : null
  const isOwned = b && owned.has(b.id), isEq = b && equipped === b.id
  const poor = b && gold != null && gold < b.price

  return (
    <div className="cs-page">
      <CosmicBg />
      <div className="cs-scroll page-scroll ab-page">
        <div className="ab-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <h1>Avatar Decorations</h1>
          <div className="ab-gold"><GoldCoin size={20} />{gold == null ? '…' : fmtNum(gold)}</div>
        </div>

        <div className="ab-wrap">
          <div className="ab-cur">
            <div className="ab-curav">
              <BorderFrame id={equipped} size={84}><Avatar user={user} size={84} plain /></BorderFrame>
            </div>
            <div className="ab-curinfo">
              <small>Border aktif</small>
              {cur ? (<>
                <b>{cur.name}</b><Rar r={cur.rarity} />
                <span className="ab-price"><GoldCoin size={16} />{fmtNum(cur.price)}</span>
                <button className="ab-btn ghost" disabled={busy} onClick={() => equip(null)}>Lepas</button>
              </>) : <b style={{ fontSize: 16 }}>{shop ? 'Belum memakai border' : 'Memuat…'}</b>}
            </div>
          </div>

          <div className="ab-tabs" role="tablist">
            <button className={`ab-tab ${tab === 'shop' ? 'on' : ''}`} onClick={() => setTab('shop')}>Shop</button>
            <button className={`ab-tab ${tab === 'col' ? 'on' : ''}`} onClick={() => setTab('col')}>Koleksi ({owned.size}/{list.length})</button>
          </div>

          <label className="ab-search"><Icon name="search" size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama border" /></label>
          <div className="ab-chips">
            {[['all', 'Semua'], ...RARITY_ORDER.map((r) => [r, RARITY[r][0]])].map(([k, l]) => <button key={k} className={`ab-chip ${rar === k ? 'on' : ''}`} onClick={() => setRar(k)}>{l}</button>)}
          </div>
          <div className="ab-sort"><span>{shown.length} border</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutkan">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>

          {err && <p className="ab-empty">{err} <button className="ab-btn" onClick={load}>Coba lagi</button></p>}
          {!err && shop && shown.length === 0 && <p className="ab-empty">{tab === 'col' && owned.size === 0 ? 'Koleksimu masih kosong. Beli border di tab Shop.' : 'Tidak ada border yang cocok.'}</p>}
          <div className="ab-grid">
            {shown.map((x) => {
              const o = owned.has(x.id), e = equipped === x.id
              return (
                <div key={x.id} className={`ab-card ${e ? 'eq' : ''}`} onClick={() => open(x.id)} role="button" tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && open(x.id)}>
                  <div className="ab-av"><LazyFrame id={x.id} size={64} user={user} /></div>
                  <b>{x.name}</b><Rar r={x.rarity} />
                  <span className="ab-price"><GoldCoin size={15} />{fmtNum(x.price)}</span>
                  <button className={`ab-btn ${e ? 'ghost' : o ? 'ghost' : 'gold'}`} tabIndex={-1}>{e ? 'Sedang Dipakai' : o ? 'Dimiliki' : 'Beli'}</button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {b && (
        <div className="abs-bg" onClick={close}>
          <div className="abs-sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE} role="dialog" aria-label={b.name}>
            <div className="abs-grip" />
            <Rar r={b.rarity} />
            <h2>{b.name}</h2>
            <p>Preview di profil kamu</p>
            <div className="abs-av"><BorderFrame id={b.id} size={150}><Avatar user={user} size={150} plain /></BorderFrame></div>
            <div className="abs-price"><GoldCoin size={26} />{fmtNum(b.price)}</div>
            {!isOwned && !confirm && (<>
              <button className="ab-btn gold wide" disabled={busy || poor} onClick={() => setConfirm(true)}>{poor ? 'WakuGold kamu tidak cukup' : 'Beli'}</button>
              <p className="abs-note">Preview gratis. WakuGold baru berkurang setelah kamu mengonfirmasi pembelian.</p>
            </>)}
            {!isOwned && confirm && (
              <div className="abs-conf">
                Beli <b>{b.name}</b> seharga <b>{fmtNum(b.price)} WakuGold</b>?
                <div className="row"><button className="ab-btn ghost" disabled={busy} onClick={() => setConfirm(false)}>Batal</button><button className="ab-btn gold" disabled={busy} onClick={() => buy(b)}>{busy ? 'Memproses…' : 'Ya, beli'}</button></div>
              </div>
            )}
            {isOwned && !isEq && <button className="ab-btn wide" disabled={busy} onClick={() => equip(b.id)}>Pakai</button>}
            {isOwned && isEq && <button className="ab-btn ghost wide" disabled={busy} onClick={() => equip(null)}>Sedang dipakai · Lepas</button>}
          </div>
        </div>
      )}
      {toast && <div className={`ab-toast ${toast.bad ? 'bad' : ''}`} role="status">{toast.text}</div>}
    </div>
  )
}
