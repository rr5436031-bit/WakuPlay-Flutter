import { useEffect, useState } from 'react'
import { notifPermission, requestNotifPermission } from '../lib/notif'
import { retryPush, openNotifSettings, askBatteryOnce } from '../lib/push'
import { getSettings } from '../lib/settings'
import Icon from './Icon'

let skipped = false

export default function NotifPrompt() {
  const [st, setSt] = useState(null)
  useEffect(() => {
    if (skipped) return
    let alive = true
    const t = setTimeout(async () => {
      try {
        if (getSettings().notifAll === false) return
        const p = await notifPermission()
        if (!alive || skipped) return
        if (p === 'prompt') setSt('prompt')
        else if (p === 'denied') setSt(getSettings().notifAsked ? 'denied' : 'prompt')
      } catch { }
    }, 2000)
    return () => { alive = false; clearTimeout(t) }
  }, [])
  if (!st) return null
  const close = () => {
    skipped = true
    setSt(null)
  }
  const allow = async () => {
    if (st === 'denied') { openNotifSettings(); close(); return }
    let r = 'unsupported'
    try { r = await requestNotifPermission() } catch { }
    if (r === 'granted') { retryPush(); askBatteryOnce() }
    else if (r !== 'unsupported') openNotifSettings()
    close()
  }
  return (
    <div className="lp-bg" onClick={close}>
      <div className="np-card" onClick={(e) => e.stopPropagation()}>
        <span className="np-ico"><Icon name="bell" size={34} /></span>
        <h3>Aktifkan notifikasi?</h3>
        <p>Dapatkan kabar langsung saat kamu ditandai atau dibalas, ada permintaan teman atau masuk clan, chat pribadi, serta anime dan episode baru.</p>
        {st === 'denied' && <p style={{ fontSize: 13 }}>Izin notifikasi sedang diblokir di HP. Ketuk tombol di bawah, lalu nyalakan notifikasi WakuPlay.</p>}
        <button className="np-yes" onClick={allow}>{st === 'denied' ? 'Buka Pengaturan' : 'Izinkan'}</button>
        <button className="np-no" onClick={close}>Nanti saja</button>
      </div>
    </div>
  )
}
