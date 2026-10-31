import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { supabase } from '../lib/supabase'
import { useDevPanelAccess } from '../lib/devaccess'
import { levelInfo, xpForLevel } from '../lib/xp'
import { getLevelCfg } from '../lib/levelcurve'
import { TIER_DEFS } from '../components/LevelBadge'
import { loadLevelCfg, devLevelCfgSet } from '../services/levelcfg'
import Icon from '../components/Icon'
import ClanBadge from '../components/ClanBadge'
import { devClanList, devClanXp, devClanTotalXp, devClanTier, devClanDailyGet, devClanDailySave, devClanDailyReset } from '../services/clan'
import { TIER_NAMES, MAX_TIER, colorOf } from '../lib/clanui'
import { devPremiumOverview, devPremiumPlanSave, devPremiumPlanDelete, devPremiumBenefits, devPremiumInfo, devPremiumGift, devGiveawayXpGet, devGiveawayXpSet } from '../services/premium'
import { devLbList, devLbSet, devLbReset } from '../services/toplb'
import { Button, AutoTextarea, Avatar } from '../components/ui'
import BannerCard from '../components/BannerCard'
import UpdateCard from '../components/UpdateCard'
import { APP_VERSION, fmtVer } from '../lib/version'
import BorderFrame from '../components/BorderFrame'
import { RARITY as BD_RARITY, RARITY_ORDER as BD_ORDER } from '../lib/borders'
import { fmtNum } from '../lib/gold'
import { devBorderList, devBorderImport, devBorderUpdate, devBorderSave, devBorderDelete, uploadBorderGif, removeBorderGif } from '../services/borders'
import { checkBorderName, checkBorderUrl, checkBorderPrice, checkBorderSize, checkBorderFile, MAX_PRICE, BORDER_PRICES, BORDER_ROOT } from '../lib/borderUrl'
import { BorderSyncCard, BorderPriceCard } from '../components/BorderGithub'
import { nameFromFile } from '../lib/cleanName'
import { petDevList, petDevSave, petDevDelete, uploadPetImage, removePetImage, PET_RARITY, PET_RARITY_ORDER } from '../services/pet'
import { devEmblemList, devEmblemSave, devEmblemDelete, uploadEmblemImage, removeEmblemImage } from '../services/clan'
import { EMBLEM_RARITY, EMBLEM_ORDER } from '../lib/clanui'
import { api as animeApi } from '../services/animeApi'
import { devExtraList, devExtraSave, devExtraDelete, devExtraClear, isExtraId, lastExtraSave } from '../services/extraEpisodes'
import { devAnimeList, devAnimeSave, devAnimeDelete, isCustomId } from '../services/customAnime'
import { gachaDevList, gachaDevSave, gachaDevDelete, uploadGachaImage, removeGachaImage, RARITY, RARITY_ORDER } from '../services/gacha'

const PAGE = 50
const ROLES = ['user', 'moderator', 'admin', 'developer']
const ROLE_COLOR = { developer: '#ff5a67', admin: '#ff5a67', moderator: '#b87cff', user: 'var(--text-secondary)' }

const COLS = [
  { k: 'user_id', t: 'UID', edit: false },
  { k: 'seq', t: '#ID', edit: 'number' },
  { k: 'name', t: 'Nama', edit: 'text' },
  { k: 'email', t: 'Email', edit: false },
  { k: 'role', t: 'Role', edit: 'role' },
  { k: 'lvl', t: 'Lvl', edit: 'number' },
  { k: 'xp', t: 'XP', edit: 'number' },
  { k: 'muted_until', t: 'Bisu s/d', edit: 'datetime' },
  { k: 'created_at', t: 'Dibuat', edit: false },
]

const pad = (n) => String(n).padStart(2, '0')
const fmtDate = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const isMuted = (r) => r.muted_until && new Date(r.muted_until) > new Date()

function show(r, k) {
  switch (k) {
    case 'user_id': return `${r.user_id.slice(0, 8)}…`
    case 'seq': return r.seq != null ? `#${r.seq}` : '-'
    case 'lvl': return levelInfo(r.xp).level.toLocaleString('id-ID')
    case 'xp': return Number(r.xp).toFixed(1)
    case 'muted_until': return isMuted(r) ? fmtDate(r.muted_until) : '-'
    case 'created_at': return fmtDate(r.created_at)
    default: return r[k] ?? '-'
  }
}

function initialValue(r, col) {
  if (col.k === 'lvl') return String(levelInfo(r.xp).level)
  if (col.k === 'xp') return String(Number(r.xp))
  if (col.k === 'seq') return String(r.seq ?? '')
  if (col.k === 'muted_until') return isMuted(r) ? toLocalInput(r.muted_until) : ''
  return String(r[col.k] ?? '')
}

function EditSheet({ row, col, onClose, onSaved }) {
  const [value, setValue] = useState(() => initialValue(row, col))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  async function save() {
    setErr('')
    let field = col.k
    let val = value
    if (col.k === 'lvl') {
      const L = parseInt(value, 10)
      if (!(L >= 1) || L > 100000) return setErr('Level 1 sampai 100000')
      field = 'xp'
      val = String(xpForLevel(L))
    } else if (col.k === 'muted_until') {
      val = value ? new Date(value).toISOString() : ''
    }
    setBusy(true)
    const { error } = await supabase.rpc('dev_update_user', { p_target: row.user_id, p_field: field, p_val: val })
    setBusy(false)
    if (error) return setErr(error.message || 'Gagal menyimpan')
    onSaved(row.user_id, field, val)
  }

  const quickMute = (ms) => setValue(ms ? toLocalInput(new Date(Date.now() + ms).toISOString()) : '')

  return (
    <div className="dv-bg" onClick={onClose}>
      <div className="dv-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dv-sheet-h">
          <b>{col.k === 'user_id' ? 'UID' : `Ubah ${col.t}`}</b>
          <span className="muted small">{row.seq != null ? `#${row.seq} · ` : ''}{row.name}</span>
        </div>

        {col.k === 'user_id' && (
          <>
            <p className="dv-mono dv-uid">{row.user_id}</p>
            <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(row.user_id); setCopied(true) }}>{copied ? 'Disalin' : 'Salin UID'}</Button>
          </>
        )}
        {col.k === 'email' && <p className="dv-uid">{row.email}</p>}

        {col.edit === 'role' && (
          <div className="dv-chips">
            {ROLES.map((r) => (
              <button key={r} className={`dv-chip ${value === r ? 'on' : ''}`} style={value === r ? { borderColor: ROLE_COLOR[r], color: ROLE_COLOR[r] } : null} onClick={() => setValue(r)}>{r}</button>
            ))}
          </div>
        )}
        {(col.edit === 'number' || col.edit === 'text') && (
          <input
            className="dv-input"
            value={value}
            autoFocus
            inputMode={col.edit === 'number' ? 'decimal' : 'text'}
            maxLength={col.k === 'name' ? 20 : 14}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        )}
        {col.edit === 'datetime' && (
          <>
            <div className="dv-chips">
              <button className="dv-chip" onClick={() => quickMute(3600e3)}>1 jam</button>
              <button className="dv-chip" onClick={() => quickMute(86400e3)}>1 hari</button>
              <button className="dv-chip" onClick={() => quickMute(7 * 86400e3)}>7 hari</button>
              <button className="dv-chip" onClick={() => quickMute(0)}>Buka bisu</button>
            </div>
            <input className="dv-input" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
          </>
        )}
        {col.k === 'lvl' && <p className="muted small">Mengatur level = mengisi XP ke batas awal level itu.</p>}
        {err && <p className="dv-err">{err}</p>}

        <div className="dv-btns">
          <Button variant="secondary" onClick={onClose}>{col.edit ? 'Batal' : 'Tutup'}</Button>
          {col.edit && <Button onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan'}</Button>}
        </div>
      </div>
    </div>
  )
}

export default function DevPanel() {
  const { user, nav } = useApp()
  const ok = useDevPanelAccess(user?.id)
  useEffect(() => { if (ok === false) nav.back() }, [ok])
  if (ok !== true) return <div className="state"><p className="muted">{ok === null ? 'Memeriksa akses…' : ''}</p></div>
  return <DevPanelInner />
}

function TableTab() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(null)
  const seq = useRef(0)

  const load = useCallback(async (query, offset) => {
    const my = ++seq.current
    setLoading(true); setErr('')
    const { data, error } = await supabase.rpc('dev_list_users', { p_q: query, p_limit: PAGE, p_offset: offset })
    if (my !== seq.current) return
    setLoading(false)
    if (error) { setRows((r) => r || []); return setErr(error.message?.includes('Hanya developer') ? 'Akses ditolak: hanya role developer.' : (error.message || 'Gagal memuat')) }
    setRows((r) => (offset === 0 ? data : [...(r || []), ...data]))
    setMore(data.length === PAGE)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q.trim(), 0), q ? 350 : 0)
    return () => clearTimeout(t)
  }, [q, load])

  function saved(uid, field, val) {
    setRows((list) => list.map((r) => {
      if (r.user_id !== uid) return r
      if (field === 'seq') return { ...r, seq: Number(val) }
      if (field === 'xp') return { ...r, xp: Number(val) }
      if (field === 'muted_until') return { ...r, muted_until: val || null }
      if (field === 'name') return { ...r, name: val.replace(/\s+/g, ' ').trim() }
      return { ...r, [field]: val }
    }))
    setEdit(null)
  }

  return (
    <>
      <input className="dv-search" value={q} placeholder="Cari #ID, nama, email, atau UID" onChange={(e) => setQ(e.target.value)} />
      <p className="muted small dv-count">{rows ? `${rows.length} user${more ? '+' : ''}` : ''} · ketuk sel untuk mengubah</p>
      {err && <p className="dv-err" style={{ margin: '0 16px 8px' }}>{err}</p>}

      <div className="dv-scroll">
        <table className="dv-table">
          <thead>
            <tr>{COLS.map((c) => <th key={c.k}>{c.t}</th>)}</tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr key={r.user_id}>
                {COLS.map((c) => (
                  <td
                    key={c.k}
                    className={`${c.edit ? 'ed' : ''} ${c.k === 'user_id' || c.k === 'seq' ? 'dv-mono' : ''}`}
                    style={c.k === 'role' ? { color: ROLE_COLOR[r.role], fontWeight: 700 } : isMuted(r) && c.k === 'muted_until' ? { color: '#ff7a85' } : null}
                    onClick={() => setEdit({ row: r, col: c })}
                  >{show(r, c.k)}</td>
                ))}
              </tr>
            ))}
            {rows && rows.length === 0 && !err && <tr><td colSpan={COLS.length} className="muted">Tidak ada hasil</td></tr>}
          </tbody>
        </table>
        {loading && <p className="muted small" style={{ padding: 12 }}>Memuat...</p>}
        {more && !loading && <div style={{ padding: 12 }}><Button variant="secondary" onClick={() => load(q.trim(), rows.length)}>Muat lagi</Button></div>}
      </div>

      {edit && <EditSheet row={edit.row} col={edit.col} onClose={() => setEdit(null)} onSaved={saved} />}
    </>
  )
}

function BannerTab() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [btn, setBtn] = useState(false)
  const [btnText, setBtnText] = useState('')
  const [btnUrl, setBtnUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [active, setActive] = useState(null)

  const loadActive = useCallback(async () => {
    const { data } = await supabase.rpc('get_active_banner')
    const row = Array.isArray(data) ? data[0] : data
    setActive(row || false)
    return row
  }, [])
  useEffect(() => { loadActive() }, [loadActive])

  function fillFromActive() {
    if (!active) return
    setTitle(active.title); setBody(active.body); setBtn(!!active.button_enabled)
    setBtnText(active.button_text || ''); setBtnUrl(active.button_url || '')
  }

  async function publish() {
    setMsg(null)
    if (!title.trim()) return setMsg({ text: 'Judul wajib diisi' })
    if (!body.trim()) return setMsg({ text: 'Teks pesan wajib diisi' })
    if (btn && !btnText.trim()) return setMsg({ text: 'Teks tombol wajib diisi' })
    if (btn && !/^https?:\/\/\S+$/i.test(btnUrl.trim())) return setMsg({ text: 'Link harus diawali http:// atau https://' })
    setBusy(true)
    const { error } = await supabase.rpc('dev_publish_banner', { p_title: title.trim(), p_body: body.trim(), p_button: btn, p_button_text: btn ? btnText.trim() : null, p_button_url: btn ? btnUrl.trim() : null })
    setBusy(false)
    if (error) return setMsg({ text: error.message || 'Gagal mengirim banner' })
    setMsg({ ok: true, text: 'Banner terkirim & aktif. Pengguna melihatnya saat membuka aplikasi.' })
    loadActive()
  }

  async function disable() {
    if (!window.confirm('Matikan banner yang sedang aktif?')) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('dev_disable_banner')
    setBusy(false)
    if (error) return setMsg({ text: error.message || 'Gagal mematikan banner' })
    setMsg({ ok: true, text: 'Banner dimatikan.' })
    loadActive()
  }

  return (
    <div className="dv-banner">
      <label className="dv-lab">Judul</label>
      <input className="dv-input" value={title} maxLength={80} placeholder="Judul banner" onChange={(e) => setTitle(e.target.value)} />

      <label className="dv-lab">Teks</label>
      <AutoTextarea className="dv-input dv-ta" value={body} maxLength={600} placeholder="Isi banner. Baris baru ikut tampil." onChange={(e) => setBody(e.target.value)} />
      <p className="dv-cnt">{body.length}/600</p>

      <label className="dv-lab">Teks tombol</label>
      <div className="dv-row">
        <input className="dv-input" style={{ flex: 1, opacity: btn ? 1 : .5 }} value={btnText} maxLength={30} disabled={!btn} placeholder="Contoh: Update sekarang" onChange={(e) => setBtnText(e.target.value)} />
        <button className={`dv-switch ${btn ? 'on' : ''}`} onClick={() => setBtn((v) => !v)} aria-pressed={btn} aria-label="Tombol aktif"><i /><span>{btn ? 'ON' : 'OFF'}</span></button>
      </div>

      <label className="dv-lab">Link tujuan tombol</label>
      <input className="dv-input" style={{ opacity: btn ? 1 : .5 }} value={btnUrl} disabled={!btn} inputMode="url" autoCapitalize="none" placeholder="https://..." onChange={(e) => setBtnUrl(e.target.value)} />

      <p className="dv-lab soft">Pratinjau (seperti yang dilihat pengguna)</p>
      <BannerCard preview title={title.trim()} body={body.trim()} button={btn} buttonText={btnText.trim()} />

      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
      <button className="dv-send" disabled={busy} onClick={publish}><Icon name="send" size={22} />{busy ? 'Mengirim…' : 'Kirim & ganti banner aktif'}</button>
      <div className="dv-activebox">
        <p className="muted small">{active === null ? 'Memeriksa banner aktif…' : active ? `Banner aktif: “${active.title}”` : 'Tidak ada banner aktif.'}</p>
        {active && <div className="dv-btns" style={{ justifyContent: 'flex-start' }}><button className="dv-chip" onClick={fillFromActive}>Edit banner aktif</button><button className="dv-chip" style={{ color: '#ff7a85' }} disabled={busy} onClick={disable}>Matikan</button></div>}
      </div>
      <p className="muted small dv-note">Banner muncul setiap pengguna membuka aplikasi dan bisa ditutup dengan tombol X. Hanya ada satu banner aktif: mengirim banner baru otomatis menggantikan yang lama. Kalau tombol OFF, tombol tidak ditampilkan.</p>
    </div>
  )
}

const UNITS = [['menit', 'Menit'], ['jam', 'Jam'], ['hari', 'Hari'], ['bulan', 'Bulan'], ['tahun', 'Tahun'], ['permanen', 'Permanen']]

function BanTab() {
  const [val, setVal] = useState('')
  const [found, setFound] = useState(null)
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState('jam')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [bans, setBans] = useState(null)

  const loadBans = useCallback(async () => {
    const { data, error } = await supabase.rpc('dev_list_bans')
    setBans(error ? [] : data || [])
  }, [])
  useEffect(() => { loadBans() }, [loadBans])

  async function search() {
    const n = String(val).trim().replace(/^#/, '')
    setFound(null); setMsg(null)
    if (!/^\d{1,12}$/.test(n)) return setMsg({ text: 'Masukkan ID berupa angka, contoh: 2' })
    setBusy(true)
    const { data, error } = await supabase.rpc('dev_find_user', { p_seq: Number(n) })
    setBusy(false)
    if (error) return setMsg({ text: error.message || 'Gagal mencari' })
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return setMsg({ text: `ID #${n} tidak ditemukan` })
    setFound(row)
  }

  async function ban() {
    if (!found) return
    const text = reason.trim()
    if (!text) return setMsg({ text: 'Alasan blokir wajib diisi' })
    const amt = parseInt(amount, 10)
    if (unit !== 'permanen' && !(amt >= 1)) return setMsg({ text: 'Isi jumlah waktu minimal 1' })
    const lbl = unit === 'permanen' ? 'PERMANEN' : `${amt} ${unit}`
    if (!window.confirm(`Blokir #${found.seq} ${found.name} selama ${lbl}?`)) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('dev_ban_user', { p_target: found.user_id, p_reason: text, p_amount: unit === 'permanen' ? null : amt, p_unit: unit })
    setBusy(false)
    if (error) return setMsg({ text: error.message || 'Gagal memblokir' })
    setMsg({ ok: true, text: `#${found.seq} diblokir (${unit === 'permanen' ? 'permanen' : `${amt} ${unit}`}).` })
    setReason('')
    await Promise.all([search(), loadBans()])
  }

  async function unban(uid, seq) {
    if (!window.confirm(`Buka blokir #${seq ?? ''}?`)) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('dev_unban_user', { p_target: uid })
    setBusy(false)
    if (error) return setMsg({ text: error.message || 'Gagal membuka blokir' })
    setMsg({ ok: true, text: 'Blokir dibuka.' })
    if (found && found.user_id === uid) setFound({ ...found, banned: false, ban_reason: null, ban_label: null, ban_expires_at: null })
    loadBans()
  }

  const until = (iso) => (iso ? `sampai ${fmtDate(iso)}` : 'permanen')
  return (
    <div className="dv-banner">
      <label className="dv-lab">Cari ID user (harus persis)</label>
      <div className="dv-row">
        <input className="dv-input" style={{ flex: 1 }} value={val} inputMode="numeric" placeholder="Contoh: 2" onChange={(e) => setVal(e.target.value.replace(/[^\d#]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="dv-go" disabled={busy || !val.trim()} onClick={search}>Cari</button>
      </div>

      {found && (
        <div className="bk-card">
          <div className="bk-who"><b>{found.name}</b><span className="dv-mono">#{found.seq}</span><span style={{ color: ROLE_COLOR[found.role] || 'inherit', fontWeight: 700 }}>{found.role}</span></div>
          <p className="muted small">{found.email}</p>

          {found.banned ? (
            <>
              <p className="bk-state">Sedang diblokir ({found.ban_label}) · {until(found.ban_expires_at)}</p>
              <p className="muted small" style={{ whiteSpace: 'pre-wrap' }}>Alasan: {found.ban_reason}</p>
              <button className="dv-unban" disabled={busy} onClick={() => unban(found.user_id, found.seq)}>Buka blokir</button>
            </>
          ) : found.role === 'developer' ? (
            <p className="muted small" style={{ marginTop: 10 }}>Akun developer tidak bisa diblokir.</p>
          ) : null}

          {found.role !== 'developer' && (
            <>
              <label className="dv-lab">{found.banned ? 'Ganti blokir (menimpa yang lama)' : 'Alasan blokir'}</label>
              <AutoTextarea className="dv-input dv-ta" style={{ minHeight: 90 }} value={reason} maxLength={300} placeholder="Pesan alasan yang dilihat user saat diblokir" onChange={(e) => setReason(e.target.value)} />
              <p className="dv-cnt">{reason.length}/300</p>

              <label className="dv-lab">Lama blokir</label>
              <div className="dv-chips">
                {UNITS.map(([k, t]) => <button key={k} className={`dv-chip ${unit === k ? 'on' : ''}`} onClick={() => setUnit(k)}>{t}</button>)}
              </div>
              {unit !== 'permanen' && <input className="dv-input" style={{ marginTop: 10 }} value={amount} inputMode="numeric" placeholder="Jumlah" onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 4))} />}
              <button className="dv-ban" disabled={busy} onClick={ban}><Icon name="ban" size={22} />{busy ? 'Memproses…' : `Blokir ${unit === 'permanen' ? 'permanen' : `${amount || 0} ${unit}`}`}</button>
            </>
          )}
        </div>
      )}

      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}

      <p className="dv-lab soft" style={{ marginTop: 22 }}>Sedang diblokir {bans ? `(${bans.length})` : ''}</p>
      {bans && bans.length === 0 && <p className="muted small">Tidak ada akun yang diblokir.</p>}
      {(bans || []).map((b) => (
        <div key={b.user_id} className="bk-row">
          <div style={{ minWidth: 0, flex: 1 }}>
            <b>{b.name} <span className="dv-mono muted">#{b.seq}</span></b>
            <p className="muted small">{b.label} · {until(b.expires_at)}</p>
            <p className="muted small bk-rs">{b.reason}</p>
          </div>
          <button className="dv-chip" disabled={busy} onClick={() => unban(b.user_id, b.seq)}>Buka</button>
        </div>
      ))}
    </div>
  )
}

function GoldTab() {
  const [val, setVal] = useState('')
  const [found, setFound] = useState(null)
  const [bal, setBal] = useState(null)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('add')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID')

  async function search() {
    const n = String(val).trim().replace(/^#/, '')
    setFound(null); setBal(null); setMsg(null); setAmount('')
    if (!/^\d{1,12}$/.test(n)) return setMsg({ text: 'Masukkan ID berupa angka, contoh: 1' })
    setBusy(true)
    const { data, error } = await supabase.rpc('dev_find_user', { p_seq: Number(n) })
    if (error) { setBusy(false); return setMsg({ text: error.message || 'Gagal mencari' }) }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) { setBusy(false); return setMsg({ text: `ID #${n} tidak ditemukan` }) }
    const g = await supabase.rpc('dev_gold_get', { p_target: row.user_id })
    setBusy(false)
    if (g.error) return setMsg({ text: g.error.message || 'Gagal membaca saldo' })
    setFound(row); setBal(Number(g.data) || 0)
  }

  const amt = parseInt(amount, 10) || 0
  async function apply() {
    if (!found || busy) return
    if (!(amt >= 1)) return setMsg({ text: 'Isi jumlah WakuGold minimal 1' })
    if (mode === 'sub' && amt > bal) return setMsg({ text: `Saldo user hanya ${fmt(bal)}, tidak bisa dikurangi ${fmt(amt)}` })
    const label = mode === 'add' ? 'TAMBAH' : 'KURANGI'
    if (!window.confirm(`${label} ${fmt(amt)} WakuGold untuk #${found.seq} ${found.name}?\nSaldo sekarang: ${fmt(bal)}`)) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('dev_gold_adjust', { p_target: found.user_id, p_amount: amt, p_mode: mode })
    setBusy(false)
    if (error) return setMsg({ text: error.message || 'Gagal mengubah WakuGold' })
    setBal(Number(data) || 0); setAmount('')
    setMsg({ ok: true, text: `${mode === 'add' ? 'Ditambah' : 'Dikurangi'} ${fmt(amt)} WakuGold. Saldo baru: ${fmt(data)}` })
  }

  return (
    <div className="dv-banner">
      <label className="dv-lab">Cari ID user (harus persis)</label>
      <div className="dv-row">
        <input className="dv-input" style={{ flex: 1 }} value={val} inputMode="numeric" placeholder="Contoh: 1" onChange={(e) => setVal(e.target.value.replace(/[^\d#]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="dv-go" disabled={busy || !val.trim()} onClick={search}>Cari</button>
      </div>

      {found && (
        <div className="bk-card">
          <div className="bk-who"><b>{found.name}</b><span className="dv-mono">#{found.seq}</span><span style={{ color: ROLE_COLOR[found.role] || 'inherit', fontWeight: 700 }}>{found.role}</span></div>
          <p className="muted small">{found.email}</p>
          <p className="dv-gold">WakuGold: <b>{fmt(bal)}</b></p>

          <label className="dv-lab">Jumlah WakuGold</label>
          <input className="dv-input" value={amount} inputMode="numeric" placeholder="Contoh: 500" onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 10))} />

          <label className="dv-lab">Pilih tindakan</label>
          <div className="dv-chips">
            <button className={`dv-chip ${mode === 'add' ? 'on' : ''}`} onClick={() => setMode('add')}>Tambah</button>
            <button className={`dv-chip ${mode === 'sub' ? 'on' : ''}`} onClick={() => setMode('sub')}>Kurangi</button>
          </div>

          {amt >= 1 && <p className="muted small" style={{ marginTop: 10 }}>Saldo setelah: <b>{fmt(mode === 'add' ? bal + amt : Math.max(0, bal - amt))}</b></p>}
          {mode === 'add'
            ? <button className="dv-send" disabled={busy || amt < 1} onClick={apply}><Icon name="check" size={22} />{busy ? 'Memproses…' : `Tambah ${fmt(amt)} WakuGold`}</button>
            : <button className="dv-ban" disabled={busy || amt < 1} onClick={apply}><Icon name="ban" size={22} />{busy ? 'Memproses…' : `Kurangi ${fmt(amt)} WakuGold`}</button>}
        </div>
      )}
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
    </div>
  )
}

function DailyClanEditor() {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState(null)
  const [enabled, setEnabled] = useState(true)
  const [hours, setHours] = useState('24')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID')

  const load = useCallback(async () => {
    try {
      const d = await devClanDailyGet()
      setCfg(d); setEnabled(!!d.enabled); setHours(String(d.hours))
      setRows((d.tiers || []).map((t) => ({ lv: String(t.min_level), gold: String(t.gold) })))
    } catch (e) { setMsg({ text: e.message }) }
  }, [])
  useEffect(() => { if (open && !cfg) load() }, [open])

  const setRow = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v.replace(/\D/g, '').slice(0, k === 'lv' ? 6 : 8) } : x)))
  const addRow = () => setRows((r) => {
    const last = r.length ? r[r.length - 1] : null
    return [...r, { lv: String((parseInt(last?.lv, 10) || 0) + 5), gold: String(parseInt(last?.gold, 10) || 50) }]
  })
  const delRow = (i) => setRows((r) => r.filter((_, j) => j !== i))

  async function save() {
    if (busy) return
    const tiers = rows.map((x) => ({ min_level: parseInt(x.lv, 10), gold: parseInt(x.gold, 10) }))
    const h = parseInt(hours, 10)
    if (!(h >= 1 && h <= 720)) return setMsg({ text: 'Jam tunggu harus 1 sampai 720' })
    if (tiers.length < 1 || tiers.some((t) => !(t.min_level >= 1) || !(t.gold >= 0))) return setMsg({ text: 'Isi semua level (min 1) dan Gold (min 0)' })
    if (!tiers.some((t) => t.min_level === 1)) return setMsg({ text: 'Harus ada baris yang mulai dari level 1' })
    if (new Set(tiers.map((t) => t.min_level)).size !== tiers.length) return setMsg({ text: 'Level awal tidak boleh kembar' })
    if (!window.confirm(`Simpan Daily Clan?\nStatus: ${enabled ? 'AKTIF' : 'NONAKTIF'} · tunggu ${h} jam · ${tiers.length} tingkat hadiah.\nBerlaku langsung untuk klaim berikutnya.`)) return
    setBusy(true); setMsg(null)
    try { await devClanDailySave(enabled, h, tiers); setMsg({ ok: true, text: 'Daily Clan disimpan' }); await load() }
    catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }

  const sorted = [...rows].sort((a, b) => (parseInt(a.lv, 10) || 0) - (parseInt(b.lv, 10) || 0))
  const lvLabel = (i) => {
    const a = parseInt(sorted[i].lv, 10) || 0, nx = sorted[i + 1] ? (parseInt(sorted[i + 1].lv, 10) || 0) - 1 : null
    return nx === null ? `Lv.${a}+` : nx <= a ? `Lv.${a}` : `Lv.${a}–${nx}`
  }

  return (
    <div className="bk-card dv-daily">
      <button className="dv-daily-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span><b>Daily Clan</b><small>Klaim WakuGold harian per level clan</small></span>
        <Icon name={open ? 'chevup' : 'chevdown'} size={22} />
      </button>
      {open && (
        <>
          {cfg && <div className="dv-clstats"><span>Klaim 24 jam terakhir<b>{fmt(cfg.claims_today)}</b></span><span>Gold dibagikan<b className="gold">{fmt(cfg.gold_today)}</b></span></div>}
          <label className="dv-lab">Status fitur</label>
          <div className="dv-chips">
            <button className={`dv-chip ${enabled ? 'on' : ''}`} onClick={() => setEnabled(true)}>Aktif</button>
            <button className={`dv-chip ${!enabled ? 'on' : ''}`} onClick={() => setEnabled(false)}>Nonaktif</button>
          </div>
          <label className="dv-lab">Jam tunggu antar klaim</label>
          <input className="dv-input dv-daily-hours" value={hours} inputMode="numeric" onChange={(e) => setHours(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          <label className="dv-lab">Hadiah per level clan (mulai dari level … sampai level berikutnya)</label>
          {rows.map((x, i) => {
            const si = sorted.indexOf(x)
            return (
              <div key={i} className="dv-daily-row">
                <span className="dv-daily-lv">{si >= 0 && x.lv ? lvLabel(si) : '—'}</span>
                <input className="dv-input" value={x.lv} inputMode="numeric" placeholder="Level awal" aria-label="Level awal" onChange={(e) => setRow(i, 'lv', e.target.value)} />
                <input className="dv-input" value={x.gold} inputMode="numeric" placeholder="Gold" aria-label="Gold" onChange={(e) => setRow(i, 'gold', e.target.value)} />
                <button className="dv-daily-del" onClick={() => delRow(i)} disabled={rows.length <= 1} aria-label="Hapus baris"><Icon name="trash" size={18} /></button>
              </div>
            )
          })}
          <button className="dv-chip" style={{ marginTop: 10 }} onClick={addRow} disabled={rows.length >= 40}>+ Tambah tingkat</button>
          <button className="dv-send" disabled={busy || !cfg} onClick={save}><Icon name="check" size={22} />{busy ? 'Menyimpan…' : 'Simpan Daily Clan'}</button>
          {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
        </>
      )}
    </div>
  )
}

function ClanTab() {
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const [selId, setSelId] = useState(null)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('add')
  const [target, setTarget] = useState('gold')
  const [tier, setTier] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID')
  const sel = list && list.find((x) => x.id === selId)

  const load = useCallback(async () => {
    try { setList(await devClanList(q)) } catch (e) { setMsg({ text: e.message }); setList([]) }
  }, [q])
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t) }, [load])

  const pickClan = (c) => { setSelId(c.id); setTier(c.tier); setAmount(''); setMsg(null) }
  const amt = parseInt(amount, 10) || 0

  async function applyXp() {
    if (!sel || busy) return
    const isXp = target === 'xp'
    const label = isXp ? 'XP Top Clans' : 'XPGold'
    const have = isXp ? Math.floor(sel.total_xp) : sel.xp_available
    if (!(amt >= 1)) return setMsg({ text: `Isi jumlah ${label} minimal 1` })
    if (mode === 'sub' && amt > have) return setMsg({ text: `${label} clan hanya ${fmt(have)}, tidak bisa dikurangi ${fmt(amt)}` })
    if (!window.confirm(`${mode === 'add' ? 'TAMBAH' : 'KURANGI'} ${fmt(amt)} ${label} untuk [${sel.tag}] ${sel.name}?\n${isXp ? 'XPGold clan tidak berubah.' : 'Total XP Top Clans tidak berubah.'}`)) return
    setBusy(true); setMsg(null)
    try {
      const v = isXp ? await devClanTotalXp(sel.id, amt, mode) : await devClanXp(sel.id, amt, mode)
      setAmount(''); setMsg({ ok: true, text: `${mode === 'add' ? 'Ditambah' : 'Dikurangi'} ${fmt(amt)} ${label}. ${label} clan sekarang ${fmt(Math.floor(v))}` }); await load()
    } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  async function resetDaily() {
    if (!sel || busy) return
    if (!window.confirm(`Reset timer Daily Clan untuk semua anggota [${sel.tag}] ${sel.name}?`)) return
    setBusy(true); setMsg(null)
    try { const n = await devClanDailyReset(sel.id); setMsg({ ok: true, text: `Timer ${n} anggota direset, bisa klaim sekarang` }) }
    catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  async function applyTier() {
    if (!sel || busy || tier === sel.tier) return
    if (!window.confirm(`Ubah tier [${sel.tag}] ${sel.name} dari ${sel.tier} ke ${tier} (${TIER_NAMES[tier - 1]})?`)) return
    setBusy(true); setMsg(null)
    try { await devClanTier(sel.id, tier); setMsg({ ok: true, text: `Tier diubah ke ${tier} (${TIER_NAMES[tier - 1]})` }); await load() }
    catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }

  return (
    <div className="dv-banner">
      <DailyClanEditor />
      <label className="dv-lab">Cari clan (tag atau nama)</label>
      <input className="dv-input" value={q} placeholder="Kosongkan untuk semua clan" onChange={(e) => setQ(e.target.value)} />

      {sel && (
        <div className="bk-card">
          <div className="dv-clhead"><ClanBadge tag={sel.tag} tier={sel.tier} color={colorOf(sel)} emblem={sel.emblem} size={30} /><b>{sel.name}</b></div>
          <p className="muted small">Leader: {sel.leader_name}{sel.leader_seq != null ? ` #${sel.leader_seq}` : ''} · {sel.members}/{sel.slots} anggota · Lv.{sel.level}</p>
          <div className="dv-clstats"><span>XPGold<b className="gold">{fmt(sel.xp_available)}</b></span><span>Total XP (Top Clans)<b>{fmt(Math.floor(sel.total_xp))}</b></span></div>

          <label className="dv-lab">Yang diubah (tanpa setor Gold)</label>
          <div className="dv-chips" style={{ marginBottom: 10 }}>
            <button className={`dv-chip ${target === 'gold' ? 'on' : ''}`} onClick={() => setTarget('gold')}>XPGold</button>
            <button className={`dv-chip ${target === 'xp' ? 'on' : ''}`} onClick={() => setTarget('xp')}>XP Top Clans</button>
          </div>
          <input className="dv-input" value={amount} inputMode="numeric" placeholder="Jumlah, contoh: 1000" onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 10))} />
          <div className="dv-chips" style={{ marginTop: 10 }}>
            <button className={`dv-chip ${mode === 'add' ? 'on' : ''}`} onClick={() => setMode('add')}>Tambah</button>
            <button className={`dv-chip ${mode === 'sub' ? 'on' : ''}`} onClick={() => setMode('sub')}>Kurangi</button>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>{target === 'xp' ? 'Mengubah Total XP clan (Top Clans & level clan). XPGold tidak ikut berubah.' : 'Hanya mengubah XPGold tersedia. Total XP Top Clans tidak ikut berubah.'}</p>
          {mode === 'add'
            ? <button className="dv-send" disabled={busy || amt < 1} onClick={applyXp}><Icon name="check" size={22} />{busy ? 'Memproses…' : `Tambah ${fmt(amt)} ${target === 'xp' ? 'XP Top Clans' : 'XPGold'}`}</button>
            : <button className="dv-ban" disabled={busy || amt < 1} onClick={applyXp}><Icon name="ban" size={22} />{busy ? 'Memproses…' : `Kurangi ${fmt(amt)} ${target === 'xp' ? 'XP Top Clans' : 'XPGold'}`}</button>}

          <label className="dv-lab" style={{ marginTop: 22 }}>Daily Clan</label>
          <button className="dv-chip" disabled={busy} onClick={resetDaily}>Reset timer daily clan ini</button>
          <p className="muted small" style={{ marginTop: 6 }}>Semua anggota boleh klaim sekali langsung, setelah itu timer normal lagi.</p>

          <label className="dv-lab" style={{ marginTop: 22 }}>Tier badge (bebas 1 sampai {MAX_TIER})</label>
          <div className="dv-tiers">{Array.from({ length: MAX_TIER }, (_, i) => i + 1).map((n) => <button key={n} className={`dv-chip ${tier === n ? 'on' : ''}`} onClick={() => setTier(n)}>{n}</button>)}</div>
          <div className="dv-tierprev"><ClanBadge tag={sel.tag} tier={tier} color={colorOf(sel)} emblem={sel.emblem} size={32} /><span>Tier {tier} · {TIER_NAMES[tier - 1]}</span></div>
          <button className="dv-send" disabled={busy || tier === sel.tier} onClick={applyTier}><Icon name="check" size={22} />{tier === sel.tier ? 'Tier sudah ini' : `Set Tier ${tier}`}</button>
        </div>
      )}
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}

      <p className="dv-lab soft" style={{ marginTop: 20 }}>Semua clan {list ? `(${list.length})` : ''}</p>
      {list === null ? <p className="muted small">Memuat…</p> : list.length === 0 ? <p className="muted small">Tidak ada clan.</p> : list.map((c) => (
        <button key={c.id} className={`dv-clrow ${c.id === selId ? 'on' : ''}`} onClick={() => pickClan(c)}>
          <ClanBadge tag={c.tag} tier={c.tier} color={colorOf(c)} emblem={c.emblem} size={22} />
          <span><b>{c.name}</b><small>Lv.{c.level} · {c.members}/{c.slots} · Tier {c.tier}</small></span>
          <em><b>{fmt(c.xp_available)}</b><small>XPGold</small></em>
        </button>
      ))}
    </div>
  )
}

function PremiumTab() {
  const [d, setD] = useState(null)
  const [benefits, setBenefits] = useState('')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID')
  const STAT = { completed: 'Berhasil', pending: 'Menunggu', expired: 'Kedaluwarsa', canceled: 'Dibatalkan', failed: 'Gagal' }

  const load = useCallback(async () => {
    try { const r = await devPremiumOverview(); setD(r); setBenefits(r.benefits || '') } catch (e) { setMsg({ text: e.message }) }
  }, [])
  useEffect(() => { load() }, [load])

  const edit = (p) => { setMsg(null); setForm(p ? { id: p.id, name: p.name, days: String(p.days), price: String(p.price), bonus: String(p.bonus_gold || 0), sort: String(p.sort), active: p.active, old: true } : { id: '', name: '', days: '30', price: '', bonus: '0', sort: '0', active: true, old: false }) }
  async function run(fn, ok) {
    if (busy) return
    setBusy(true); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); await load() } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  const savePlan = () => run(async () => {
    await devPremiumPlanSave({ id: form.id.trim(), name: form.name.trim(), days: parseInt(form.days, 10), price: parseInt(form.price, 10), bonus: parseInt(form.bonus || '0', 10), active: form.active, sort: parseInt(form.sort, 10) || 0 })
    setForm(null)
  }, 'Paket disimpan')
  const delPlan = () => { if (window.confirm(`Hapus paket "${form.name}"? Riwayat transaksi lama tetap aman.`)) run(async () => { await devPremiumPlanDelete(form.id); setForm(null) }, 'Paket dihapus') }

  return (
    <div className="dv-banner">
      {!d ? <p className="muted small">Memuat…</p> : (
        <>
          <div className="dv-clstats">
            <span>Premium aktif<b>{fmt(d.stats.active_members)}</b></span>
            <span>Menunggu bayar<b>{fmt(d.stats.pending)}</b></span>
            <span>Transaksi sukses<b>{fmt(d.stats.completed)}</b></span>
            <span>Total masuk (kotor)<b className="gold">Rp {fmt(d.stats.revenue)}</b></span>
          </div>

          <label className="dv-lab">Manfaat Premium (1 baris = 1 poin, tampil di halaman Premium)</label>
          <textarea className="dv-input" style={{ height: 110, padding: 12, resize: 'vertical' }} value={benefits} maxLength={1500} onChange={(e) => setBenefits(e.target.value)} />
          <button className="dv-send" disabled={busy} onClick={() => run(() => devPremiumBenefits(benefits), 'Manfaat disimpan')}><Icon name="check" size={22} />Simpan manfaat</button>

          <p className="dv-lab soft" style={{ marginTop: 22 }}>Paket Premium (harga & durasi diatur di sini)</p>
          {d.plans.length === 0 && <p className="muted small">Belum ada paket. Tekan "Tambah paket".</p>}
          {d.plans.map((p) => (
            <button key={p.id} className={`dv-clrow ${form?.id === p.id ? 'on' : ''}`} onClick={() => edit(p)}>
              <span><b>{p.name}</b><small>{p.days} hari · bonus {fmt(p.bonus_gold)} WakuGold · {p.active ? 'aktif' : 'nonaktif'} · {p.id}</small></span>
              <em><b>Rp {fmt(p.price)}</b></em>
            </button>
          ))}
          <button className="dv-chip" style={{ marginTop: 10 }} onClick={() => edit(null)}>+ Tambah paket</button>

          {form && (
            <div className="dv-clsel" style={{ marginTop: 14 }}>
              <label className="dv-lab">ID paket (huruf kecil/angka, contoh: bulanan)</label>
              <input className="dv-input" value={form.id} disabled={form.old} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) })} />
              <label className="dv-lab">Nama paket</label>
              <input className="dv-input" value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <label className="dv-lab">Durasi (hari)</label>
              <input className="dv-input" inputMode="numeric" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
              <label className="dv-lab">Harga (Rupiah, 500 - 10.000.000)</label>
              <input className="dv-input" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
              <label className="dv-lab">Bonus WakuGold tiap pembelian (0 = tanpa bonus, maks 100.000.000)</label>
              <input className="dv-input" inputMode="numeric" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value.replace(/\D/g, '').slice(0, 9) })} />
              <label className="dv-lab">Urutan tampil (kecil dulu)</label>
              <input className="dv-input" inputMode="numeric" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
              <div className="dv-chips" style={{ marginTop: 10 }}>
                <button className={`dv-chip ${form.active ? 'on' : ''}`} onClick={() => setForm({ ...form, active: true })}>Aktif</button>
                <button className={`dv-chip ${!form.active ? 'on' : ''}`} onClick={() => setForm({ ...form, active: false })}>Nonaktif</button>
              </div>
              <button className="dv-send" disabled={busy} onClick={savePlan}><Icon name="check" size={22} />{busy ? 'Menyimpan…' : 'Simpan paket'}</button>
              {form.old && <button className="dv-ban" disabled={busy} onClick={delPlan}><Icon name="ban" size={22} />Hapus paket</button>}
              <button className="dv-chip" style={{ marginTop: 8 }} onClick={() => setForm(null)}>Tutup</button>
            </div>
          )}
          {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}

          <p className="dv-lab soft" style={{ marginTop: 22 }}>Transaksi terbaru</p>
          {d.recent.length === 0 ? <p className="muted small">Belum ada transaksi.</p> : d.recent.map((o) => (
            <div key={o.order_id} className="dv-clrow" style={{ cursor: 'default' }}>
              <span><b>{o.name || 'User'}</b><small>{o.plan_name} · {STAT[o.status] || o.status}{o.is_sandbox ? ' · sandbox' : ''} · {fmtDate(o.created_at)}</small></span>
              <em><b>Rp {fmt(o.amount)}</b></em>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function LbTab() {
  const PERIODS = [['daily', 'Harian'], ['weekly', 'Minggu'], ['monthly', 'Bulan']]
  const PAGE = 40
  const [period, setPeriod] = useState('daily')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(null)
  const [more, setMore] = useState(false)
  const [sel, setSel] = useState(null)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID')
  const label = PERIODS.find((p) => p[0] === period)[1]

  const load = useCallback(async (per, query, offset = 0) => {
    setBusy(true)
    try {
      const r = (await devLbList(per, query.trim(), offset, PAGE)) || []
      setRows((prev) => (offset ? [...(prev || []), ...r] : r)); setMore(r.length === PAGE)
      return r
    } catch (e) { setMsg({ text: e.message }); return [] } finally { setBusy(false) }
  }, [])
  useEffect(() => { setSel(null); setMsg(null); load(period, q) }, [period])

  const pick = (r) => { setSel(r); setVal(String(Math.round(Number(r.lb_xp) || 0))); setMsg(null) }
  async function refreshSel(uid) {
    const r = await load(period, q)
    const again = r.find((x) => x.user_id === uid)
    if (again) setSel(again)
  }
  const v = parseInt(val || '0', 10)
  async function save() {
    if (!sel || busy) return
    if (!(v >= 0)) return setMsg({ text: 'Isi XP LB (0 atau lebih)' })
    const lvl = levelInfo(sel.real_xp).level
    if (!window.confirm(`Ubah XP LB ${label} untuk #${sel.seq} ${sel.name}\n${fmt(sel.lb_xp)}  ->  ${fmt(v)}\n\nXP asli (${fmt(sel.real_xp)}) dan level (${lvl}) TIDAK berubah.`)) return
    setBusy(true); setMsg(null)
    try { await devLbSet(sel.user_id, period, v); setMsg({ ok: true, text: `XP LB ${label} #${sel.seq} sekarang ${fmt(v)}` }); await refreshSel(sel.user_id) }
    catch (e) { setMsg({ text: e.message }); setBusy(false) }
  }
  async function reset() {
    if (!sel || busy) return
    if (!window.confirm(`Kembalikan XP LB ${label} #${sel.seq} ${sel.name} ke XP asli (hapus semua perubahan Developer di periode ini)?`)) return
    setBusy(true); setMsg(null)
    try { const n = await devLbReset(sel.user_id, period); setMsg({ ok: true, text: `Dikembalikan. XP LB ${label} sekarang ${fmt(n)}` }); await refreshSel(sel.user_id) }
    catch (e) { setMsg({ text: e.message }); setBusy(false) }
  }

  return (
    <div className="dv-banner">
      <div className="dv-chips" style={{ marginBottom: 10 }}>
        {PERIODS.map(([k, t]) => <button key={k} className={`dv-chip ${period === k ? 'on' : ''}`} onClick={() => setPeriod(k)}>{t}</button>)}
      </div>
      <div className="dv-row">
        <input className="dv-input" style={{ flex: 1 }} value={q} placeholder="Cari nama atau #ID" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(period, q)} />
        <button className="dv-go" disabled={busy} onClick={() => load(period, q)}>Cari</button>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>Angka besar = XP yang tampil di Leaderboard {label}. Mengubahnya tidak mengubah XP asli dan level user.</p>

      {sel && (
        <div className="bk-card">
          <div className="bk-who"><b>{sel.name}</b><span className="dv-mono">#{sel.seq}</span></div>
          <p className="muted small">XP LB {label}: <b>{fmt(sel.lb_xp)}</b> · XP asli: <b>{fmt(sel.real_xp)}</b> · Level: <b>{levelInfo(sel.real_xp).level}</b></p>
          <label className="dv-lab">XP LB {label} baru</label>
          <input className="dv-input" value={val} inputMode="numeric" onChange={(e) => setVal(e.target.value.replace(/\D/g, '').slice(0, 10))} />
          <button className="dv-send" disabled={busy} onClick={save}><Icon name="check" size={22} />{busy ? 'Memproses…' : `Simpan XP LB ${label}`}</button>
          <button className="dv-chip" style={{ marginTop: 8 }} disabled={busy} onClick={reset}>Kembalikan ke XP asli</button>
          <button className="dv-chip" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => setSel(null)}>Tutup</button>
        </div>
      )}
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}

      {rows === null ? <p className="muted small">Memuat…</p> : rows.length === 0 ? <p className="muted small">Tidak ada user.</p> : rows.map((r, i) => (
        <button key={r.user_id} className={`dv-clrow ${sel?.user_id === r.user_id ? 'on' : ''}`} onClick={() => pick(r)}>
          <span><b>{q.trim() ? '' : `${i + 1}. `}{r.name}</b><small>#{r.seq} · Lvl {levelInfo(r.real_xp).level} · XP asli {fmt(r.real_xp)}{r.adjusted ? ' · diubah' : ''}</small></span>
          <em><b>{fmt(r.lb_xp)}</b></em>
        </button>
      ))}
      {more && <button className="dv-chip" style={{ marginTop: 10 }} disabled={busy} onClick={() => load(period, q, rows.length)}>Muat lebih banyak</button>}
    </div>
  )
}

function GiftPremiumTab() {
  const [val, setVal] = useState('')
  const [found, setFound] = useState(null)
  const [info, setInfo] = useState(null)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('add')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fmtD = (iso) => iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB' : '-'

  async function search() {
    const n = String(val).trim().replace(/^#/, '')
    setFound(null); setInfo(null); setMsg(null); setAmount('')
    if (!/^\d{1,12}$/.test(n)) return setMsg({ text: 'Masukkan ID berupa angka, contoh: 1' })
    setBusy(true)
    const { data, error } = await supabase.rpc('dev_find_user', { p_seq: Number(n) })
    if (error) { setBusy(false); return setMsg({ text: error.message || 'Gagal mencari' }) }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) { setBusy(false); return setMsg({ text: `ID #${n} tidak ditemukan` }) }
    try { setInfo(await devPremiumInfo(row.user_id)); setFound(row) } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  const days = parseInt(amount, 10) || 0
  async function apply() {
    if (!found || busy) return
    if (!(days >= 1)) return setMsg({ text: 'Isi jumlah hari minimal 1' })
    if (mode === 'sub' && !info?.active) return setMsg({ text: 'User ini tidak punya Premium aktif' })
    if (mode === 'sub' && days > (info?.days_left || 0)) return setMsg({ text: `Sisa Premium hanya ${info.days_left} hari, tidak bisa dikurangi ${days} hari` })
    if (!window.confirm(`${mode === 'add' ? 'TAMBAH' : 'KURANGI'} ${days} hari Premium untuk #${found.seq} ${found.name}?\nBerakhir sekarang: ${info?.active ? fmtD(info.expires_at) : 'tidak aktif'}`)) return
    setBusy(true); setMsg(null)
    try {
      const exp = await devPremiumGift(found.user_id, days, mode)
      setInfo(await devPremiumInfo(found.user_id)); setAmount('')
      setMsg({ ok: true, text: `${mode === 'add' ? 'Ditambah' : 'Dikurangi'} ${days} hari. Premium berakhir: ${fmtD(exp)}` })
    } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }

  return (
    <div className="dv-banner">
      <label className="dv-lab">Cari ID user (harus persis)</label>
      <div className="dv-row">
        <input className="dv-input" style={{ flex: 1 }} value={val} inputMode="numeric" placeholder="Contoh: 1" onChange={(e) => setVal(e.target.value.replace(/[^\d#]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="dv-go" disabled={busy || !val.trim()} onClick={search}>Cari</button>
      </div>
      {found && (
        <div className="bk-card">
          <div className="bk-who"><b>{found.name}</b><span className="dv-mono">#{found.seq}</span></div>
          <p className="muted small">{found.email}</p>
          <p className="dv-gold">Premium: <b>{info?.active ? `aktif sampai ${fmtD(info.expires_at)} (${info.days_left} hari lagi)` : 'tidak aktif'}</b></p>

          <label className="dv-lab">Jumlah hari</label>
          <input className="dv-input" value={amount} inputMode="numeric" placeholder="Contoh: 30" onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          <label className="dv-lab">Pilih tindakan</label>
          <div className="dv-chips">
            <button className={`dv-chip ${mode === 'add' ? 'on' : ''}`} onClick={() => setMode('add')}>Tambah</button>
            <button className={`dv-chip ${mode === 'sub' ? 'on' : ''}`} onClick={() => setMode('sub')}>Kurangi</button>
          </div>
          {mode === 'add'
            ? <button className="dv-send" disabled={busy || days < 1} onClick={apply}><Icon name="check" size={22} />{busy ? 'Memproses…' : `Tambah ${days || ''} hari Premium`}</button>
            : <button className="dv-ban" disabled={busy || days < 1} onClick={apply}><Icon name="ban" size={22} />{busy ? 'Memproses…' : `Kurangi ${days || ''} hari Premium`}</button>}
          <p className="muted small" style={{ marginTop: 8 }}>Gift tidak memberi bonus WakuGold. Bonus hanya untuk pembelian.</p>
        </div>
      )}
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
    </div>
  )
}

function GiveawayXpTab() {
  const [cfg, setCfg] = useState(null)
  const [per, setPer] = useState('')
  const [cap, setCap] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const load = useCallback(async () => {
    try { const r = await devGiveawayXpGet(); setCfg(r); setPer(String(r.xp_per_day)); setCap(String(r.daily_cap)) } catch (e) { setMsg({ text: /could not find the function|schema cache/i.test(e.message || '') ? 'Fungsi database belum ada. Jalankan supabase/giveaway-xp.sql di SQL Editor Supabase, lalu buka tab ini lagi.' : (e.message || 'Gagal memuat') }) }
  }, [])
  useEffect(() => { load() }, [load])
  const p = parseInt(per, 10), c = parseInt(cap, 10)
  const bad = !(p >= 0 && p <= 2000) || !(c >= 0 && c <= 10000000)
  async function save() {
    if (busy || bad) return
    if (!window.confirm(`Ubah XP giveaway menjadi ${p} XP per hari (batas harian ${c} XP per pembuat)?\nHanya berlaku untuk giveaway berikutnya.`)) return
    setBusy(true); setMsg(null)
    try { const r = await devGiveawayXpSet(p, c); setCfg((o) => ({ ...o, ...r })); setMsg({ ok: true, text: 'Tersimpan' }) } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  return (
    <div className="dv-banner">
      {cfg && <p className="dv-gold">XP per hari saat ini: <b>{cfg.xp_per_day}</b> &middot; terbayar hari ini: <b>{Number(cfg.paid_today).toLocaleString('en-US')} XP</b></p>}
      <label className="dv-lab">XP per hari hadiah (0 - 2000)</label>
      <input className="dv-input" value={per} inputMode="numeric" placeholder="1000" onChange={(e) => setPer(e.target.value.replace(/\D/g, '').slice(0, 4))} />
      <p className="muted small">Contoh: {p >= 0 ? p : 0} XP = 1 hari hadiah. Giveaway 1 hari x 5 orang = {((p >= 0 ? p : 0) * 5).toLocaleString('en-US')} XP, 3 hari x 2 orang = {((p >= 0 ? p : 0) * 6).toLocaleString('en-US')} XP. Itu tarif dasar. Makin besar giveaway makin tinggi: hari ke 26-100 x1,15, ke 101-250 x1,3, ke 251+ x1,5 (tabel giveaway_xp_tiers).</p>
      <label className="dv-lab">Batas XP giveaway per pembuat per hari (0 - 10.000.000)</label>
      <input className="dv-input" value={cap} inputMode="numeric" placeholder="3000000" onChange={(e) => setCap(e.target.value.replace(/\D/g, '').slice(0, 8))} />
      <button className="dv-send" disabled={busy || bad || !cfg} onClick={save}><Icon name="check" size={22} />{busy ? 'Menyimpan…' : 'Simpan XP Giveaway'}</button>
      <p className="muted small" style={{ marginTop: 8 }}>XP giveaway cair langsung saat giveaway dikirim (tidak perlu diklaim), maks 2.000.000 XP per giveaway, tidak masuk Leaderboard. Hadiah yang tidak diklaim tidak menarik XP kembali. Isi 0 untuk mematikan.</p>
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
    </div>
  )
}

function LevelCfgTab() {
  const init = getLevelCfg()
  const [base, setBase] = useState(init ? String(init.base_cost) : '')
  const [growth, setGrowth] = useState(init ? String(init.growth) : '')
  const [tiers, setTiers] = useState(init ? init.tiers.map(String) : TIER_DEFS.map(() => ''))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    loadLevelCfg().finally(() => { const c = getLevelCfg(); if (c) { setBase(String(c.base_cost)); setGrowth(String(c.growth)); setTiers(c.tiers.map(String)) } })
  }, [])
  const nums = tiers.map(Number)
  const okTiers = nums.length === 10 && nums[0] === 1 && nums.every((n, i) => Number.isInteger(n) && (i === 0 || n > nums[i - 1]))
  const bad = !(Number(base) >= 100) || !(Number(growth) >= 0) || growth === '' || !okTiers
  async function save() {
    if (busy || bad) return
    if (!window.confirm('Simpan rumus level dan tier? Level semua pengguna akan dihitung ulang dari total XP mereka (XP asli tidak berubah). Berlaku di aplikasi pengguna saat dibuka kembali.')) return
    setBusy(true); setMsg(null)
    try { await devLevelCfgSet(Number(base), Number(growth), nums); setMsg({ ok: true, text: 'Tersimpan' }) } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  const setTier = (i, v) => setTiers((l) => l.map((x, j) => (j === i ? v.replace(/\D/g, '').slice(0, 7) : x)))
  return (
    <div className="dv-banner">
      <label className="dv-lab">XP dasar per level</label>
      <input className="dv-input" value={base} inputMode="numeric" onChange={(e) => setBase(e.target.value.replace(/\D/g, '').slice(0, 7))} />
      <label className="dv-lab">Pertumbuhan biaya per level (contoh 0.0008)</label>
      <input className="dv-input" value={growth} inputMode="decimal" onChange={(e) => setGrowth(e.target.value.replace(/[^\d.]/g, '').slice(0, 8))} />
      <label className="dv-lab">Level awal tiap tier (harus naik terus, tier pertama selalu 1)</label>
      {TIER_DEFS.map((t, i) => (
        <div className="dv-row" key={t.name} style={{ alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1 }}>{t.name}</span>
          <input className="dv-input" style={{ width: 120 }} value={tiers[i]} inputMode="numeric" disabled={i === 0} onChange={(e) => setTier(i, e.target.value)} />
        </div>
      ))}
      <button className="dv-send" disabled={busy || bad} onClick={save}><Icon name="check" size={22} />{busy ? 'Menyimpan…' : 'Simpan Rumus Level'}</button>
      <p className="muted small" style={{ marginTop: 8 }}>Hanya mengubah cara level dihitung dari total XP. Dicek dan dicatat di server.</p>
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
    </div>
  )
}

function GachaTab() {
  const [list, setList] = useState(null)
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('10')
  const [rarity, setRarity] = useState('common')
  const [url, setUrl] = useState('')
  const [editId, setEditId] = useState(null)
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [pending, setPending] = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => { try { setList(await gachaDevList()) } catch (e) { setMsg({ text: e.message }) } }, [])
  useEffect(() => { load() }, [load])

  const total = (list || []).filter((w) => w.active && w.id !== editId).reduce((s, w) => s + Number(w.weight), 0)
  const w = Number(weight)
  const pct = w > 0 ? ((w / (total + (active ? w : 0))) * 100) : 0

  function dropPending() { if (pending) { removeGachaImage(pending); setPending(null) } }
  function reset(keepFile = false) { if (!keepFile) dropPending(); setName(''); setWeight('10'); setRarity('common'); setUrl(''); setEditId(null); setActive(true) }
  function edit(x) { setEditId(x.id); setName(x.name); setWeight(String(x.weight)); setRarity(x.rarity); setUrl(x.image_url); setActive(x.active); setMsg(null); window.scrollTo?.(0, 0) }

  async function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setMsg(null)
    try { const u = await uploadGachaImage(f); dropPending(); setUrl(u); setPending(u); setMsg({ ok: true, text: 'Gambar berhasil diunggah ke GitHub (folder Wallpaper)' }) }
    catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  async function save() {
    setMsg(null)
    if (!name.trim()) return setMsg({ text: 'Nama wajib diisi' })
    if (!(w > 0)) return setMsg({ text: 'Peluang harus lebih dari 0' })
    if (!url.trim()) return setMsg({ text: 'Impor gambar atau tempel link .gif dulu' })
    setBusy(true)
    try {
      const old = editId ? (list || []).find((x) => x.id === editId)?.image_url : null
      await gachaDevSave({ id: editId, name: name.trim(), rarity, weight: w, url: url.trim(), active })
      setPending(null)
      if (old && old !== url.trim()) removeGachaImage(old)
      setMsg({ ok: true, text: editId ? 'Wallpaper diperbarui' : 'Wallpaper ditambahkan ke gacha' }); reset(true); await load()
    }
    catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  async function del(x) {
    if (!window.confirm(`Hapus "${x.name}"? Koleksi pemain yang memilikinya ikut terhapus.`)) return
    setBusy(true)
    try { await gachaDevDelete(x.id); const clean = await removeGachaImage(x.image_url); setMsg(clean ? null : { text: `"${x.name}" dihapus dari database, tapi file gambarnya belum terhapus dari GitHub.` }); await load() } catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  async function toggle(x) {
    setBusy(true)
    try { await gachaDevSave({ id: x.id, name: x.name, rarity: x.rarity, weight: x.weight, url: x.image_url, active: !x.active }); await load() } catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }

  return (
    <div className="gwd">
      <h3>{editId ? 'Ubah wallpaper' : 'Tambah wallpaper ke gacha'}</h3>
      <label>Nama</label>
      <input className="dv-input" value={name} maxLength={40} placeholder="Contoh: Sakura Malam" onChange={(e) => setName(e.target.value)} />
      <label>Rarity</label>
      <div className="gwd-rar">
        {RARITY_ORDER.slice().reverse().map((r) => (
          <button key={r} className={rarity === r ? 'on' : ''} style={{ '--rc': RARITY[r].color }} onClick={() => setRarity(r)}>{RARITY[r].label}</button>
        ))}
      </div>
      <label>Peluang dapat (bobot)</label>
      <input className="dv-input" value={weight} inputMode="decimal" placeholder="10" onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))} />
      <p className="gwd-hint">Makin besar angkanya makin mudah keluar. Peluang asli = bobot ÷ total bobot semua wallpaper aktif. {w > 0 && <b>Perkiraan: {pct.toFixed(2)}%</b>}</p>
      <label>Gambar</label>
      <input className="dv-input" value={url} maxLength={500} placeholder="Link .gif / foto (https://...)" inputMode="url" autoCapitalize="none" autoCorrect="off" onChange={(e) => { dropPending(); setUrl(e.target.value.trim()) }} />
      <input ref={fileRef} type="file" accept="image/gif,image/jpeg,image/png,image/webp" hidden onChange={pickFile} />
      <button className="gwd-imp" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Memproses…' : 'Impor foto / GIF dari HP'}</button>
      <p className="gwd-hint">Tempel link gambar, atau tekan Impor (maks 10 MB). File impor otomatis disimpan di GitHub, folder Wallpaper/ (bukan di storage Supabase).</p>
      {url && <img className="gwd-prev" src={url} alt="Pratinjau" referrerPolicy="no-referrer" />}
      <label className="gwd-chk"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif (ikut diundi)</label>
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
      <div className="dv-btns">
        {(editId || pending) && <Button variant="secondary" onClick={() => reset()}>Batal</Button>}
        <Button onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : editId ? 'Simpan perubahan' : 'Tambah ke gacha'}</Button>
      </div>

      <h3 style={{ marginTop: 22 }}>Daftar wallpaper ({list ? list.length : 0})</h3>
      {list && list.length === 0 && <p className="gwd-hint">Masih kosong. Tambahkan wallpaper pertama di atas.</p>}
      {(list || []).map((x) => (
        <div key={x.id} className={`gwd-row ${x.active ? '' : 'off'}`} style={{ '--rc': RARITY[x.rarity].color }}>
          <img src={x.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          <div className="gwd-info" onClick={() => edit(x)}>
            <b>{x.name}</b>
            <span><i style={{ background: RARITY[x.rarity].color }} />{RARITY[x.rarity].label} · bobot {Number(x.weight)} · {Number(x.pct).toFixed(2)}%</span>
            <span>{x.owners} pemilik{x.active ? '' : ' · nonaktif'}</span>
          </div>
          <div className="gwd-act">
            <button disabled={busy} onClick={() => toggle(x)}>{x.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
            <button disabled={busy} className="del" onClick={() => del(x)}>Hapus</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function PetTab() {
  const [list, setList] = useState(null)
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('10')
  const [rarity, setRarity] = useState('common')
  const [incMin, setIncMin] = useState('50')
  const [incMax, setIncMax] = useState('100')
  const [url, setUrl] = useState('')
  const [editId, setEditId] = useState(null)
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [pending, setPending] = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => { try { setList(await petDevList()) } catch (e) { setMsg({ text: e.message }) } }, [])
  useEffect(() => { load() }, [load])

  const total = (list || []).filter((p) => p.active && p.id !== editId).reduce((a, p) => a + Number(p.weight), 0)
  const w = Number(weight)
  const pct = w > 0 ? ((w / (total + (active ? w : 0))) * 100) : 0

  function dropPending() { if (pending) { removePetImage(pending); setPending(null) } }
  function reset(keepFile = false) { if (!keepFile) dropPending(); setName(''); setWeight('10'); setRarity('common'); setIncMin('50'); setIncMax('100'); setUrl(''); setEditId(null); setActive(true) }
  function edit(x) { setEditId(x.id); setName(x.name); setWeight(String(x.weight)); setRarity(x.rarity); setIncMin(String(x.income_min)); setIncMax(String(x.income_max)); setUrl(x.image_url); setActive(x.active); setMsg(null); window.scrollTo?.(0, 0) }

  async function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setMsg(null)
    try { const u = await uploadPetImage(f); dropPending(); setUrl(u); setPending(u); setMsg({ ok: true, text: 'Pet berhasil diunggah ke GitHub (folder Pet)' }) }
    catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  async function save() {
    setMsg(null)
    if (!name.trim()) return setMsg({ text: 'Nama wajib diisi' })
    if (!(w > 0)) return setMsg({ text: 'Peluang harus lebih dari 0' })
    const imin = Number(incMin), imax = Number(incMax)
    if (!Number.isInteger(imin) || imin < 1) return setMsg({ text: 'Pendapatan minimum harus bilangan bulat, minimal 1' })
    if (!Number.isInteger(imax) || imax < imin) return setMsg({ text: 'Pendapatan maksimum harus bilangan bulat dan tidak lebih kecil dari minimum' })
    if (imax > 1000000) return setMsg({ text: 'Pendapatan maksimum 1.000.000 WakuGold' })
    if (!url.trim()) return setMsg({ text: 'Impor gambar atau tempel link gambar dulu' })
    setBusy(true)
    try {
      const old = editId ? (list || []).find((x) => x.id === editId)?.image_url : null
      await petDevSave({ id: editId, name: name.trim(), rarity, weight: w, url: url.trim(), active, incomeMin: imin, incomeMax: imax })
      setPending(null)
      if (old && old !== url.trim()) removePetImage(old)
      setMsg({ ok: true, text: editId ? 'Pet diperbarui' : 'Pet ditambahkan ke gacha' }); reset(true); await load()
    } catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  async function del(x) {
    if (!window.confirm(`Hapus "${x.name}"? Koleksi pemain yang memilikinya ikut terhapus.`)) return
    setBusy(true)
    try { await petDevDelete(x.id); const clean = await removePetImage(x.image_url); setMsg(clean ? null : { text: `"${x.name}" dihapus dari database, tapi file gambarnya belum terhapus dari GitHub.` }); await load() } catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  async function toggle(x) {
    setBusy(true)
    try { await petDevSave({ id: x.id, name: x.name, rarity: x.rarity, weight: x.weight, url: x.image_url, active: !x.active, incomeMin: x.income_min, incomeMax: x.income_max }); await load() } catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }

  return (
    <div className="gwd">
      <h3>{editId ? 'Ubah pet' : 'Impor Pet'}</h3>
      <label>Nama</label>
      <input className="dv-input" value={name} maxLength={40} placeholder="Contoh: Naga Kristal" onChange={(e) => setName(e.target.value)} />
      <label>Rarity</label>
      <div className="gwd-rar">
        {PET_RARITY_ORDER.slice().reverse().map((r) => (
          <button key={r} className={rarity === r ? 'on' : ''} style={{ '--rc': PET_RARITY[r].color }} onClick={() => setRarity(r)}>{PET_RARITY[r].label}</button>
        ))}
      </div>
      <label>Peluang dapat (bobot)</label>
      <input className="dv-input" value={weight} inputMode="decimal" placeholder="10" onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))} />
      <p className="gwd-hint">Makin besar angkanya makin mudah keluar. Peluang asli = bobot ÷ total bobot semua pet aktif. {w > 0 && <b>Perkiraan: {pct.toFixed(2)}%</b>}</p>
      <label>Pendapatan WakuGold per 24 jam</label>
      <div className="pet-inc">
        <input className="dv-input" value={incMin} inputMode="numeric" placeholder="Minimum" aria-label="Pendapatan minimum" onChange={(e) => setIncMin(e.target.value.replace(/\D/g, '').slice(0, 7))} />
        <span>sampai</span>
        <input className="dv-input" value={incMax} inputMode="numeric" placeholder="Maksimum" aria-label="Pendapatan maksimum" onChange={(e) => setIncMax(e.target.value.replace(/\D/g, '').slice(0, 7))} />
      </div>
      <p className="gwd-hint">Tiap klaim, server mengundi jumlahnya di antara dua angka ini, jadi hasilnya bisa berbeda setiap klaim. Isi sama untuk jumlah tetap.</p>
      <label>Gambar</label>
      <input className="dv-input" value={url} maxLength={500} placeholder="Link PNG / WebP / GIF transparan (https://...)" inputMode="url" autoCapitalize="none" autoCorrect="off" onChange={(e) => { dropPending(); setUrl(e.target.value.trim()) }} />
      <input ref={fileRef} type="file" accept="image/png,image/webp,image/gif" hidden onChange={pickFile} />
      <button className="gwd-imp" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Memproses…' : 'Impor Pet dari HP'}</button>
      <p className="gwd-hint">PNG / WebP / GIF dengan latar transparan, 64-2048 px, maks 5 MB. File tidak diubah (transparansi & animasi tetap utuh) dan otomatis disimpan di GitHub, folder Pet/.</p>
      {url && <div className="pet-prev"><img src={url} alt="Pratinjau" referrerPolicy="no-referrer" /></div>}
      <label className="gwd-chk"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif (ikut diundi)</label>
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
      <div className="dv-btns">
        {(editId || pending) && <Button variant="secondary" onClick={() => reset()}>Batal</Button>}
        <Button onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : editId ? 'Simpan perubahan' : 'Tambah ke gacha'}</Button>
      </div>

      <h3 style={{ marginTop: 22 }}>Daftar pet ({list ? list.length : 0})</h3>
      {list && list.length === 0 && <p className="gwd-hint">Masih kosong. Impor pet pertama di atas.</p>}
      {(list || []).map((x) => (
        <div key={x.id} className={`gwd-row ${x.active ? '' : 'off'}`} style={{ '--rc': PET_RARITY[x.rarity].color }}>
          <img className="pet-thumb" src={x.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          <div className="gwd-info" onClick={() => edit(x)}>
            <b>{x.name}</b>
            <span><i style={{ background: PET_RARITY[x.rarity].color }} />{PET_RARITY[x.rarity].label} · bobot {Number(x.weight)} · {Number(x.pct).toFixed(2)}%</span>
            <span>{fmtNum(x.income_min)}{Number(x.income_max) !== Number(x.income_min) ? ` - ${fmtNum(x.income_max)}` : ''} WakuGold / 24 jam</span>
            <span>{x.owners} pemilik{x.active ? '' : ' · nonaktif'}</span>
          </div>
          <div className="gwd-act">
            <button disabled={busy} onClick={() => toggle(x)}>{x.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
            <button disabled={busy} className="del" onClick={() => del(x)}>Hapus</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmblemTab() {
  const [list, setList] = useState(null)
  const [name, setName] = useState('')
  const [rarity, setRarity] = useState('common')
  const [url, setUrl] = useState('')
  const [editId, setEditId] = useState(null)
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [pending, setPending] = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => { try { setList(await devEmblemList()) } catch (e) { setMsg({ text: e.message }) } }, [])
  useEffect(() => { load() }, [load])

  function dropPending() { if (pending) { removeEmblemImage(pending); setPending(null) } }
  function reset(keepFile = false) { if (!keepFile) dropPending(); setName(''); setRarity('common'); setUrl(''); setEditId(null); setActive(true) }
  function edit(x) { setEditId(x.id); setName(x.name); setRarity(x.rarity); setUrl(x.image_url); setActive(x.active); setMsg(null); window.scrollTo?.(0, 0) }

  async function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setMsg(null)
    try { const u = await uploadEmblemImage(f); dropPending(); setUrl(u); setPending(u); setMsg({ ok: true, text: 'Emblem berhasil diunggah ke GitHub (folder Emblem)' }) }
    catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  async function save() {
    setMsg(null)
    if (!name.trim()) return setMsg({ text: 'Nama wajib diisi' })
    if (!url.trim()) return setMsg({ text: 'Impor gambar atau tempel link gambar dulu' })
    setBusy(true)
    try {
      const old = editId ? (list || []).find((x) => x.id === editId)?.image_url : null
      await devEmblemSave({ id: editId, name: name.trim(), rarity, url: url.trim(), active })
      setPending(null)
      if (old && old !== url.trim()) removeEmblemImage(old)
      setMsg({ ok: true, text: editId ? 'Emblem diperbarui' : 'Emblem ditambahkan ke gacha' }); reset(true); await load()
    } catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  async function del(x) {
    if (!window.confirm(`Hapus "${x.name}"? Kepemilikan clan ikut terhapus dan clan yang memakainya kembali tanpa emblem.`)) return
    setBusy(true)
    try { await devEmblemDelete(x.id); const clean = await removeEmblemImage(x.image_url); setMsg(clean ? null : { text: `"${x.name}" dihapus dari database, tapi file gambarnya belum terhapus dari GitHub.` }); await load() } catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  async function toggle(x) {
    setBusy(true)
    try { await devEmblemSave({ id: x.id, name: x.name, rarity: x.rarity, url: x.image_url, active: !x.active }); await load() } catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }

  return (
    <div className="gwd">
      <h3>{editId ? 'Ubah emblem' : 'Tambah emblem ke gacha'}</h3>
      <label>Nama</label>
      <input className="dv-input" value={name} maxLength={40} placeholder="Contoh: Pedang Biru" onChange={(e) => setName(e.target.value)} />
      <label>Rarity</label>
      <div className="gwd-rar">
        {EMBLEM_ORDER.map((r) => (
          <button key={r} className={rarity === r ? 'on' : ''} style={{ '--rc': EMBLEM_RARITY[r].color }} onClick={() => setRarity(r)}>{EMBLEM_RARITY[r].label}</button>
        ))}
      </div>
      <label>Gambar</label>
      <input className="dv-input" value={url} maxLength={500} placeholder="Link gambar (https://...)" inputMode="url" autoCapitalize="none" autoCorrect="off" onChange={(e) => { dropPending(); setUrl(e.target.value.trim()) }} />
      <input ref={fileRef} type="file" accept="image/png,image/webp,image/gif,image/jpeg" hidden onChange={pickFile} />
      <button className="gwd-imp" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Memproses…' : 'Impor emblem dari HP'}</button>
      <p className="gwd-hint">64-1024 px, rasio maks 3:1, maks 2 MB. PNG transparan tetap transparan. Emblem tampil sesuai bentuk gambarnya (tanpa lingkaran) di sisi kiri badge clan. File impor otomatis disimpan di GitHub, folder Emblem/.</p>
      {url && <div className="emb-prev"><ClanBadge tag="PC" tier={5} emblem={url} size={34} /><ClanBadge tag="PC" tier={1} emblem={url} size={34} /></div>}
      <label className="gwd-chk"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif (ikut diundi)</label>
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
      <div className="dv-btns">
        {(editId || pending) && <Button variant="secondary" onClick={() => reset()}>Batal</Button>}
        <Button onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : editId ? 'Simpan perubahan' : 'Tambah ke gacha'}</Button>
      </div>

      <h3 style={{ marginTop: 22 }}>Daftar emblem ({list ? list.length : 0})</h3>
      {list && list.length === 0 && <p className="gwd-hint">Masih kosong. Tambahkan emblem pertama di atas.</p>}
      {(list || []).map((x) => (
        <div key={x.id} className={`gwd-row ${x.active ? '' : 'off'}`} style={{ '--rc': EMBLEM_RARITY[x.rarity].color }}>
          <img className="emb-thumb" src={x.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          <div className="gwd-info" onClick={() => edit(x)}>
            <b>{x.name}</b>
            <span><i style={{ background: EMBLEM_RARITY[x.rarity].color }} />{EMBLEM_RARITY[x.rarity].label}</span>
            <span>{x.owners} clan memiliki{x.active ? '' : ' · nonaktif'}</span>
          </div>
          <div className="gwd-act">
            <button disabled={busy} onClick={() => toggle(x)}>{x.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
            <button disabled={busy} className="del" onClick={() => del(x)}>Hapus</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function BorderTab() {
  const { user } = useApp()
  const [data, setData] = useState(null)
  const [name, setName] = useState('')
  const [rarity, setRarity] = useState('basic')
  const [url, setUrl] = useState('')
  const [price, setPrice] = useState('')
  const [editId, setEditId] = useState(null)
  const [active, setActive] = useState(true)
  const [filter, setFilter] = useState('imp')
  const [probe, setProbe] = useState({ s: 'idle', text: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [stage, setStage] = useState('')
  const [file, setFile] = useState(null)          // GIF dari HP, baru diunggah saat tombol Impor ditekan (folder ditentukan rarity)
  const [localUrl, setLocalUrl] = useState('')
  const fileRef = useRef(null)

  const load = useCallback(async () => { try { setData(await devBorderList()) } catch (e) { setMsg({ text: e.message }) } }, [])
  useEffect(() => { load() }, [load])

  const list = data?.list || []
  const tiers = data?.tiers || {}
  const tier = tiers[rarity]
  const editing = editId ? list.find((b) => b.id === editId) : null
  const locked = !!editing && !/^u/.test(editing.id)
  const impCount = list.filter((b) => /^u/.test(b.id)).length
  const nameErr = locked ? '' : checkBorderName(name)
  const urlErr = locked || file ? '' : checkBorderUrl(url)
  const priceErr = editId ? checkBorderPrice(price, tier) : ''          // impor baru: harga otomatis dari rarity (tidak diisi)
  const autoPrice = data?.prices?.[rarity] ?? BORDER_PRICES[rarity]
  const lockRarity = !!editing && editing.owners > 0 && !locked

  useEffect(() => {
    if (locked || file) return
    if (!url || checkBorderUrl(url)) { setProbe({ s: 'idle', text: '' }); return }
    setProbe({ s: 'checking', text: 'Memeriksa gambar…' })
    let dead = false
    const im = new Image()
    im.referrerPolicy = 'no-referrer'
    const t = setTimeout(() => { if (!dead) { dead = true; im.src = ''; setProbe({ s: 'bad', text: 'Gambar terlalu lama dimuat (maks 15 detik)' }) } }, 15000)
    const timer = setTimeout(() => {
      im.onload = () => { if (dead) return; dead = true; clearTimeout(t); const e = checkBorderSize(im.naturalWidth, im.naturalHeight); setProbe(e ? { s: 'bad', text: e } : { s: 'ok', text: `Gambar valid (${im.naturalWidth}x${im.naturalHeight})` }) }
      im.onerror = () => { if (dead) return; dead = true; clearTimeout(t); setProbe({ s: 'bad', text: 'Link tidak bisa dimuat sebagai gambar' }) }
      im.src = url
    }, 500)
    return () => { dead = true; clearTimeout(timer); clearTimeout(t); im.onload = im.onerror = null }
  }, [url, locked, file])

  const localSize = (f) => new Promise((res, rej) => {
    const u = URL.createObjectURL(f), im = new Image()
    im.onload = () => { URL.revokeObjectURL(u); res([im.naturalWidth, im.naturalHeight]) }
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('File tidak bisa dibaca sebagai gambar')) }
    im.src = u
  })
  function clearFile() { setFile(null); setLocalUrl((u) => { if (u) URL.revokeObjectURL(u); return '' }) }
  async function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    const bad = checkBorderFile(f)
    if (bad) return setMsg({ text: bad })
    setBusy(true); setMsg(null); setStage('Memeriksa file…')
    try {
      const head = new Uint8Array(await f.slice(0, 6).arrayBuffer())
      const sig = String.fromCharCode(...head)
      if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('Isi file bukan GIF yang valid')
      const [w, h] = await localSize(f)
      const se = checkBorderSize(w, h)
      if (se) throw new Error(se)
      clearFile(); setUrl('')
      setFile(f); setLocalUrl(URL.createObjectURL(f))
      setProbe({ s: 'ok', text: `GIF valid (${w}x${h}). Diunggah ke folder GitHub sesuai rarity saat tombol Impor ditekan` })
      if (!name) setName(nameFromFile(f.name))
    }
    catch (er) { setMsg({ text: er.message }) }
    setStage(''); setBusy(false)
  }
  function reset() { clearFile(); setName(''); setRarity('basic'); setUrl(''); setPrice(''); setEditId(null); setActive(true); setProbe({ s: 'idle', text: '' }) }
  function edit(x) { clearFile(); setEditId(x.id); setName(x.name); setRarity(x.rarity); setUrl(x.image_url || ''); setPrice(String(x.price)); setActive(x.active); setMsg(null); window.scrollTo?.(0, 0) }
  function pickRarity(r) { setRarity(r) }

  const canSave = !busy && !nameErr && !urlErr && !priceErr && (locked || probe.s === 'ok' || !!file) && (editId || impCount < 500)

  async function save() {
    setMsg(null)
    const err = nameErr || urlErr || priceErr || (!locked && !file && probe.s !== 'ok' ? 'Gambar belum lolos pemeriksaan' : '')
    if (err) return setMsg({ text: err })
    const nm = name.replace(/\s+/g, ' ').trim()
    const shownPrice = editId ? Number(price) : Number(autoPrice)
    if (!window.confirm(`${editId ? 'Simpan perubahan' : 'Impor'} "${nm}" (${BD_RARITY[rarity][0]}) seharga ${fmtNum(shownPrice)} WakuGold${editId ? '' : ' (harga otomatis rarity)'}?${editId ? '' : file ? `\nGIF akan diunggah ke ${BORDER_ROOT}/${rarity}/ lalu langsung muncul di Shop untuk semua pemain.` : '\nBorder langsung muncul di Shop untuk semua pemain.'}`)) return
    setBusy(true)
    let up = null
    try {
      if (locked) await devBorderSave(editId, price, active)
      else if (editId) { await devBorderUpdate({ id: editId, name: nm, rarity, url: url.trim(), price, active }); if (editing?.image_url && editing.image_url !== url.trim()) removeBorderGif(editing.image_url) }
      else if (file) {
        setStage(`1/2 Mengunggah GIF ke GitHub (${BORDER_ROOT}/${rarity}/)… biasanya 3–15 detik`)
        up = await uploadBorderGif(file, { rarity, name: nm })
        setStage('2/2 Menyimpan data border ke database…')
        await devBorderImport({ name: nm, rarity, url: up.url, path: up.path })
        up = { ...up, done: true }
      }
      else await devBorderImport({ name: nm, rarity, url: url.trim() })
      setMsg({ ok: true, text: editId ? 'Border diperbarui' : `Berhasil: "${nm}" (${BD_RARITY[rarity][0]}, ${fmtNum(shownPrice)} Gold) sudah ada di Shop.${up?.path ? ` File: ${up.path}` : ''}` })
      reset(); await load()
    } catch (er) {
      // Gagal menyimpan setelah GIF terunggah -> hapus file supaya tidak ada sisa yatim di GitHub
      let note = ''
      if (up && !up.done) { const ok = await removeBorderGif(up.url); note = ok ? ' (GIF yang sudah terunggah dibatalkan.)' : ` (Perhatian: GIF sempat terunggah di ${up.path}. Hapus manual di GitHub, atau jalankan Sinkronisasi untuk mendaftarkannya.)` }
      setMsg({ text: er.message + note })
    }
    setStage(''); setBusy(false)
  }
  async function toggle(x) {
    setBusy(true); setMsg(null)
    try {
      if (/^u/.test(x.id)) await devBorderUpdate({ id: x.id, name: x.name, rarity: x.rarity, url: x.image_url, price: x.price, active: !x.active })
      else await devBorderSave(x.id, x.price, !x.active)
      await load()
    } catch (er) { setMsg({ text: er.message }) }
    setBusy(false)
  }
  const [delAsk, setDelAsk] = useState(null)
  async function doDelete() {
    const x = delAsk
    if (!x || busy) return
    setBusy(true); setMsg(null)
    try {
      const r = await devBorderDelete(x.id)
      const clean = await removeBorderGif(x.image_url)
      if (editId === x.id) reset()
      setMsg({ ok: true, text: `"${x.name}" dihapus dari database${r?.owners ? `, ${r.owners} pemilik dapat WakuGold kembali (${fmtNum(Number(r.refunded))})` : ''}${clean ? ' dan filenya dibersihkan.' : '. Tapi file GIF di storage gagal dihapus, hapus manual dari repository GitHub border (folder borders) atau Supabase > Storage > avatar-border.'}` })
      await load()
    } catch (er) { setMsg({ text: er.message }) }
    setDelAsk(null); setBusy(false)
  }
  function del(x) { setDelAsk(x) }

  const shown = list.filter((b) => filter === 'all' || (filter === 'imp' ? /^u/.test(b.id) : /^b/.test(b.id)))
  const previewUrl = file && localUrl ? localUrl : !locked && probe.s === 'ok' ? url.trim() : locked ? editing?.image_url || null : null

  return (
    <div className="gwd">
      <h3>{editId ? (locked ? 'Ubah harga border bawaan' : 'Ubah Avatar Border') : 'Impor Avatar Border'}</h3>
      <label>Nama Avatar Border</label>
      <input className="dv-input" value={name} maxLength={40} disabled={locked} placeholder="Contoh: Sakura Neon" onChange={(e) => setName(e.target.value)} />
      {name && nameErr && <p className="dv-err">{nameErr}</p>}

      <label>Rarity</label>
      <div className="gwd-rar">
        {BD_ORDER.slice().reverse().map((r) => (
          <button key={r} disabled={locked || lockRarity} className={`${rarity === r ? 'on' : ''} r-${r}`} onClick={() => pickRarity(r)}>{BD_RARITY[r][0]}</button>
        ))}
      </div>
      {lockRarity && <p className="gwd-hint">Rarity dikunci karena border ini sudah dibeli {editing.owners} orang.</p>}

      <label>Link .gif (opsional, tidak diunggah, hanya disimpan linknya)</label>
      <input className="dv-input" value={url} maxLength={500} disabled={locked} placeholder="https://.../border.gif" inputMode="url" autoCapitalize="none" autoCorrect="off" onChange={(e) => { clearFile(); setUrl(e.target.value.trim()) }} />
      {url && !file && urlErr && <p className="dv-err">{urlErr}</p>}
      {busy && stage && <p className="gwd-hint">{stage}</p>}
      {!locked && (file || probe.s !== 'idle') && <p className={probe.s === 'ok' ? 'dv-ok' : probe.s === 'bad' ? 'dv-err' : 'gwd-hint'}>{probe.text}</p>}
      <input ref={fileRef} type="file" accept="image/gif" hidden onChange={pickFile} />
      {!locked && <button className="gwd-imp" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Memproses…' : file ? `Ganti file (${file.name})` : 'Pilih GIF dari HP (di bawah 10 MB)'}</button>}
      <p className="gwd-hint">Pilih salah satu: tempel link .gif, atau pilih file GIF dari HP (wajib di bawah 10 MB). Saat Impor ditekan, GIF otomatis diunggah ke folder GitHub sesuai rarity (mis. Border/epic/nama-border.gif) tanpa dikompres, jadi animasi dan transparansi tetap utuh. Syarat gambar: persegi 1:1 (96 sampai 1024 px), latar transparan, lubang avatar di tengah (±83% lebar). Link tidak boleh sama dengan border lain.</p>

      {editId ? (<>
        <label>Harga (WakuGold)</label>
        <input className="dv-input" value={price} inputMode="numeric" placeholder={tier ? String(tier[0]) : '1000'} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, String(MAX_PRICE).length))} />
        {tier && <p className="gwd-hint">Rentang {BD_RARITY[rarity][0]}: <b>{fmtNum(tier[0])} - {fmtNum(tier[1])}</b>. Harga rarity saat ini: <b>{fmtNum(autoPrice)}</b></p>}
        {price && priceErr && <p className="dv-err">{priceErr}</p>}
      </>) : (
        <p className="gwd-hint">Harga otomatis sesuai rarity {BD_RARITY[rarity][0]}: <b>{fmtNum(autoPrice)} WakuGold</b> (diatur di bagian Harga rarity di bawah).</p>
      )}

      {(previewUrl) && (
        <div className="bdt-prev">
          <BorderFrame id="preview" src={previewUrl} size={96}><Avatar user={user} size={96} plain /></BorderFrame>
          <BorderFrame id="preview" src={previewUrl} size={44}><Avatar user={user} size={44} plain /></BorderFrame>
        </div>
      )}
      {editId && <label className="gwd-chk"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif (tampil di Shop)</label>}
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
      <div className="dv-btns">
        {editId && <Button variant="secondary" onClick={reset}>Batal</Button>}
        <Button onClick={save} disabled={!canSave}>{busy ? 'Memproses…' : editId ? 'Simpan perubahan' : 'Impor'}</Button>
      </div>

      <BorderSyncCard data={data} onDone={load} />
      <BorderPriceCard data={data} onDone={load} />

      <h3 style={{ marginTop: 22 }}>Daftar border ({impCount}/500 impor)</h3>
      <div className="gwd-rar" style={{ marginBottom: 8 }}>
        {[['imp', 'Impor'], ['std', 'Bawaan'], ['all', 'Semua']].map(([k, l]) => <button key={k} className={`${filter === k ? 'on' : ''} r-basic`} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {data && shown.length === 0 && <p className="gwd-hint">Belum ada border di daftar ini.</p>}
      {shown.map((x) => {
        const imp = /^u/.test(x.id)
        return (
          <div key={x.id} className={`gwd-row r-${x.rarity} ${x.active ? '' : 'off'}`}>
            {imp ? <img className="bdt-th" src={x.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="bdt-th bdt-std">SVG</div>}
            <div className="gwd-info" onClick={() => edit(x)}>
              <b>{x.name}</b>
              <span>{BD_RARITY[x.rarity][0]} · {fmtNum(x.price)} Gold</span>
              <span>{x.owners} pemilik · {imp ? (x.origin === 'github' ? 'GitHub (sinkron)' : x.origin === 'panel' ? 'panel' : 'impor') : 'bawaan'}{x.price_auto ? ' · harga otomatis' : ''}{x.active ? '' : ' · nonaktif'}{x.missing ? ' · FILE HILANG di GitHub' : ''}</span>
            </div>
            <div className="gwd-act">
              <button disabled={busy} onClick={() => toggle(x)}>{x.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              {imp && <button disabled={busy} className="del" onClick={() => del(x)}>Hapus</button>}
            </div>
          </div>
        )
      })}
      {delAsk && (
        <div className="bdt-pop-bg" onClick={() => !busy && setDelAsk(null)}>
          <div className="bdt-pop" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Wop!!,</h3>
            <p>Setuju menghapus <b>{delAsk.name}</b>?</p>
            <p className="bdt-pop-sub">Dihapus permanen dari database beserta file GIF-nya.{delAsk.owners > 0 ? ` ${delAsk.owners} pemilik akan dapat WakuGold kembali sesuai harga yang mereka bayar.` : ''}</p>
            <div className="bdt-pop-row">
              <button className="yes" disabled={busy} onClick={doDelete}>{busy ? 'Menghapus…' : 'Ya'}</button>
              <button disabled={busy} onClick={() => setDelAsk(null)}>Tidak</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UpdateTab() {
  const [version, setVersion] = useState('')
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [active, setActive] = useState(null)

  const loadActive = useCallback(async () => {
    const { data } = await supabase.rpc('get_app_update')
    const row = Array.isArray(data) ? data[0] : data
    setActive(row || false)
  }, [])
  useEffect(() => { loadActive() }, [loadActive])

  function fillFromActive() {
    if (!active) return
    setVersion(active.latest_version); setMessage(active.message); setUrl(active.download_url); setForce(!!active.force_update)
  }

  async function publish() {
    setMsg(null)
    if (!/^\d+(\.\d+){0,3}$/.test(version.trim())) return setMsg({ text: 'Versi harus berupa angka, contoh: 1.1' })
    if (!message.trim()) return setMsg({ text: 'Teks pemberitahuan wajib diisi' })
    if (!/^https?:\/\/\S+$/i.test(url.trim())) return setMsg({ text: 'Link harus diawali http:// atau https://' })
    setBusy(true)
    const { error } = await supabase.rpc('dev_publish_update', { p_version: version.trim(), p_message: message.trim(), p_url: url.trim(), p_force: force })
    setBusy(false)
    if (error) return setMsg({ text: error.message || 'Gagal mengirim' })
    setMsg({ ok: true, text: `Pemberitahuan update ${fmtVer(version.trim())} aktif. Member yang versinya di bawah itu akan melihat popup.` })
    loadActive()
  }

  async function disable() {
    if (!window.confirm('Matikan pemberitahuan update yang aktif?')) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('dev_disable_update')
    setBusy(false)
    if (error) return setMsg({ text: error.message || 'Gagal mematikan' })
    setMsg({ ok: true, text: 'Pemberitahuan update dimatikan.' })
    loadActive()
  }

  return (
    <div className="dv-banner">
      <p className="muted small">Versi aplikasi ini: <b>{fmtVer(APP_VERSION)}</b>. Popup hanya muncul di aplikasi yang versinya LEBIH LAMA dari versi terbaru di bawah.</p>

      <label className="dv-lab">Versi terbaru</label>
      <input className="dv-input" value={version} inputMode="decimal" placeholder="Contoh: 1.1" onChange={(e) => setVersion(e.target.value.replace(/[^\d.]/g, '').slice(0, 20))} />

      <label className="dv-lab">Teks pemberitahuan</label>
      <AutoTextarea className="dv-input dv-ta" value={message} maxLength={600} placeholder="Contoh: Versi 1.1 sudah rilis! Ada fitur teman, chat pribadi, dan perbaikan bug." onChange={(e) => setMessage(e.target.value)} />
      <p className="dv-cnt">{message.length}/600</p>

      <label className="dv-lab">Link download</label>
      <input className="dv-input" value={url} inputMode="url" autoCapitalize="none" placeholder="https://..." onChange={(e) => setUrl(e.target.value)} />

      <div className="dv-row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
        <div><b>Wajib update</b><p className="muted small">Popup tidak bisa ditutup</p></div>
        <button className={`dv-switch ${force ? 'on' : ''}`} onClick={() => setForce((v) => !v)} aria-pressed={force} aria-label="Wajib update"><i /><span>{force ? 'ON' : 'OFF'}</span></button>
      </div>

      <p className="dv-lab soft">Pratinjau (seperti yang dilihat member)</p>
      <UpdateCard preview version={version.trim()} current="1.0" message={message.trim()} />

      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}
      <button className="dv-send" disabled={busy} onClick={publish}><Icon name="send" size={22} />{busy ? 'Mengirim…' : 'Kirim pemberitahuan update'}</button>
      <div className="dv-activebox">
        <p className="muted small">{active === null ? 'Memeriksa pemberitahuan aktif…' : active ? `Aktif: versi ${fmtVer(active.latest_version)}${active.force_update ? ' (wajib)' : ''}` : 'Tidak ada pemberitahuan update aktif.'}</p>
        {active && <div className="dv-btns" style={{ justifyContent: 'flex-start' }}><button className="dv-chip" onClick={fillFromActive}>Edit yang aktif</button><button className="dv-chip" style={{ color: '#ff7a85' }} disabled={busy} onClick={disable}>Matikan</button></div>}
      </div>
      <p className="muted small dv-note">Cara rilis: naikkan "version" di package.json (mis. 1.1.0), jalankan update.sh, bagikan APK-nya, lalu isi form ini dengan versi yang sama dan link download APK. Member yang masih 1.0 akan melihat popup ini.</p>
    </div>
  )
}

const ID_RE = /^[A-Za-z0-9_:.-]{1,120}$/
const LINK_RE = /^https:\/\/[^\s"'<>]{4,590}$/
function parseLines(text, kind) {
  const rows = [], errs = []
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    const m = line.match(/^(\d+(?:\.\d+)?)[\s=,]+(\S+)\s*$/)
    if (!m) return errs.push(`Baris ${i + 1}: tulis "nomor spasi ${kind === 'api' ? 'id-episode' : 'link'}"`)
    let ref = m[2]
    if (kind === 'api') { const u = ref.match(/\/episode\/([^/?#]+)/); if (u) ref = decodeURIComponent(u[1]) }
    const n = Number(m[1])
    if (!(n > 0 && n <= 99999)) return errs.push(`Baris ${i + 1}: nomor 1 sampai 99999`)
    if (kind === 'api' ? !ID_RE.test(ref) : !LINK_RE.test(ref)) return errs.push(`Baris ${i + 1}: ${kind === 'api' ? 'ID episode tidak valid' : 'link harus diawali https:// tanpa spasi'}`)
    rows.push({ number: n, kind, ref, title: '' })
  })
  const seen = new Set()
  rows.forEach((r) => { if (seen.has(r.number)) errs.push(`Nomor ${r.number} muncul dobel`); seen.add(r.number) })
  if (rows.length > 600) errs.push('Maksimal 600 baris sekali simpan')
  return { rows, errs }
}

function AnimePicker({ label, picked, onPick }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go() {
    const t = q.trim()
    if (!t) return
    setBusy(true); setErr(''); setRes(null)
    try { const r = await animeApi.search({ q: t }); setRes((r.items || []).slice(0, 8)) } catch { setErr('Gagal mencari. Periksa koneksi lalu coba lagi.') }
    setBusy(false)
  }
  return (
    <>
      <label className="dv-lab">{label}</label>
      {picked && <p className="dv-gold" style={{ fontSize: 15 }}><b style={{ fontSize: 17 }}>{picked.title}</b> <span className="dv-mono muted small">id: {picked.id}</span></p>}
      <div className="dv-row">
        <input className="dv-input" style={{ flex: 1 }} value={q} placeholder="Ketik judul anime" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <button className="dv-go" disabled={busy || !q.trim()} onClick={go}>{busy ? '…' : 'Cari'}</button>
      </div>
      {err && <p className="dv-err">{err}</p>}
      {res && !res.length && <p className="muted small">Tidak ada hasil.</p>}
      {res && res.map((a) => (
        <button key={a.id} className="dv-chip" style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 8, borderRadius: 14 }} onClick={() => { onPick(a); setRes(null); setQ('') }}>
          {a.title} <span className="dv-mono muted small">#{String(a.id).slice(0, 14)}</span>
        </button>
      ))}
    </>
  )
}

function UploadAnimeTab() {
  const [target, setTarget] = useState(null)
  const [eps, setEps] = useState(null)
  const [saved, setSaved] = useState([])
  const [mode, setMode] = useState('api')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [source, setSource] = useState(null)
  const [seps, setSeps] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [start, setStart] = useState('')
  const [text, setText] = useState('')
  const [tpl, setTpl] = useState('')
  const [tf, setTf] = useState('')
  const [tt, setTt] = useState('')
  const [notify, setNotify] = useState(true)
  const [notifyAll, setNotifyAll] = useState(true)
  const tok = useRef(0)

  const reload = useCallback(async (a) => {
    const my = ++tok.current
    setEps(null)
    try {
      const [list, extra] = await Promise.all([animeApi.episodes(a.id).catch(() => []), devExtraList(a.id).catch(() => [])])
      if (my !== tok.current) return
      setEps(list); setSaved(extra)
    } catch { if (my === tok.current) setEps([]) }
  }, [])
  function pickTarget(a) { setTarget(a); setMsg(null); reload(a) }
  async function pickSource(a) {
    setSource(a); setSeps(null); setFrom(''); setTo(''); setStart('')
    try {
      const list = await animeApi.episodes(a.id)
      setSeps(list)
      const nums = list.map((e) => Number(e.number)).filter(Number.isFinite)
      if (nums.length) { const lo = Math.min(...nums), hi = Math.max(...nums); setFrom(String(lo)); setTo(String(hi)); setStart(String(lo)) }
    } catch { setSeps([]) }
  }

  const nums = (eps || []).map((e) => Number(e.number)).filter(Number.isFinite)
  const have = new Set(nums)
  const missing = []
  if (nums.length) { const hi = Math.min(Math.max(...nums), 5000); for (let i = 1; i <= hi; i++) if (!have.has(i)) missing.push(i) }
  const extraNums = new Set(saved.map((r) => Number(r.number)))

  let rows = [], errs = []
  if (mode === 'api') {
    const a = Number(from), b = Number(to), st = Number(start || from)
    if (seps && a > 0 && b >= a && st > 0) {
      rows = seps.filter((e) => Number(e.number) >= a && Number(e.number) <= b && !isExtraId(e.id)).map((e) => ({ number: st + (Number(e.number) - a), kind: 'api', ref: String(e.id), title: '' }))
      if (rows.some((r) => r.number > 99999)) { errs = ['Nomor tujuan terlalu besar']; rows = [] }
      if (rows.some((r) => !ID_RE.test(r.ref))) { errs = ['Ada ID episode sumber yang tidak valid']; rows = [] }
    }
  } else {
    const p = parseLines(text, mode === 'id' ? 'api' : 'link')
    rows = p.rows; errs = p.errs
  }
  const overwrite = rows.filter((r) => have.has(r.number) && !extraNums.has(r.number)).length

  function fillTemplate() {
    const a = Number(tf), b = Number(tt)
    if (!tpl.includes('{n}')) return setMsg({ text: 'Template harus memuat {n} (diganti nomor episode)' })
    if (!(a > 0 && b >= a && b - a < 200)) return setMsg({ text: 'Isi nomor dari/sampai (maksimal 200 episode)' })
    setMsg(null)
    setText(Array.from({ length: b - a + 1 }, (_, i) => `${a + i} ${tpl.replace(/\{n\}/g, String(a + i))}`).join('\n'))
  }
  async function save() {
    if (!target || busy || !rows.length || errs.length) return
    if (!window.confirm(`Simpan ${rows.length} episode ke "${target.title}"?${overwrite ? `\n${overwrite} nomor yang sudah ada akan DIGANTI.` : ''}`)) return
    setBusy(true); setMsg(null)
    try {
      let n = 0
      for (let i = 0; i < rows.length; i += 200) n += await devExtraSave(target.id, rows.slice(i, i + 200), { title: target.title, poster: target.poster, notify, all: notifyAll, batch: i > 0 })
      const info = lastExtraSave()
      let nt = ''
      if (notify) {
        if (info.isNew === false) nt = ' Tidak ada notifikasi: semua nomor ini sudah pernah ada (hanya menggantikan episode).'
        else if (info.notified != null) nt = ` Notifikasi episode ${info.newest ?? 'baru'} dikirim ke ${info.notified} pengguna${notifyAll ? ' (semua pengguna)' : ' (yang memfavoritkan / menonton anime ini + kamu)'}.`
        else nt = ' Notifikasi episode baru dikirim ke pengguna yang memfavoritkan / menonton anime ini (hanya kalau ada nomor episode BARU).'
      }
      setMsg({ ok: true, text: `Tersimpan ${n} episode. Langsung muncul di halaman anime (maks. 1 menit untuk user lain).${nt}` })
      setText('')
      await reload(target)
    } catch (e) { setMsg({ text: e.message || 'Gagal menyimpan' }) }
    setBusy(false)
  }
  async function del(r) {
    if (busy || !window.confirm(`Hapus episode tambahan ${r.number}?`)) return
    setBusy(true); setMsg(null)
    try { await devExtraDelete(r.id, target.id); await reload(target) } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  async function clearAll() {
    if (busy || !saved.length || !window.confirm(`Hapus SEMUA ${saved.length} episode tambahan untuk "${target.title}"?`)) return
    setBusy(true); setMsg(null)
    try { await devExtraClear(target.id); await reload(target) } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }

  return (
    <div className="dv-banner">
      <details className="bk-card" style={{ marginTop: 0 }} open>
        <summary style={{ fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>Cara pakai (baca dulu)</summary>
        <div className="muted small" style={{ lineHeight: 1.6, marginTop: 10 }}>
          <p><b>Intinya:</b> tidak ada file video yang diunggah. Kamu hanya menyimpan <i>petunjuk</i> episode (ID episode API atau link stream). Episode yang kosong atau rusak akan terisi di halaman anime semua user.</p>
          <p><b>1.</b> Cari anime tujuan (contoh: Jujutsu Kaisen, Beelzebub). Panel menampilkan nomor episode yang kosong.</p>
          <p><b>2.</b> Pilih cara menambah:</p>
          <p>• <b>Salin dari anime lain</b> (paling mudah): kadang API punya 2 entri untuk anime yang sama. Cari entri lain yang episodenya lengkap, pilih rentang nomor sumber, lalu tentukan nomor tujuan. Contoh Beelzebub 1–30: sumber 1 sampai 30, tujuan mulai 1.</p>
          <p>• <b>ID episode API</b>: buka di browser HP alamat API anime milikmu diikuti <span className="dv-mono">/anime/ID_ANIME/episodes</span> (alamat API sengaja tidak ditulis di aplikasi; catatannya ada di PANDUAN-UPLOAD-ANIME.md), cari "id" tiap episode, lalu tulis satu baris per episode: <span className="dv-mono">7 id-episode-nya</span>. Contoh Jujutsu Kaisen ep 7. Link API episode utuh juga boleh ditempel.</p>
          <p>• <b>Link stream</b>: kalau episode tidak ada sama sekali di API. Tulis <span className="dv-mono">7 https://…/video.m3u8</span> per baris, atau isi template dengan <span className="dv-mono">{'{n}'}</span> lalu tekan "Isi otomatis" untuk rentang nomor.</p>
          <p><b>3.</b> Tekan Simpan. Nomor yang sama <b>menggantikan</b> episode dari API (untuk memperbaiki episode rusak). Hapus kapan saja dengan tombol ✕.</p>
          <p><b>Syarat sekali saja:</b> jalankan <span className="dv-mono">supabase/anime-tambahan.sql</span> di SQL Editor Supabase.</p>
        </div>
      </details>

      <AnimePicker label="1. Anime tujuan" picked={target} onPick={pickTarget} />

      {target && (
        <div className="bk-card">
          {!eps ? <p className="muted small">Memuat daftar episode…</p> : (
            <p className="small" style={{ lineHeight: 1.5 }}>
              Sekarang ada <b>{eps.length}</b> episode{nums.length ? ` (nomor ${Math.min(...nums)}–${Math.max(...nums)})` : ''}.{' '}
              {missing.length ? <span style={{ color: '#ffb347' }}>Nomor kosong: <b>{missing.slice(0, 40).join(', ')}{missing.length > 40 ? ` … (+${missing.length - 40})` : ''}</b></span> : nums.length ? <span style={{ color: '#6df0a4' }}>Tidak ada nomor yang loncat.</span> : ''}
            </p>
          )}

          <label className="dv-lab">2. Cara menambah</label>
          <div className="dv-chips">
            <button className={`dv-chip ${mode === 'api' ? 'on' : ''}`} onClick={() => setMode('api')}>Salin dari anime lain</button>
            <button className={`dv-chip ${mode === 'id' ? 'on' : ''}`} onClick={() => setMode('id')}>ID episode API</button>
            <button className={`dv-chip ${mode === 'link' ? 'on' : ''}`} onClick={() => setMode('link')}>Link stream</button>
          </div>

          {mode === 'api' && (
            <>
              <AnimePicker label="Anime sumber (yang episodenya ada)" picked={source} onPick={pickSource} />
              {source && !seps && <p className="muted small">Memuat episode sumber…</p>}
              {source && seps && !seps.length && <p className="dv-err">Anime sumber tidak punya episode.</p>}
              {source && seps && seps.length > 0 && (
                <>
                  <div className="dv-row" style={{ marginTop: 12 }}>
                    <div style={{ flex: 1 }}><label className="dv-lab soft">Sumber dari no.</label><input className="dv-input" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} /></div>
                    <div style={{ flex: 1 }}><label className="dv-lab soft">sampai no.</label><input className="dv-input" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} /></div>
                    <div style={{ flex: 1 }}><label className="dv-lab soft">Tujuan mulai no.</label><input className="dv-input" inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} /></div>
                  </div>
                  <p className="muted small" style={{ marginTop: 8 }}>{rows.length ? `Sumber ${from}–${to} (${rows.length} episode) → tujuan ${rows[0].number}–${rows[rows.length - 1].number}` : 'Isi rentang nomor yang valid.'}</p>
                </>
              )}
            </>
          )}

          {mode === 'link' && (
            <>
              <label className="dv-lab soft">Template link (opsional), tulis {'{n}'} di tempat nomor</label>
              <input className="dv-input" value={tpl} placeholder="https://situs.com/beelzebub/ep-{n}/index.m3u8" onChange={(e) => setTpl(e.target.value)} />
              <div className="dv-row" style={{ marginTop: 8 }}>
                <input className="dv-input" style={{ flex: 1 }} inputMode="numeric" placeholder="dari no." value={tf} onChange={(e) => setTf(e.target.value.replace(/\D/g, '').slice(0, 5))} />
                <input className="dv-input" style={{ flex: 1 }} inputMode="numeric" placeholder="sampai no." value={tt} onChange={(e) => setTt(e.target.value.replace(/\D/g, '').slice(0, 5))} />
                <button className="dv-go" onClick={fillTemplate}>Isi otomatis</button>
              </div>
            </>
          )}

          {mode !== 'api' && (
            <>
              <label className="dv-lab soft">{mode === 'id' ? 'Satu baris per episode: nomor, spasi, ID episode API' : 'Satu baris per episode: nomor, spasi, link https'}</label>
              <textarea className="dv-input dv-mono" style={{ height: 150, padding: 12, lineHeight: 1.5, resize: 'vertical' }} value={text} spellCheck={false}
                placeholder={mode === 'id' ? '7 abc123\n8 def456' : '7 https://contoh.com/ep7.m3u8\n8 https://contoh.com/ep8.m3u8'} onChange={(e) => setText(e.target.value)} />
              {rows.length > 0 && !errs.length && <p className="muted small">{rows.length} episode siap disimpan (nomor {rows[0].number}–{rows[rows.length - 1].number}).</p>}
            </>
          )}
          {errs.length > 0 && <p className="dv-err" style={{ whiteSpace: 'pre-line' }}>{errs.slice(0, 6).join('\n')}{errs.length > 6 ? `\n… +${errs.length - 6} lagi` : ''}</p>}
          {overwrite > 0 && !errs.length && <p className="small" style={{ color: '#ffb347' }}>{overwrite} nomor sudah ada dan akan digantikan.</p>}

          <label className="dv-row" style={{ marginTop: 14, gap: 10, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: 20, height: 20 }} />
            <span>Kirim notifikasi episode baru (satu notifikasi untuk nomor baru tertinggi)</span>
          </label>
          {notify && (
            <label className="dv-row" style={{ marginTop: 8, gap: 10, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={notifyAll} onChange={(e) => setNotifyAll(e.target.checked)} style={{ width: 20, height: 20 }} />
              <span>Kirim ke SEMUA pengguna (bukan hanya yang memfavoritkan / menonton anime ini)</span>
            </label>
          )}
          <button className="dv-send" disabled={busy || !rows.length || !!errs.length} onClick={save}><Icon name="check" size={22} />{busy ? 'Menyimpan…' : `Simpan ${rows.length || ''} episode`}</button>
          {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}

          <label className="dv-lab">Episode tambahan tersimpan ({saved.length})</label>
          {!saved.length && <p className="muted small">Belum ada.</p>}
          {saved.map((r) => (
            <div key={r.id} className="dv-row" style={{ alignItems: 'center', marginTop: 6 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
                <b>Ep {r.number}</b> · {r.kind === 'api' ? 'API' : 'Link'} · <span className="dv-mono muted">{r.ref}</span>
              </span>
              <button className="dv-chip" disabled={busy} onClick={() => del(r)} aria-label={`Hapus episode ${r.number}`}>✕</button>
            </div>
          ))}
          {saved.length > 1 && <button className="dv-ban" disabled={busy} onClick={clearAll}>Hapus semua tambahan anime ini</button>}
        </div>
      )}
    </div>
  )
}

const POSTER_RE = /^https:\/\/[^\s"'<>]{4,560}\.(jpe?g|png|webp|gif|avif)(\?[^\s"'<>]{0,30})?$/i
const TITLE_BAD = /[\u0000-\u001f<>]/
const NA_TYPES = ['TV', 'Movie', 'OVA', 'ONA', 'Special']
const NA_STATUS = ['Ongoing', 'Completed', 'Upcoming']
const normT = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const EMPTY_NA = { id: null, title: '', poster: '', synopsis: '', genres: [], status: 'Ongoing', type: 'TV' }

function NewAnimeTab() {
  const [f, setF] = useState(EMPTY_NA)
  const [list, setList] = useState(null)
  const [gen, setGen] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [badImg, setBadImg] = useState(false)
  const [gIn, setGIn] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const reload = useCallback(async () => { try { setList(await devAnimeList()) } catch (e) { setList([]); setMsg({ text: e.message || 'Gagal memuat daftar' }) } }, [])
  useEffect(() => { reload(); animeApi.genres().then((g) => setGen((g || []).map((x) => String(x.name)).filter((n) => /^[A-Za-z0-9 &./+-]{2,30}$/.test(n)))).catch(() => {}) }, [reload])
  useEffect(() => { setBadImg(false) }, [f.poster])

  const title = f.title.replace(/\s+/g, ' ').trim()
  const syn = f.synopsis.trim()
  const errs = []
  if (title.length < 2 || title.length > 120) errs.push('Judul harus 2 sampai 120 huruf')
  else if (TITLE_BAD.test(title)) errs.push('Judul tidak boleh memuat karakter < >')
  if (!POSTER_RE.test(f.poster.trim())) errs.push('Poster harus link https langsung ke gambar (.jpg .png .webp .gif .avif)')
  if (syn.length < 30 || syn.length > 2000) errs.push(`Sinopsis harus 30 sampai 2000 huruf (sekarang ${syn.length})`)
  else if (/<[A-Za-z/!]/.test(syn)) errs.push('Sinopsis tidak boleh memuat tag HTML')
  if (f.genres.length < 1 || f.genres.length > 5) errs.push('Pilih 1 sampai 5 genre')

  async function save() {
    if (busy || errs.length) return
    setBusy(true); setMsg(null)
    try {
      if (!f.id) {
        const mine = (list || []).some((a) => normT(a.title) === normT(title))
        if (mine) throw new Error('Judul ini sudah ada di daftar anime buatan')
        const r = await animeApi.search({ q: title }).catch(() => ({ items: [] }))
        const hit = (r.items || []).find((a) => !isCustomId(String(a.id)) && normT(a.title) === normT(title))
        if (hit) throw new Error(`"${hit.title}" sudah ada di API. Pakai tab Upload Anime kalau hanya mau memperbaiki episodenya.`)
      }
      if (!window.confirm(f.id ? `Simpan perubahan "${title}"?` : `Tambahkan anime baru "${title}"?\n\nSemua pengguna akan langsung menerima notifikasi anime baru.`)) { setBusy(false); return }
      await devAnimeSave({ ...f, title, poster: f.poster.trim(), synopsis: syn })
      setMsg({ ok: true, text: f.id ? 'Perubahan tersimpan.' : 'Anime baru tersimpan dan notifikasi dikirim ke semua pengguna. Sekarang tambahkan episodenya di tab Upload Anime (cari judulnya, pilih "Link stream").' })
      setF(EMPTY_NA)
      await reload()
    } catch (e) { setMsg({ text: e.message || 'Gagal menyimpan' }) }
    setBusy(false)
  }
  async function del(a) {
    if (busy || !window.confirm(`Hapus "${a.title}"?\nEpisode tambahan dan notifikasinya ikut terhapus.`)) return
    setBusy(true); setMsg(null)
    try { await devAnimeDelete(a.id); if (f.id === a.id) setF(EMPTY_NA); await reload() } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  const toggleGenre = (g) => setF((p) => ({ ...p, genres: p.genres.includes(g) ? p.genres.filter((x) => x !== g) : p.genres.length >= 5 ? p.genres : [...p.genres, g] }))
  const shownGenres = [...new Set([...f.genres, ...gen])]
  const gClean = gIn.replace(/\s+/g, ' ').trim()
  const gOk = /^[A-Za-z0-9 &./+-]{2,30}$/.test(gClean) && !f.genres.some((x) => x.toLowerCase() === gClean.toLowerCase()) && f.genres.length < 5
  function addGenre() {
    if (!gOk) return
    const known = gen.find((x) => x.toLowerCase() === gClean.toLowerCase())
    setF((p) => ({ ...p, genres: [...p.genres, known || gClean] })); setGIn('')
  }

  return (
    <div className="dv-banner">
      <details className="bk-card" style={{ marginTop: 0 }}>
        <summary style={{ fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>Aturan & cara pakai</summary>
        <div className="muted small" style={{ lineHeight: 1.6, marginTop: 10 }}>
          <p>• Untuk anime yang <b>belum ada sama sekali</b> di API. Kalau animenya sudah ada tapi episodenya kosong/rusak, pakai tab Upload Anime.</p>
          <p>• Judul 2–120 huruf, tidak boleh kembar (dengan anime buatan lain maupun judul yang sama persis di API), tanpa tanda &lt; &gt;.</p>
          <p>• Poster: link https langsung ke gambar (.jpg .png .webp .gif .avif).</p>
          <p>• Sinopsis 30–2000 huruf, tanpa tag HTML. Genre 1–5. Maksimal 500 anime buatan.</p>
          <p>• Tiap anime baru yang disimpan <b>otomatis mengirim notifikasi</b> ke semua pengguna. Mengubah anime tidak mengirim notifikasi.</p>
          <p>• Setelah disimpan, tambahkan episodenya di tab Upload Anime (Link stream). Episode baru juga otomatis memberi notifikasi.</p>
          <p><b>Syarat sekali saja:</b> jalankan <span className="dv-mono">supabase/anime-baru-notif.sql</span> di SQL Editor Supabase.</p>
        </div>
      </details>

      <label className="dv-lab">{f.id ? 'Ubah anime' : 'Anime baru'}</label>
      <label className="dv-lab soft">Judul</label>
      <input className="dv-input" style={{ width: '100%' }} value={f.title} maxLength={120} placeholder="Contoh: Nama Anime Season 1" onChange={(e) => set('title', e.target.value)} />

      <label className="dv-lab soft">Link poster (https, langsung ke gambar)</label>
      <input className="dv-input dv-mono" style={{ width: '100%' }} value={f.poster} spellCheck={false} autoCapitalize="none" placeholder="https://…/poster.jpg" onChange={(e) => set('poster', e.target.value)} />
      {POSTER_RE.test(f.poster.trim()) && (badImg
        ? <p className="dv-err">Gambar tidak bisa dimuat. Cek linknya.</p>
        : <img src={f.poster.trim()} alt="" decoding="async" onError={() => setBadImg(true)} style={{ marginTop: 10, width: 110, height: 150, objectFit: 'cover', borderRadius: 12, background: '#222' }} />)}

      <label className="dv-lab soft">Sinopsis ({syn.length}/2000)</label>
      <textarea className="dv-input" style={{ width: '100%', height: 130, padding: 12, lineHeight: 1.5, resize: 'vertical' }} value={f.synopsis} maxLength={2000} onChange={(e) => set('synopsis', e.target.value)} />

      <label className="dv-lab soft">Genre ({f.genres.length}/5)</label>
      <div className="dv-chips">
        {shownGenres.length === 0 && <span className="muted small">Memuat daftar genre…</span>}
        {shownGenres.map((g) => <button key={g} className={`dv-chip ${f.genres.includes(g) ? 'on' : ''}`} style={f.genres.includes(g) ? { borderColor: '#2f8cff' } : null} onClick={() => toggleGenre(g)}>{g}</button>)}
      </div>

      <div className="dv-row" style={{ marginTop: 12 }}>
        <input className="dv-input" style={{ flex: 1, minWidth: 0 }} value={gIn} maxLength={30} placeholder="Tulis genre sendiri, mis. Isekai" onChange={(e) => setGIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGenre()} />
        <button className="dv-go" disabled={!gOk} onClick={addGenre}>Tambah</button>
      </div>
      {gClean && !gOk && f.genres.length < 5 && <p className="dv-err">Genre 2–30 karakter (huruf, angka, spasi, &amp; . / + -) dan belum dipilih.</p>}

      <label className="dv-lab soft">Status</label>
      <div className="dv-chips">{NA_STATUS.map((x) => <button key={x} className={`dv-chip ${f.status === x ? 'on' : ''}`} style={f.status === x ? { borderColor: '#2f8cff' } : null} onClick={() => set('status', x)}>{x}</button>)}</div>
      <label className="dv-lab soft">Tipe</label>
      <div className="dv-chips">{NA_TYPES.map((x) => <button key={x} className={`dv-chip ${f.type === x ? 'on' : ''}`} style={f.type === x ? { borderColor: '#2f8cff' } : null} onClick={() => set('type', x)}>{x}</button>)}</div>

      {errs.length > 0 && (f.title || f.poster || f.synopsis) && <p className="dv-err" style={{ whiteSpace: 'pre-line' }}>{errs.join('\n')}</p>}
      <button className="dv-send dv-send-big" disabled={busy || errs.length > 0 || badImg} onClick={save}><Icon name="check" size={26} /><span>{busy ? 'Menyimpan…' : f.id ? 'Simpan perubahan' : 'Tambah Anime'}{!busy && !f.id && <small>& kirim notifikasi ke semua pengguna</small>}</span></button>
      {f.id && <button className="dv-chip" style={{ marginTop: 10 }} onClick={() => { setF(EMPTY_NA); setMsg(null) }}>Batal ubah</button>}
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'}>{msg.text}</p>}

      <label className="dv-lab">Anime buatan ({list ? list.length : '…'})</label>
      {list && !list.length && <p className="muted small">Belum ada.</p>}
      {(list || []).map((a) => (
        <div key={a.id} className="dv-row" style={{ alignItems: 'center', marginTop: 8 }}>
          <img src={a.poster} alt="" decoding="async" style={{ width: 40, height: 54, borderRadius: 8, objectFit: 'cover', background: '#222', flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}><b>{a.title}</b><br /><span className="dv-mono muted small">{a.id}</span></span>
          <button className="dv-chip" disabled={busy} onClick={() => { setF({ id: a.id, title: a.title, poster: a.poster, synopsis: a.synopsis, genres: a.genres || [], status: a.status, type: a.type }); setMsg(null) }}>Ubah</button>
          <button className="dv-chip" disabled={busy} onClick={() => del(a)} aria-label={`Hapus ${a.title}`}>✕</button>
        </div>
      ))}
    </div>
  )
}

function DevPanelInner() {
  const { nav } = useApp()
  const [tab, setTab] = useState('table')
  return (
    <div className="dv-page">
      <div className="gc-head">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" /></button>
        <h1>Panel Developer</h1>
      </div>
      <div className="dv-tabs">
        <button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>Tabel</button>
        <button className={tab === 'banner' ? 'on' : ''} onClick={() => setTab('banner')}>Banner</button>
        <button className={tab === 'ban' ? 'on' : ''} onClick={() => setTab('ban')}>Blokir</button>
        <button className={tab === 'gold' ? 'on' : ''} onClick={() => setTab('gold')}>Gold</button>
        <button className={tab === 'clan' ? 'on' : ''} onClick={() => setTab('clan')}>Clan</button>
        <button className={tab === 'lb' ? 'on' : ''} onClick={() => setTab('lb')}>Top LB</button>
        <button className={tab === 'premium' ? 'on' : ''} onClick={() => setTab('premium')}>Premium</button>
        <button className={tab === 'gift' ? 'on' : ''} onClick={() => setTab('gift')}>Gift Premium</button>
        <button className={tab === 'gaxp' ? 'on' : ''} onClick={() => setTab('gaxp')}>XP Giveaway</button>
        <button className={tab === 'lvcfg' ? 'on' : ''} onClick={() => setTab('lvcfg')}>Level</button>
        <button className={tab === 'wlpp' ? 'on' : ''} onClick={() => setTab('wlpp')}>Wallpaper</button>
        <button className={tab === 'bdr' ? 'on' : ''} onClick={() => setTab('bdr')}>Border</button>
        <button className={tab === 'emb' ? 'on' : ''} onClick={() => setTab('emb')}>Emblem</button>
        <button className={tab === 'pet' ? 'on' : ''} onClick={() => setTab('pet')}>Pet</button>
        <button className={tab === 'newanime' ? 'on' : ''} onClick={() => setTab('newanime')}>Anime Baru</button>
        <button className={tab === 'anime' ? 'on' : ''} onClick={() => setTab('anime')}>Upload Anime</button>
        <button className={tab === 'update' ? 'on' : ''} onClick={() => setTab('update')}>Update</button>
      </div>
      {tab === 'table' ? <TableTab /> : tab === 'banner' ? <BannerTab /> : tab === 'ban' ? <BanTab /> : tab === 'gold' ? <GoldTab /> : tab === 'clan' ? <ClanTab /> : tab === 'lb' ? <LbTab /> : tab === 'premium' ? <PremiumTab /> : tab === 'gift' ? <GiftPremiumTab /> : tab === 'gaxp' ? <GiveawayXpTab /> : tab === 'lvcfg' ? <LevelCfgTab /> : tab === 'wlpp' ? <GachaTab /> : tab === 'bdr' ? <BorderTab /> : tab === 'emb' ? <EmblemTab /> : tab === 'pet' ? <PetTab /> : tab === 'newanime' ? <NewAnimeTab /> : tab === 'anime' ? <UploadAnimeTab /> : <UpdateTab />}
    </div>
  )
}
