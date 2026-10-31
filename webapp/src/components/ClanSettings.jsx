import { useState } from 'react'
import { Sheet, Confirm } from './ClanSheets'
import Icon from './Icon'
import { useAct } from '../lib/clanui'
import { invalidateClanBadges } from '../lib/clanbadge'
import { checkBannerUrl, MAX_BANNER_SIDE } from '../lib/clanbanner'
import { clanSetJoinMode, clanSetBanner, clanDisband } from '../services/clan'

const MODES = [
  { id: 'closed', title: 'Tertutup (Privat)', sub: 'Tidak ada yang bisa masuk atau mengirim permintaan' },
  { id: 'request', title: 'Request', sub: 'Masuk lewat permintaan yang disetujui Officer ke atas' },
  { id: 'open', title: 'Terbuka', sub: 'Siapa saja langsung masuk tanpa request' },
]
export const MODE_LABEL = { closed: 'Tertutup', request: 'Request', open: 'Terbuka' }

export default function ClanSettings({ d, isOwner, onClose, onChanged, onGone }) {
  const { busy, msg, say, run } = useAct()
  const [ask, setAsk] = useState(null)
  const [url, setUrl] = useState(d.banner || '')
  const [bad, setBad] = useState('')
  const [okImg, setOkImg] = useState(false)
  const mode = d.join_mode || 'request'
  const trimmed = url.trim()
  const urlErr = trimmed ? checkBannerUrl(trimmed) : ''
  const same = trimmed === (d.banner || '')
  const canSave = !!trimmed && !urlErr && !bad && okImg && !same && !busy
  const canDisband = isOwner && d.members <= 1

  const setMode = (m) => {
    if (m === mode || busy) return
    const go = () => run(async () => { await clanSetJoinMode(m); await onChanged(); setAsk(null); say(`Mode gabung: ${MODE_LABEL[m]}`) })
    if (m === 'closed') setAsk({ title: 'Tutup clan?', body: d.pending > 0 ? `Clan jadi privat. ${d.pending} permintaan yang menunggu akan dihapus.` : 'Clan jadi privat. Tidak ada yang bisa masuk atau mengirim permintaan.', yes: 'Tutup clan', fn: go })
    else go()
  }
  const saveBanner = () => run(async () => { await clanSetBanner(trimmed); await onChanged(); say('Banner clan disimpan') })
  const clearBanner = () => run(async () => { await clanSetBanner(null); await onChanged(); setUrl(''); setOkImg(false); setBad(''); setAsk(null); say('Banner clan dihapus') })
  const onLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    if (!w || !h) { setBad('Gambar tidak terbaca'); setOkImg(false); return }
    if (w > MAX_BANNER_SIDE || h > MAX_BANNER_SIDE) { setBad(`Gambar terlalu besar (maks ${MAX_BANNER_SIDE} px per sisi)`); setOkImg(false); return }
    setBad(''); setOkImg(true)
  }

  return (
    <Sheet title="Pengaturan Clan" onClose={busy ? undefined : onClose}>
      {msg && <p className="cl-toast" style={{ marginTop: 0 }}>{msg}</p>}

      <div className="cl-card">
        <h3>Mode gabung</h3>
        <p>Atur siapa yang bisa masuk ke clan. Hanya Leader & Vice Leader.</p>
        <div className="cl-modes">
          {MODES.map((m) => (
            <button key={m.id} className={`cl-modeopt ${mode === m.id ? 'on' : ''}`} disabled={busy} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}>
              <i>{mode === m.id && <Icon name="check" size={14} />}</i>
              <span><b>{m.title}</b><small>{m.sub}</small></span>
            </button>
          ))}
        </div>
      </div>

      <div className="cl-card">
        <h3>Banner clan</h3>
        <p>Background kartu clan dan bubble di Top Clans. Hanya Leader & Vice Leader yang bisa mengubah. Link harus berakhiran <b>.gif</b> (https).</p>
        <input className="cl-input" value={url} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={500}
          placeholder="https://contoh.com/banner.gif" onChange={(e) => { setUrl(e.target.value); setBad(''); setOkImg(false) }} />
        {urlErr && <p className="cl-warn" style={{ marginTop: -4 }}>{urlErr}</p>}
        {bad && <p className="cl-warn" style={{ marginTop: -4 }}>{bad}</p>}
        {trimmed && !urlErr && (
          <div className="cl-bnprev"><img key={trimmed} src={trimmed} alt="" referrerPolicy="no-referrer" decoding="async" onLoad={onLoad} onError={() => { setBad('Gambar gagal dimuat. Cek linknya'); setOkImg(false) }} /></div>
        )}
        <div className="cl-row2" style={{ marginTop: 10 }}>
          <button className="cl-btn primary" style={{ flex: 1 }} disabled={!canSave} onClick={saveBanner}>{busy ? 'Menyimpan…' : 'Simpan banner'}</button>
          {d.banner && <button className="cl-btn ghost" disabled={busy} onClick={() => setAsk({ title: 'Hapus banner?', body: 'Banner clan akan dihapus.', yes: 'Hapus', danger: true, fn: clearBanner })}>Hapus</button>}
        </div>
      </div>

      {isOwner && (
        <div className="cl-card">
          <h3>Bubarkan clan</h3>
          <p>Khusus Leader. Hanya bisa saat tidak ada anggota lain, jadi keluarkan semua anggota dulu. Clan diarsipkan, tag bisa dipakai lagi.</p>
          <button className="cl-btn danger wide" disabled={busy || !canDisband}
            onClick={() => setAsk({ title: 'Bubarkan clan?', body: `Clan [${d.tag}] ${d.name} akan dibubarkan. XPGold yang tersisa hangus.`, yes: 'Bubarkan', danger: true, fn: () => run(async () => { await clanDisband(); invalidateClanBadges(); onGone() }) })}>
            {canDisband ? 'Bubarkan clan' : `Masih ada ${Math.max(d.members - 1, 0)} anggota lain`}
          </button>
        </div>
      )}
      {ask && <Confirm title={ask.title} body={ask.body} yes={ask.yes} danger={ask.danger} busy={busy} onNo={() => setAsk(null)} onYes={ask.fn} />}
    </Sheet>
  )
}
