import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context'
import Icon from '../components/Icon'
import { DiamondIcon, PremiumPill } from '../components/PremiumBadge'
import { Pay, openPay, closePay } from '../lib/pay'
import { refreshPremium } from '../lib/premium'
import { premiumOverview, premiumOrders, premiumCreate, premiumCheck, premiumCancel, premiumPayInfo, premiumSaveUrl, premiumSaveQr } from '../services/premium'

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const wib = (iso) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB'
const dur = (d) => (d % 365 === 0 ? `${d / 365} tahun` : d % 30 === 0 ? `${d / 30} bulan` : d % 7 === 0 && d < 30 ? `${d / 7} minggu` : `${d} hari`)
const gold = (n) => Number(n || 0).toLocaleString('id-ID')
const Coin = () => <svg className="pm-coin" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f5b932" stroke="#c98a0a" strokeWidth="1.5" /><path d="M7.5 8.5l2 7 2.5-5 2.5 5 2-7" fill="none" stroke="#7a4a00" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
const STATUS = { completed: ['Berhasil', 'ok'], pending: ['Menunggu pembayaran', 'wait'], expired: ['Kedaluwarsa', 'bad'], canceled: ['Dibatalkan', 'bad'], failed: ['Gagal', 'bad'] }

function Countdown({ to, skew }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [])
  const s = Math.max(0, Math.floor((new Date(to).getTime() - (Date.now() + skew)) / 1000))
  return <b>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</b>
}

export default function Premium() {
  const { nav } = useApp()
  const [ov, setOv] = useState(null)
  const [orders, setOrders] = useState(null)
  const [err, setErr] = useState('')
  const [phase, setPhase] = useState('list')
  const [order, setOrder] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const skew = useRef(0)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const load = useCallback(async () => {
    setErr('')
    try {
      const [o, h] = await Promise.all([premiumOverview(), premiumOrders()])
      if (!alive.current) return
      skew.current = new Date(o.server_now).getTime() - Date.now()
      setOv(o); setOrders(h || [])
    } catch (e) { if (alive.current) setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [load])

  const swept = useRef({})
  useEffect(() => {
    if (!orders) return
    const todo = orders.filter((o) => (o.status === 'pending' || o.status === 'expired') && Date.now() - new Date(o.created_at).getTime() < 6 * 3600 * 1000 && (swept.current[o.order_id] || 0) < Date.now() - 20000).slice(0, 3)
    if (!todo.length) return
    todo.forEach((o) => { swept.current[o.order_id] = Date.now() })
    ;(async () => {
      let hit = false
      for (const o of todo) { try { const r = await premiumCheck(o.order_id); if (r.status === 'completed' && r.activated) hit = true } catch { } }
      if (hit && alive.current) { refreshPremium(); load() }
    })()
  }, [orders, load])

  const settle = useCallback((o) => {
    if (!alive.current) return
    if (o.server_now) skew.current = new Date(o.server_now).getTime() - Date.now()
    setOrder((p) => ({ ...(p && p.order_id === o.order_id ? p : {}), ...o })); setMsg(o.note || '')
    if (o.status === 'completed' && o.activated) { setPhase('done'); refreshPremium(); load() }
    else if (o.status === 'expired' || o.status === 'canceled' || o.status === 'failed') { setPhase('bad'); load() }
  }, [load])

  useEffect(() => {
    if ((phase !== 'pay' && phase !== 'wait') || !order) return
    let stop = false
    const t = setInterval(async () => {
      try { const o = await premiumCheck(order.order_id); if (!stop) { if (o.status !== 'pending') closePay(); settle(o) } } catch { }
    }, 4000)
    return () => { stop = true; clearInterval(t) }
  }, [phase, order?.order_id, settle])

  const orderRef = useRef(null)
  useEffect(() => { orderRef.current = order }, [order])
  useEffect(() => {
    if (!Pay) return
    const hs = []
    Pay.addListener('payUrl', (e) => {
      const o = orderRef.current
      if (!o || !e?.url) return
      setOrder((x) => (x && x.order_id === o.order_id ? { ...x, pay_url: e.url } : x))
      premiumSaveUrl(o.order_id, e.url).catch(() => {})
    }).then((h) => hs.push(h)).catch(() => {})
    Pay.addListener('qr', (e) => {
      const o = orderRef.current
      if (!o || !e?.src) return
      setOrder((x) => (x && x.order_id === o.order_id ? { ...x, pay_qr: e.src } : x))
      premiumSaveQr(o.order_id, e.src).catch(() => {})
    }).then((h) => hs.push(h)).catch(() => {})
    Pay.addListener('closed', () => { if (alive.current) { setPhase((p) => (p === 'pay' ? 'wait' : p)); load() } }).then((h) => hs.push(h)).catch(() => {})
    return () => { hs.forEach((h) => h.remove()); closePay() }
  }, [load])

  async function start(o) {
    setOrder(o); skew.current = new Date(o.server_now).getTime() - Date.now()
    if (o.pay_qr) { setPhase('wait'); return }
    setPhase('pay')
    try { await openPay(o) } catch (e) { setPhase('wait'); setMsg(e.message) }
  }
  async function buy(plan) {
    if (busy) return
    setBusy(true); setMsg(''); setPhase('creating')
    try { await start(await premiumCreate(plan.id)) }
    catch (e) { setPhase('list'); setMsg(e.message) }
    setBusy(false)
  }
  async function payNow(orderId, force = false) {
    if (busy) return
    setBusy(true); setMsg('')
    try {
      const o = await premiumPayInfo(orderId)
      if (o.status !== 'pending') { await load(); setMsg(o.status === 'completed' ? 'Pembayaran ini sudah berhasil.' : 'Pesanan ini sudah tidak bisa dibayar. Buat pesanan baru.'); setBusy(false); return }
      const old = Date.now() - new Date(o.created_at).getTime() > 90000
      if (!o.pay_qr && !o.pay_url && old && !force) { setWarn(o); setBusy(false); return }
      await start(o)
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  async function checkNow() {
    if (busy || !order) return
    setBusy(true); setMsg('')
    try { const o = await premiumCheck(order.order_id); settle(o); if (o.status === 'pending') setMsg(`Pembayaran belum terbaca. Kalau sudah bayar, jangan bayar lagi: tunggu 1-2 menit lalu cek lagi. Masih belum masuk? Kirim kode ${o.order_id} ke admin.`) }
    catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  async function cancel() {
    if (busy || !order) return
    setBusy(true); setMsg(''); closePay()
    try { settle(await premiumCancel(order.order_id)) } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  const [warn, setWarn] = useState(null)
  const back = () => { closePay(); setPhase('list'); setOrder(null); setMsg(''); load() }

  const me = ov?.me
  const leftSec = me?.active ? (Number.isFinite(me.seconds_left) ? me.seconds_left : Math.max(0, Math.floor((new Date(me.expires_at).getTime() - new Date(ov.server_now).getTime()) / 1000))) : 0
  const leftDays = Math.ceil(leftSec / 86400)
  const leftText = me?.left_text || (leftSec >= 86400 ? `Tinggal ${leftDays} hari lagi` : leftSec >= 3600 ? `Tinggal ${Math.ceil(leftSec / 3600)} jam lagi` : `Tinggal ${Math.max(1, Math.ceil(leftSec / 60))} menit lagi`)
  const doneBonus = (orders || []).find((o) => o.order_id === order?.order_id)?.bonus_gold || 0
  const benefits = (ov?.benefits || '').split('\n').map((s) => s.trim()).filter(Boolean)

  return (
    <div className="nt page-scroll pm">
      <div className="nt-top">
        <button className="iconbtn" onClick={phase === 'list' ? nav.back : back} aria-label="Kembali"><Icon name="back" size={26} /></button>
        <h1>WakuPlay Premium</h1>
      </div>

      {err && <div className="pm-card"><p className="dv-err">{err}</p><button className="pm-btn ghost" onClick={load}>Coba lagi</button></div>}
      {!err && !ov && <p className="muted nt-empty">Memuat…</p>}

      {ov && phase === 'list' && (
        <>
          <div className={`pm-card pm-status ${me?.active ? 'on' : ''}`}>
            <span className="pm-dia"><DiamondIcon size={26} /></span>
            <div>
              {me?.active ? <><b>Premium aktif</b>
                  <span className={`pm-left ${leftDays <= 3 ? 'warn' : ''}`}>{leftText}</span>
                  <small>Berakhir {wib(me.expires_at)}</small>{me.plan_name && <small>Paket terakhir: {me.plan_name}</small>}</>
                : <><b>Belum Premium</b><span>{me ? `Premium berakhir ${wib(me.expires_at)}` : 'Pilih paket di bawah untuk mulai.'}</span></>}
            </div>
            {me?.active && <PremiumPill />}
          </div>

          {benefits.length > 0 && (
            <div className="pm-card">
              <h3>Manfaat Premium</h3>
              <ul className="pm-ben">{benefits.map((b, i) => <li key={i}><Icon name="check" size={18} />{b}</li>)}</ul>
            </div>
          )}

          <h3 className="pm-h">Pilih paket</h3>
          {ov.plans.length === 0 ? <div className="pm-card"><p className="muted">Paket Premium belum tersedia.</p></div> : ov.plans.map((p) => (
            <div key={p.id} className="pm-plan">
              <div><b>{p.name}</b><span>{dur(p.days)} · {p.days} hari</span>{p.bonus_gold > 0 && <em className="pm-bonus"><Coin />Bonus {gold(p.bonus_gold)} WakuGold</em>}</div>
              <div className="pm-price"><b>{rp(p.price)}</b><button className="pm-btn" disabled={busy} onClick={() => buy(p)}>{me?.active ? 'Perpanjang' : 'Beli'}</button></div>
            </div>
          ))}
          {me?.active && <p className="muted small pm-note">Perpanjangan ditambahkan setelah tanggal berakhir saat ini, sisa durasimu tidak hilang.</p>}
          {msg && <p className="dv-err pm-msg">{msg}</p>}

          <h3 className="pm-h">Riwayat transaksi</h3>
          {orders === null ? <p className="muted small">Memuat…</p> : orders.length === 0 ? <p className="muted small pm-note">Belum ada transaksi.</p> : orders.map((o) => {
            const [label, cls] = STATUS[o.status] || [o.status, 'bad']
            return (
              <div key={o.order_id} className="pm-ord">
                <div><b>{o.plan_name}</b><small>{wib(o.created_at)}</small>{o.status === 'completed' && o.bonus_gold > 0 && <small className="pm-bonus-s">Bonus +{gold(o.bonus_gold)} WakuGold</small>}<small className="pm-oid">{o.order_id}{o.is_sandbox ? ' · sandbox' : ''}</small></div>
                <div className="pm-oright"><b>{rp(o.amount)}</b><span className={`pm-chip ${cls}`}>{label}</span>{o.can_pay && <button className="pm-btn pm-paynow" disabled={busy} onClick={() => payNow(o.order_id)}>Bayar sekarang</button>}</div>
              </div>
            )
          })}
        </>
      )}

      {phase === 'creating' && <div className="pm-card pm-center"><div className="pm-spin" /><p>Menyiapkan pembayaran…</p></div>}

      {(phase === 'pay' || phase === 'wait') && order && (
        <div className="pm-card pm-pay pm-center">
          <h3>{phase === 'pay' ? 'Selesaikan pembayaran' : 'Menunggu pembayaran'}</h3>
          <div className="pm-sum">
            <span>{order.plan_name}</span><b>{rp(order.amount)}</b>
            {order.bonus_gold > 0 && <><span>Bonus WakuGold</span><b>+{gold(order.bonus_gold)}</b></>}
          </div>
          {order.pay_qr && (
            <div className="pm-qrbox">
              <img src={order.pay_qr} alt="QRIS pembayaran" referrerPolicy="no-referrer" />
              <small>QRIS yang sama dengan tadi. Scan lewat e-wallet / m-banking (boleh screenshot QR ini).</small>
            </div>
          )}
          <p className="pm-time">Pesanan berlaku <Countdown to={order.expires_at} skew={skew.current} /></p>
          <p className="muted small">Kode pesanan: <b>{order.order_id}</b> (simpan kalau perlu bantuan admin)</p>
          <p className="muted small">Bayar lewat QRIS di jendela pembayaran. QRIS hanya berlaku 3 menit, jadi segera bayar. Setelah bayar, Premium dan WakuGold masuk otomatis (biasanya beberapa detik). Sudah bayar tapi belum masuk? Tunggu 1-2 menit lalu tekan "cek status". Jangan bayar dua kali. Pesanan yang belum dibayar tetap ada di Riwayat transaksi.</p>
          {msg && <p className="dv-err pm-msg">{msg}</p>}
          {!order.pay_qr && <button className="pm-btn wide" disabled={busy} onClick={() => payNow(order.order_id, true)}>{phase === 'pay' ? 'Buka lagi jendela pembayaran' : 'Lanjut bayar (tampilkan QRIS)'}</button>}
          <button className="pm-btn ghost wide" disabled={busy} onClick={checkNow}>{busy ? 'Memeriksa…' : 'Saya sudah bayar, cek status'}</button>
          <button className="pm-btn ghost wide" disabled={busy} onClick={cancel}>Batalkan pesanan</button>
        </div>
      )}

      {warn && (
        <div className="gp-bg" onClick={() => setWarn(null)}>
          <div className="gp-card" onClick={(e) => e.stopPropagation()}>
            <div className="gp-alert">
              <h3>Tunggu dulu</h3>
              <p>QRIS pesanan ini tidak tersimpan. <b>Kalau kamu sudah membayarnya, jangan bayar lagi</b>: tunggu 1-2 menit lalu cek riwayat, atau hubungi admin dengan kode <b>{warn.order_id}</b>.</p>
              <button className="gp-btn" onClick={() => { const w = warn; setWarn(null); payNow(w.order_id, true) }}>Belum bayar, buat QRIS baru</button>
              <button className="gp-link" onClick={() => setWarn(null)}>Kembali</button>
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="pm-card pm-center pm-done">
          <span className="pm-dia big"><DiamondIcon size={40} /></span>
          <h2>Pembayaran berhasil</h2>
          <p>Premium kamu sudah aktif{ov?.me?.expires_at ? ` sampai ${wib(ov.me.expires_at)}` : ''}.</p>
          <PremiumPill />
          {doneBonus > 0 && <p className="pm-bonus-done"><Coin />Bonus +{gold(doneBonus)} WakuGold sudah masuk ke dompetmu</p>}
          {msg && <p className="muted small">{msg}</p>}
          <button className="pm-btn wide" onClick={back}>Selesai</button>
        </div>
      )}

      {phase === 'bad' && (
        <div className="pm-card pm-center">
          <h2>{order?.status === 'expired' ? 'Pembayaran kedaluwarsa' : order?.status === 'canceled' ? 'Pesanan dibatalkan' : 'Pembayaran gagal'}</h2>
          <p className="muted">{order?.status === 'expired' ? <>Waktu pembayaran habis. Kalau kamu sudah terlanjur membayar, jangan bayar lagi: Premium tetap masuk otomatis, atau hubungi admin dengan kode <b>{order.order_id}</b>. Kalau belum bayar, buat pesanan baru.</> : 'Tidak ada dana yang diproses untuk pesanan ini. Silakan coba lagi.'}</p>
          {msg && <p className="dv-err">{msg}</p>}
          <button className="pm-btn wide" onClick={back}>Kembali ke paket</button>
        </div>
      )}
    </div>
  )
}
