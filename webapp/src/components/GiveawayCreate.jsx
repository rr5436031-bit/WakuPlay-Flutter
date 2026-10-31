import { useEffect, useState } from 'react'
import { useApp } from '../context'
import { giftInfo, giveawayCreate, giveawayXpInfo } from '../services/premium'
import { giftFeeHours, giftCostDays, fmtHours, fmtDaysHours, giftXpPreview } from '../lib/giftfee'
import { DiamondIcon } from './PremiumBadge'
import Icon from './Icon'

const DAYS = [1, 3, 7, 30]
const MIN_SLOTS = 5
const MAX_SLOTS = 50
const SLOTS = [5, 10, 20, 30, 50]
const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',')
const ERR = {
  BANNED: 'Akunmu sedang diblokir',
  TOO_FAST: 'Tunggu 30 detik sebelum membuat giveaway lagi',
  BAD_INPUT: 'Jumlah hari atau hadiah tidak valid',
  MIN_SLOTS: `Giveaway minimal untuk ${MIN_SLOTS} orang. Untuk 1-${MIN_SLOTS - 1} orang pakai Gift Premium.`,
}

export default function GiveawayCreate({ onClose, onDone }) {
  const { nav } = useApp()
  const [info, setInfo] = useState(null)
  const [days, setDays] = useState(1)
  const [slots, setSlots] = useState(MIN_SLOTS)
  const [note, setNote] = useState('')
  const [step, setStep] = useState('form')
  const [alert, setAlert] = useState(null)
  const [busy, setBusy] = useState(false)
  const [xpi, setXpi] = useState(null)

  const toAlert = (text, buy) => { setAlert({ text, buy }); setStep('alert') }
  useEffect(() => {
    let alive = true
    giveawayXpInfo().then((r) => { if (alive) setXpi(r) }).catch(() => {})
    giftInfo().then((r) => { if (!alive) return; setInfo(r); if (!r.active) toAlert('Kamu belum punya Premium, jadi belum bisa bikin giveaway.', true) })
      .catch((e) => alive && toAlert(e.message || 'Gagal memuat data Premium'))
    return () => { alive = false }
  }, [])

  const left = info?.left_days || 0
  const slotsOk = Number.isInteger(slots) && slots >= MIN_SLOTS && slots <= MAX_SLOTS
  const total = days * slots
  const fee = giftFeeHours(total, info?.fee_tiers)
  const cost = giftCostDays(total, fee)
  const short = !!info && cost >= left
  const after = Math.max(left - cost, 0)
  const xpMax = giftXpPreview(total, xpi)
  const xpTxt = !xpi ? '…' : !(xpi.xp_per_day > 0) ? 'tidak ada' : xpMax > 0 ? `+${xpMax.toLocaleString('en-US')} XP` : 'batas harian tercapai'
  const next = () => { if (!slotsOk) return; if (short) toAlert(`Prem kamu kurang. Butuh ${fmtDaysHours(cost)} (termasuk biaya), sisa kamu ${fmtDaysHours(left)}.`, true); else setStep('confirm') }

  async function create() {
    if (busy || !slotsOk) return
    setBusy(true)
    try {
      const r = await giveawayCreate(days, slots, note)
      if (r?.ok) { onDone(r); return }
      if (r?.code === 'NO_PREMIUM') toAlert('Kamu belum punya Premium, jadi belum bisa bikin giveaway.', true)
      else if (r?.code === 'NOT_ENOUGH') toAlert(`Prem kamu kurang. Butuh ${fmtDaysHours(Number(r.need))} (termasuk biaya), sisa kamu ${fmtDaysHours(Number(r.left_days))}.`, true)
      else toAlert(ERR[r?.code] || 'Giveaway gagal dibuat')
    } catch (e) { toAlert(e.message || 'Giveaway gagal dibuat') }
    setBusy(false)
  }

  return (
    <div className="gp-bg" onClick={busy ? undefined : onClose}>
      <div className="gp-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Buat Giveaway">
        {step === 'alert' && alert && (
          <div className="gp-alert">
            <span className="gp-oops"><DiamondIcon size={30} /></span>
            <h3>Wop!!</h3>
            <p>{alert.text}</p>
            {alert.buy && <button className="gp-btn" onClick={() => { onClose(); nav.push('premium') }}>Beli Premium</button>}
            <button className="gp-link" onClick={onClose}>Tutup</button>
          </div>
        )}
        {step !== 'alert' && (
          <>
            <h3 className="gp-title"><Icon name="gift" size={22} /> Buat Giveaway</h3>
            {!info ? <p className="muted gp-load">Memuat…</p> : step === 'form' ? (
              <>
                <div className="gp-lab"><span>Durasi per hadiah</span><b>{days} hari</b></div>
                <div className="gp-chips">{DAYS.map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d}h</button>)}</div>
                <div className="gp-lab"><span>Jumlah hadiah (min. {MIN_SLOTS} orang)</span><b>{slots} hadiah</b></div>
                <div className="gp-chips">{SLOTS.map((n) => <button key={n} className={slots === n ? 'on' : ''} onClick={() => setSlots(n)}>{n}</button>)}</div>
                <div className="gp-step">
                  <button disabled={slots <= MIN_SLOTS} onClick={() => setSlots((n) => Math.max(MIN_SLOTS, n - 1))} aria-label="Kurangi">−</button><b>{slots}</b><button disabled={slots >= MAX_SLOTS} onClick={() => setSlots((n) => Math.min(MAX_SLOTS, n + 1))} aria-label="Tambah">+</button>
                </div>
                <input className="gp-note" value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} placeholder="Pesan untuk penonton (opsional)" />
                <div className="gp-sum">
                  <em>RINGKASAN</em>
                  <div><span>Penerima</span><b>{days} hari <i>×</i> {slots} orang</b></div>
                  <div className="gp-sum-sep"><span>Total Biaya</span><b className="bad">{fmt(cost)} hari</b></div>
                  <div><span>XP untukmu</span><b className="gp-xp">{xpTxt}</b></div>
                </div>
                {short && <p className="gp-short">Premium kamu kurang. Sisa {fmtDaysHours(left)}.</p>}
                <button className="gp-btn" disabled={!slotsOk} onClick={next}>Lanjut</button>
                <button className="gp-link" onClick={onClose}>Batal</button>
              </>
            ) : (
              <>
                <p className="gp-ask">Buat giveaway <b>{days} hari × {slots} orang</b>?<br />{xpi && xpi.xp_per_day > 0 && xpMax > 0 && <><span className="gp-xp">XP untukmu: +{xpMax.toLocaleString('en-US')} XP ({xpi.xp_per_day.toLocaleString('en-US')} XP per hari hadiah, langsung cair begitu giveaway dikirim)</span><br /></>}<span>Premium kamu langsung berkurang {fmtDaysHours(cost)} ({total} hari hadiah + biaya {fmtHours(fee)}), jadi sisa {fmtDaysHours(after)}. Berlaku 24 jam; hadiah yang tidak diklaim dikembalikan ke kamu, biaya tidak dikembalikan.</span></p>
                <button className="gp-btn" disabled={busy} onClick={create}>{busy ? 'Membuat…' : 'Ya, buat giveaway'}</button>
                <button className="gp-link" disabled={busy} onClick={() => setStep('form')}>Kembali</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
