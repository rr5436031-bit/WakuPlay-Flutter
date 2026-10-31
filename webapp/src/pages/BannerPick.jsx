import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context'
import { getPublicProfile, setMyBanner } from '../services/db'
import { gachaInventory, RARITY } from '../services/gacha'
import { usePerk } from '../lib/perks'
import Icon from '../components/Icon'
import CosmicBg from '../components/CosmicBg'
import { refreshCmBanner } from '../lib/cmbanner'

export default function BannerPick() {
  const { user, nav } = useApp()
  const perk = usePerk('banner', user.id)
  const [cur, setCur] = useState('')
  const [url, setUrl] = useState('')
  const [inv, setInv] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    getPublicProfile(user.id).then((p) => setCur(p?.banner_url || '')).catch(() => {})
    gachaInventory().then(setInv).catch(() => setInv([]))
  }, [user.id])
  useEffect(() => { load() }, [load])

  async function apply(v, okText, isUrl) {
    if (busy) return
    setMsg(null)
    if (isUrl && !perk.ok) return setMsg({ text: 'Custom URL khusus Premium. Wallpaper dari gacha tetap bisa dipasang gratis.' })
    setBusy(true)
    try { await setMyBanner(v); setCur(v); refreshCmBanner(); setMsg({ ok: true, text: okText }) }
    catch (e) { setMsg({ text: e?.message || 'Gagal menyimpan banner' }) }
    setBusy(false)
  }
  function custom() {
    if (!perk.ok) return setMsg({ text: 'Custom URL khusus Premium. Wallpaper dari gacha tetap bisa dipasang gratis.' })
    const v = url.trim()
    if (!/^https?:\/\/\S+$/i.test(v)) return setMsg({ text: 'Link harus diawali http:// atau https://' })
    if (!/\.gif($|[?#])/i.test(v)) return setMsg({ text: 'Link harus berupa gambar .gif' })
    apply(v, 'Banner dipasang', true)
  }

  return (
    <div className="cs-page">
      <CosmicBg />
      <div className="cs-scroll gw page-scroll">
        <div className="gw-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <h1>Pilih Banner</h1>
          <button className="gw-gobtn" onClick={() => nav.push('gacha')}><Icon name="gift" size={18} /> Gacha wallpaper</button>
        </div>

        {cur && (
          <div className="bp-cur">
            <img src={cur} alt="Banner saat ini" referrerPolicy="no-referrer" />
            <button className="gw-link" disabled={busy} onClick={() => apply('', 'Banner dihapus')}>Hapus banner</button>
          </div>
        )}

        <h3 className="bp-h">Custom URL{!perk.ok && ' 🔒'}</h3>
        {!perk.ok && (
          <div className="bp-lockbar"><Icon name="lock" size={20} /><span>Custom URL khusus Premium, admin, developer, dan moderator. Wallpaper dari gacha di bawah bebas dipakai.<button onClick={() => nav.push('premium')}>Lihat Premium</button></span></div>
        )}
        <div className={perk.ok ? '' : 'bp-locked'}>
          <input className="bp-in" value={url} maxLength={500} placeholder="https://contoh.com/gambar.gif" inputMode="url" autoCapitalize="none" autoCorrect="off"
            disabled={!perk.ok} onChange={(e) => { setUrl(e.target.value); setMsg(null) }} onKeyDown={(e) => e.key === 'Enter' && custom()} />
          <p className="bp-hint">Tempel link gambar berformat <b>.gif</b> untuk memasang banner manual.</p>
          <button className="gw-ok" disabled={!perk.ok || busy || !url.trim()} onClick={custom}>Pasang Custom URL</button>
        </div>
        {msg && <p className={`gw-info center ${msg.ok ? 'okk' : 'bad'}`}>{msg.text}</p>}

        <div className="gw-sec"><h3>Wallpaper dari Gacha</h3><span className="gw-cnt">{inv ? inv.length : 0}</span></div>
        {inv && inv.length === 0 ? (
          <div className="gw-emptybox"><Icon name="image" size={34} /><b>Belum ada wallpaper</b><span>Summon di Gacha wallpaper untuk mendapatkannya.</span>
            <button className="gw-ok" onClick={() => nav.push('gacha')}>Buka Gacha</button></div>
        ) : (
          <div className="gw-grid">
            {(inv || []).map((w) => (
              <button key={w.id} className={`gw-card ${cur === w.image_url ? 'on' : ''}`} style={{ '--rc': RARITY[w.rarity].color }} disabled={busy} onClick={() => apply(w.image_url, 'Banner dipasang', false)}>
                <img className="gw-img" src={w.image_url} alt={w.name} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                <span className="gw-tag">{RARITY[w.rarity].label}</span>
                {cur === w.image_url && <span className="gw-x">Terpasang</span>}
                <b>{w.name}</b>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
