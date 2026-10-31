import { useEffect, useState } from 'react'
import Icon from './Icon'
import { fmtRemain } from '../lib/ban'

export default function BanPopup({ ban, onClose }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t) }, [])
  const remain = ban.expiresAt ? ban.expiresAt - (Date.now() + ban.offset) : null
  return (
    <div className="ban-bg">
      <div className="ban-card" role="alertdialog" aria-labelledby="ban-title">
        <div className="ban-head"><Icon name="ban" size={30} /><h3 id="ban-title">Blokir</h3></div>
        <p className="ban-msg">{ban.reason || 'Akun diblokir'} ({ban.label})</p>
        {remain != null && <p className="ban-remain">Sisa waktu: <b>{fmtRemain(remain)}</b></p>}
        <button className="ban-close" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
