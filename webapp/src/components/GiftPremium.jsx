import { useEffect, useState } from 'react'
import { useApp } from '../context'
import { giftInfo, giftSend, giftXpInfo } from '../services/premium'
import { refreshMyXp } from '../lib/xp'
import { giftXpPreview } from '../lib/giftfee'
import { giftFeeHours, giftCostDays, fmtHours, fmtDaysHours } from '../lib/giftfee'
import { DiamondIcon } from './PremiumBadge'
import Icon from './Icon'

const CHIPS = [1, 3, 7, 14, 30]
const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',')

const ERR = {
  SELF: ['Wop!!', 'Tidak bisa gift ke diri sendiri'],
  NO_TARGET: ['Wop!!', 'Penerima tidak ditemukan atau sedang diblokir'],
  BANNED: ['Wop!!', 'Akunmu sedang diblokir'],
  TOO_FAST: ['Pelan-pelan', 'Tunggu 20 detik sebelum gift lagi'],
  LIMIT_COUNT: ['Batas harian', 'Maksimal 10 gift per 24 jam'],
  LIMIT_DAYS: ['Batas harian', 'Maksimal 60 hari gift per 24 jam'],
  TARGET_FULL: ['Penerima penuh', 'Premium penerima tidak boleh lebih dari 365 hari'],
  BAD_DAYS: ['Wop!!', 'Jumlah hari harus 1 sampai 30'],
}

export default function GiftPremium({ target, onClose, onDone }) {
  const { nav, user } = useApp()
  const [info, setInfo] = useState(null)
  const [days, setDays] = useState(7)
  const [step, setStep] = useState('form')
  const [alert, setAlert] = useState(null)
  const [busy, setBusy] = useState(false)
  const [xpi, setXpi] = useState(null)

  useEffect(() => {
    let alive = true
    giftXpInfo().then((r) => { if (alive) setXpi(r) }).catch(() => {})
    giftInfo().then((r) => { if (alive) setInfo(r) }).catch((e) => { if (alive) { setAlert({ title: 'Wop!!', text: e.message || 'Gagal memuat data Premium' }); setStep('alert') } })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (info && !info.active) { setAlert({ title: 'Wop!!', text: 'Kamu belum punya Premium, jadi belum bisa gift.', buy: true }); setStep('alert') }
  }, [info])

  const left = info?.left_days || 0
  const fee = giftFeeHours(days, info?.fee_tiers)
  const cost = giftCostDays(days, fee)
  const short = info && cost >= left
  const after = Math.max(left - cost, 0)
  const xp = giftXpPreview(days, xpi)

  function tryNext() {
    if (short) { setAlert({ title: 'Wop!!', text: `Prem kamu kurang. Butuh ${fmtDaysHours(cost)} (${days} hari + biaya ${fmtHours(fee)}), sisa kamu ${fmtDaysHours(left)}.`, buy: true }); setStep('alert'); return }
    setStep('confirm')
  }
  async function send() {
    if (busy) return
    setBusy(true)
    try {
      const r = await giftSend(target.uid, days)
      if (r?.ok) { refreshMyXp(user?.id); onDone(r); return }
      if (r?.code === 'NO_PREMIUM') setAlert({ title: 'Wop!!', text: 'Kamu belum punya Premium, jadi belum bisa gift.', buy: true })
      else if (r?.code === 'NOT_ENOUGH') setAlert({ title: 'Wop!!', text: `Prem kamu kurang. Butuh ${fmtDaysHours(Number(r.need))} (termasuk biaya), sisa kamu ${fmtDaysHours(Number(r.left_days))}.`, buy: true })
      else { const e = ERR[r?.code] || ['Wop!!', 'Gift gagal dikirim']; setAlert({ title: e[0], text: e[1] + (r?.code === 'LIMIT_DAYS' ? ` (sisa jatah ${r.days_left_today} hari)` : '') }) }
      setStep('alert')
    } catch (e) {
      setAlert({ title: 'Wop!!', text: e.message || 'Gift gagal dikirim' }); setStep('alert')
    }
    setBusy(false)
  }

  return (
    <div className="gp-bg" onClick={busy ? undefined : onClose}>
      <div className="gp-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Gift Premium">
        {step === 'alert' && alert && (
          <div className="gp-alert">
            <span className="gp-oops"><DiamondIcon size={30} /></span>
            <h3>{alert.title}</h3>
            <p>{alert.text}</p>
            {alert.buy && <button className="gp-btn" onClick={() => { onClose(); nav.push('premium') }}>Beli Premium</button>}
            <button className="gp-link" onClick={onClose}>Tutup</button>
          </div>
        )}

        {step !== 'alert' && (
          <>
            <h3 className="gp-title"><Icon name="gift" size={22} /> Gift Premium</h3>
            <div className="gp-to">
              {target.avatar ? <img className="avatar" src={target.avatar} alt="" referrerPolicy="no-referrer" /> : <div className="avatar avatar-fallback">{(target.name || '?')[0].toUpperCase()}</div>}
              <span>Untuk <b>{target.name || 'User'}</b></span>
            </div>
            {!info ? <p className="muted gp-load">Memuat…</p> : step === 'form' ? (
              <>
                <div className="gp-lab"><span>Jumlah hari</span><b>{days} hari</b></div>
                <div className="gp-chips">{CHIPS.map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d}h</button>)}</div>
                <div className="gp-step">
                  <button onClick={() => setDays((d) => Math.max(1, d - 1))} aria-label="Kurangi">−</button>
                  <b>{days}</b>
                  <button onClick={() => setDays((d) => Math.min(30, d + 1))} aria-label="Tambah">+</button>
                </div>
                <div className="gp-sum">
                  <div><span>Premium kamu sekarang</span><b>{fmt(left)} hari</b></div>
                  <div><span>Biaya gift</span><b>{fmtHours(fee)}</b></div>
                  <div><span>Total dipotong dari kamu</span><b>{fmtDaysHours(cost)}</b></div>
                  {xpi && xpi.xp_per_day > 0 && <div><span>XP untukmu</span><b className="gp-xp">{xp > 0 ? `+${xp} XP` : 'batas harian tercapai'}</b></div>}
                  <div><span>Setelah gift</span><b className={short ? 'bad' : ''}>{short ? 'kurang' : `${fmt(after)} hari`}</b></div>
                </div>
                <button className="gp-btn" onClick={tryNext}>Lanjut</button>
                <button className="gp-link" onClick={onClose}>Batal</button>
              </>
            ) : (
              <>
                <p className="gp-ask">Kirim <b>{days} hari Premium</b> ke <b>{target.name || 'User'}</b>?<br /><span>Premium kamu berkurang {fmtDaysHours(cost)} ({days} hari + biaya {fmtHours(fee)}), jadi sisa {fmtDaysHours(after)}. Penerima mendapat {days} hari. Gift tidak bisa dibatalkan.</span></p>
                <button className="gp-btn" disabled={busy} onClick={send}>{busy ? 'Mengirim…' : 'Ya, kirim gift'}</button>
                <button className="gp-link" disabled={busy} onClick={() => setStep('form')}>Kembali</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
