import { useEffect, useState } from 'react'
import { useApp } from '../context'
import { useSettings, setSetting } from '../lib/settings'
import { signOut, syncGoogleAvatar } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { userName, validName } from '../lib/format'
import { App as CapApp } from '@capacitor/app'
import { notifPermission, requestNotifPermission } from '../lib/notif'
import { syncPushPrefs, retryPush, openBatterySettings, openNotifSettings, pushSupported, applyPushSpeed, askBatteryOnce } from '../lib/push'
import Icon from '../components/Icon'
import { useStaffRoles } from '../lib/roles'
import { useDevPanelAccess } from '../lib/devaccess'
import { getPublicProfile, setMyBanner } from '../services/db'
import { Avatar, Button, Chip, Toggle } from '../components/ui'
import { usePerk } from '../lib/perks'
import { openGifToUrl } from '../lib/gifurl'

export default function Settings() {
  const { user, nav } = useApp()
  const isDev = useDevPanelAccess(user.id) === true
  const s = useSettings()
  const pkName = usePerk('rename', user.id)
  const pkSkip = usePerk('skipIntro', user.id)
  const [lockMsg, setLockMsg] = useState('')
  const locked = (label) => { setLockMsg(`${label} khusus Premium. Beli Premium dulu untuk memakainya.`); setTimeout(() => setLockMsg(''), 4000) }
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [nameErr, setNameErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [okMsg, setOkMsg] = useState('')
  const [adv, setAdv] = useState(false)

  const [bnEdit, setBnEdit] = useState(false)
  const [bnUrl, setBnUrl] = useState('')
  const [bnCur, setBnCur] = useState('')
  const [bnErr, setBnErr] = useState('')
  const [bnSaving, setBnSaving] = useState(false)
  const [bnMsg, setBnMsg] = useState('')
  useEffect(() => { getPublicProfile(user.id).then((p) => setBnCur(p?.banner_url || '')).catch(() => {}) }, [user.id])
  async function saveBanner(remove = false) {
    const v = remove ? '' : bnUrl.trim()
    if (v && !/^https?:\/\/\S+$/i.test(v)) return setBnErr('Link harus diawali http:// atau https://')
    if (v && !/\.gif($|[?#])/i.test(v)) return setBnErr('Link harus berupa gambar .gif')
    setBnSaving(true)
    try { await setMyBanner(v); setBnCur(v); setBnEdit(false); setBnMsg(v ? 'Banner dipasang' : 'Banner dihapus'); setTimeout(() => setBnMsg(''), 2500) }
    catch (e) { setBnErr(e?.message || 'Gagal menyimpan banner') }
    setBnSaving(false)
  }

  const [gifMsg, setGifMsg] = useState('')
  async function gifToUrl() {
    setGifMsg('')
    try { await openGifToUrl(() => { setGifMsg('Link .gif disalin'); setTimeout(() => setGifMsg(''), 4000) }) }
    catch (e) { setGifMsg(e?.message || 'Gagal membuka'); setTimeout(() => setGifMsg(''), 4000) }
  }

  const [perm, setPerm] = useState('...')
  useEffect(() => {
    let alive = true, last = '', handle = null
    const check = () => notifPermission().then((p) => {
      if (!alive) return
      setPerm(p)
      if (p === 'granted' && last !== 'granted') retryPush()
      last = p
    }).catch(() => { if (alive) setPerm('unsupported') })
    check()
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    if (pushSupported) CapApp.addListener('resume', check).then((h) => { if (alive) handle = h; else h.remove() }).catch(() => {})
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); handle && handle.remove() }
  }, [])
  // Tombol mengikuti pilihan pengguna; hanya mati kalau izin HP memang belum diberikan.
  const permMissing = perm === 'denied' || perm === 'prompt'
  const notifOn = s.notifAll !== false && !permMissing
  async function toggleNotif(v) {
    setSetting('notifAll', v)
    if (!v) { syncPushPrefs(); return }
    try {
      let p = await notifPermission()
      if (p !== 'granted' && p !== 'unsupported') {
        p = await requestNotifPermission()
        if (p !== 'granted' && p !== 'unsupported') openNotifSettings()
      }
      setPerm(p)
      if (p === 'granted') { retryPush(); askBatteryOnce() }
    } catch { }
    syncPushPrefs()
  }
  const [avaBusy, setAvaBusy] = useState(false)
  const [avaMsg, setAvaMsg] = useState('')
  async function syncAva() {
    setAvaBusy(true); setAvaMsg('')
    try {
      const r = await syncGoogleAvatar({ interactive: true })
      setAvaMsg(!r ? 'Foto Google tidak ditemukan' : r.changed ? 'Foto profil diperbarui' : 'Sudah foto terbaru')
    } catch (e) { setAvaMsg(e?.message || 'Gagal sinkron foto') }
    setAvaBusy(false)
    setTimeout(() => setAvaMsg(''), 4000)
  }

  function startEdit() { setName(userName(user)); setNameErr(''); setOkMsg(''); setEditing(true) }
  async function saveName() {
    const v = validName(name)
    if (!v.ok) return setNameErr(v.msg)
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ data: { display_name: v.value } })
    setSaving(false)
    if (error) return setNameErr(error.message || 'Gagal menyimpan nama')
    setEditing(false); setOkMsg('Nama diperbarui')
    setTimeout(() => setOkMsg(''), 2500)
  }

  return (
    <div className="page-scroll">
      <div className="topbar center">
        <button className="iconbtn" onClick={nav.back}><Icon name="back" /></button>
        <h1>Setting Aplikasi</h1>
        <span style={{ width: 40 }} />
      </div>

      <div className="account-top">
        <Avatar user={user} size={52} />
        <div className="account-id">
          <strong>{userName(user, 'Pengguna')}</strong>
          <span className="muted small">{user?.email}</span>
        </div>
      </div>

      <h3 className="group">Akun</h3>
      <div className="rows">
        {!editing ? (
          <button className="row" onClick={() => (pkName.ok ? startEdit() : locked('Ubah nama'))}>
            <span>Ubah nama{!pkName.ok && <span className="lock-tag">PREMIUM</span>}</span>
            <span className="row-val">{okMsg || userName(user, 'Pengguna')} <Icon name="chevron" size={16} /></span>
          </button>
        ) : (
          <div className="row static namebox">
            <input value={name} maxLength={20} autoFocus placeholder="Nama (maks. 20 huruf/angka)" onChange={(e) => { setName(e.target.value); setNameErr('') }} onKeyDown={(e) => e.key === 'Enter' && saveName()} />
            <div className="namebox-meta"><span className={nameErr ? 'err' : 'muted'}>{nameErr || 'Huruf dan angka saja'}</span><span className="muted">{name.trim().length}/20</span></div>
            <div className="namebox-btns">
              <Button variant="secondary" onClick={() => setEditing(false)}>Batal</Button>
              <Button onClick={saveName} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </div>
        )}
        <button className="row" onClick={syncAva} disabled={avaBusy}>
          <span>Foto profil</span>
          <span className="row-val">{avaBusy ? 'Memuat…' : avaMsg || 'Sinkronkan'} <Icon name="chevron" size={16} /></span>
        </button>
        <button className="row" onClick={() => nav.push('bannerpick')}>
          <span>Banner</span>
          <span className="row-val">{bnCur ? 'Terpasang' : 'Belum ada'} <Icon name="chevron" size={16} /></span>
        </button>
        <button className="row" onClick={gifToUrl}>
          <span>GIF ke Link</span>
          <span className="row-val">{gifMsg || 'Buka'} <Icon name="chevron" size={16} /></span>
        </button>
      </div>

      {lockMsg && (
        <p className="lock-msg">{lockMsg} <button onClick={() => nav.push('premium')}>Lihat Premium</button></p>
      )}

      <h3 className="group">Tampilan</h3>
      <div className="rows">
        <div className="row static">
          <span>Animasi</span>
          <span className="row-chips">
            {[['auto', 'Auto'], ['low', 'Hemat'], ['full', 'Penuh']].map(([k, t]) => (
              <Chip key={k} active={(s.fxMode || 'auto') === k} onClick={() => setSetting('fxMode', k)}>{t}</Chip>
            ))}
          </span>
        </div>
        <div className="row static">
          <span>Layar penuh</span>
          <Toggle on={s.fullscreen !== false} onChange={(v) => setSetting('fullscreen', v)} />
        </div>
      </div>

      <h3 className="group">Notifikasi</h3>
      <div className="rows">
        <div className="row static">
          <span>Notifikasi{permMissing && <span className="muted small" style={{ display: 'block' }}>Izin HP belum aktif</span>}</span>
          <Toggle on={notifOn} onChange={toggleNotif} />
        </div>
        {pushSupported && (
          <button className="row" onClick={() => setAdv((v) => !v)} aria-expanded={adv}>
            <span>Lainnya</span>
            <span className="row-val">{adv ? 'Tutup' : 'Buka'} <Icon name="chevron" size={16} /></span>
          </button>
        )}
        {pushSupported && adv && permMissing && (
          <button className="row" onClick={openNotifSettings}>
            <span>Izin notifikasi HP</span>
            <span className="row-val">Buka <Icon name="chevron" size={16} /></span>
          </button>
        )}
        {pushSupported && adv && (
          <button className="row" onClick={openBatterySettings}>
            <span>Jalan di latar<span className="muted small" style={{ display: 'block' }}>Set Tidak dibatasi agar notifikasi cepat datang</span></span>
            <span className="row-val">Atur <Icon name="chevron" size={16} /></span>
          </button>
        )}
        {pushSupported && adv && (
          <div className="row static">
            <span>Kecepatan<span className="muted small" style={{ display: 'block' }}>Saat aplikasi ditutup</span></span>
            <span className="row-chips">
              {[['cepat', 'Cepat'], ['normal', 'Normal'], ['hemat', 'Hemat']].map(([k, t]) => (
                <Chip key={k} active={(s.notifSpeed || 'cepat') === k} onClick={() => { setSetting('notifSpeed', k); applyPushSpeed() }}>{t}</Chip>
              ))}
            </span>
          </div>
        )}
      </div>

      <h3 className="group">Pemutaran</h3>
      <div className="rows">
        <div className="row static">
          <span>Kualitas</span>
          <span className="row-chips">
            {['480p', '720p', '1080p', 'Auto'].map((q) => (
              <Chip key={q} active={s.quality === q} onClick={() => setSetting('quality', q)}>{q}</Chip>
            ))}
          </span>
        </div>
        <div className="row static">
          <span>Putar episode berikutnya</span>
          <Toggle on={s.autoNext} onChange={(v) => setSetting('autoNext', v)} />
        </div>
        <div className="row static">
          <span>Skip Intro{!pkSkip.ok && <span className="lock-tag">PREMIUM</span>}</span>
          <Toggle on={!!s.skipIntro && pkSkip.ok} onChange={(v) => (pkSkip.ok ? setSetting('skipIntro', v) : locked('Skip Intro'))} />
        </div>
        {(s.hidden || []).length > 0 && (
          <button className="row" onClick={() => setSetting('hidden', [])}>
            <span>Tampilkan anime tersembunyi</span><span className="row-val">{s.hidden.length}</span>
          </button>
        )}
      </div>

      {isDev && (
        <>
          <h3 className="group">Developer</h3>
          <div className="rows">
            <button className="row" onClick={() => nav.push('devpanel')}>
              <span>Panel Developer</span><span className="row-val"><Icon name="chevron" size={16} /></span>
            </button>
          </div>
        </>
      )}

      <div style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button variant="danger" onClick={signOut}>Logout</Button>
        <p className="muted small" style={{ marginTop: 10 }}>Versi 1.0</p>
      </div>
    </div>
  )
}
