import { useEffect, useState } from 'react'
import { Button } from './ui'
import { RARITY as BD_RARITY, RARITY_ORDER as BD_ORDER } from '../lib/borders'
import { BORDER_PRICES, BORDER_ROOT } from '../lib/borderUrl'
import { fmtNum } from '../lib/gold'
import { syncBorderGithub, devBorderPriceSet, devBorderPriceApply, cleanGithubNames } from '../services/borders'

const when = (iso) => { try { return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '-' } }

// Sinkronisasi: membaca Border/<rarity>/*.gif di GitHub (upload manual lewat website GitHub) lalu mendaftarkannya ke Shop.
export function BorderSyncCard({ data, onDone }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [res, setRes] = useState(null)
  const last = data?.sync
  const view = res || (last ? { found: last.found, new: last.new_count, registered: last.registered, failed: last.failed, missing: last.missing, ignored: last.ignored, pending: last.pending, complete: last.complete, new_list: last.report?.new, failed_list: last.report?.failed, ignored_list: last.report?.ignored_list } : null)

  async function run() {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const r = await syncBorderGithub()
      setRes(r)
      const bits = [`${r.new} border baru`, `${r.registered} sudah terdaftar`]
      if (r.failed) bits.push(`${r.failed} file gagal`)
      if (r.cleaned) bits.push(`${r.cleaned} nama file dibersihkan`)
      setMsg({ ok: !r.failed, text: `Sinkronisasi selesai: ${bits.join(', ')}.${r.pending ? ` Masih ada ${r.pending} file baru yang belum diperiksa, tekan Sinkronkan lagi.` : ''}${r.new ? ' Border baru langsung tersedia di Shop.' : ''}` })
      await onDone?.()
    } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }

  return (
    <div className="gwd" style={{ padding: 0, marginTop: 22 }}>
      <h3>Sinkronisasi Border GitHub</h3>
      <p className="gwd-hint">Upload GIF langsung lewat website GitHub ke folder <b>{BORDER_ROOT}/&lt;rarity&gt;/</b> (mis. {BORDER_ROOT}/epic/border-003.gif), lalu tekan tombol di bawah. File baru otomatis terdaftar dengan harga sesuai rarity dan langsung muncul di Shop. Aman dijalankan berulang, tidak membuat border kembar.</p>
      <Button onClick={run} disabled={busy}>{busy ? 'Menyinkronkan… (bisa sampai 1 menit)' : 'Sinkronkan dari GitHub'}</Button>
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'} style={{ marginTop: 6 }}>{msg.text}</p>}
      <CleanNames />

      {view ? (
        <div className="gwd-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, borderLeftColor: '#5aa9ff' }}>
          <span className="gwd-hint">Sinkronisasi terakhir: <b>{when(res ? new Date() : last?.run_at)}</b>{view.complete === false ? ' (folder terlalu besar, sebagian belum terbaca)' : ''}</span>
          <span>File GIF ditemukan: <b>{fmtNum(view.found)}</b></span>
          <span>Border baru: <b>{fmtNum(view.new)}</b></span>
          <span>Sudah terdaftar: <b>{fmtNum(view.registered)}</b> <span className="gwd-hint">(total dari GitHub: {fmtNum(data?.github_total || 0)})</span></span>
          <span>File gagal diproses: <b style={{ color: view.failed ? '#ff6b6b' : undefined }}>{fmtNum(view.failed)}</b></span>
          {view.missing > 0 && <span className="gwd-hint">File hilang dari GitHub: {fmtNum(view.missing)} (disembunyikan dari Shop, milik pemain tetap aman)</span>}
          {view.pending > 0 && <span className="gwd-hint">Menunggu diperiksa: {fmtNum(view.pending)}</span>}
          {view.ignored > 0 && <span className="gwd-hint">Diabaikan (bukan border): {fmtNum(view.ignored)}</span>}
        </div>
      ) : <p className="gwd-hint">Belum pernah disinkronkan.</p>}

      {(view?.new_list?.length > 0) && (
        <details><summary className="gwd-hint">Border baru ({view.new_list.length})</summary>
          {view.new_list.map((n) => <p key={n.id || n.path} className="gwd-hint">{n.name} · {BD_RARITY[n.rarity]?.[0] || n.rarity}</p>)}
        </details>
      )}
      {(view?.failed_list?.length > 0) && (
        <details open><summary className="gwd-hint">File gagal ({view.failed_list.length})</summary>
          {view.failed_list.map((f, i) => <p key={f.path + i} className="dv-err" style={{ fontSize: 13 }}>{f.path}: {f.reason}</p>)}
        </details>
      )}
      {(view?.ignored_list?.length > 0) && (
        <details><summary className="gwd-hint">File diabaikan ({view.ignored_list.length})</summary>
          {view.ignored_list.map((t, i) => <p key={i} className="gwd-hint">{t}</p>)}
        </details>
      )}
    </div>
  )
}

// Harga per rarity. Mengubah harga rarity HANYA berlaku untuk border baru. Border lama berubah hanya kalau Developer menekan "Terapkan".
export function BorderPriceCard({ data, onDone }) {
  const prices = data?.prices || {}
  const stale = data?.stale || {}
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  useEffect(() => { setDraft({}) }, [data?.prices])

  const val = (r) => (draft[r] ?? String(prices[r] ?? BORDER_PRICES[r]))
  async function save(r) {
    const v = val(r)
    if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 100000000) return setMsg({ text: 'Harga harus bilangan bulat 1 sampai 100.000.000' })
    if (Number(v) === prices[r]) return
    setBusy(true); setMsg(null)
    try {
      const x = await devBorderPriceSet(r, v)
      const n = Number(x?.stale_auto || 0) + Number(x?.stale_manual || 0)
      setMsg({ ok: true, text: `Harga ${BD_RARITY[r][0]} diubah ke ${fmtNum(Number(v))}. Hanya berlaku untuk border baru.${n ? ` ${n} border lama masih memakai harga berbeda (tidak diubah).` : ''}` })
      await onDone?.()
    } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  async function apply(r, scope) {
    const pre = await devBorderPriceApply(r, scope, false).catch((e) => { setMsg({ text: e.message }); return null })
    if (!pre) return
    if (!pre.changed) return setMsg({ ok: true, text: 'Tidak ada border yang perlu disamakan.' })
    if (!window.confirm(`Ubah harga ${pre.changed} border ${BD_RARITY[r][0]}${scope === 'all' ? ' (termasuk yang pernah diatur manual)' : ''} menjadi ${fmtNum(Number(pre.price))} WakuGold?\nPemain yang sudah membeli tidak ditagih atau dikembalikan.`)) return
    setBusy(true); setMsg(null)
    try {
      const x = await devBorderPriceApply(r, scope, true)
      setMsg({ ok: true, text: `${x.changed} border ${BD_RARITY[r][0]} disamakan ke ${fmtNum(Number(x.price))} WakuGold.` })
      await onDone?.()
    } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }

  return (
    <div className="gwd" style={{ padding: 0, marginTop: 22 }}>
      <h3>Harga rarity (otomatis)</h3>
      <p className="gwd-hint">Semua border baru memakai harga rarity-nya, tidak perlu mengisi harga satu per satu. Mengubah harga di sini tidak mengubah border yang sudah ada.</p>
      {BD_ORDER.map((r) => {
        const st = stale[r] || {}
        const n = Number(st.auto || 0), m = Number(st.manual || 0)
        return (
          <div key={r} className={`gwd-row r-${r}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ minWidth: 86 }}>{BD_RARITY[r][0]}</b>
              <input className="dv-input" style={{ flex: 1, minWidth: 0 }} inputMode="numeric" value={val(r)} onChange={(e) => setDraft({ ...draft, [r]: e.target.value.replace(/\D/g, '').slice(0, 9) })} />
              <Button onClick={() => save(r)} disabled={busy || Number(val(r)) === prices[r]}>Simpan</Button>
            </div>
            {(n > 0 || m > 0) && (
              <div className="gwd-hint">
                {n > 0 && <>Border lama harganya beda: <b>{n}</b> <button className="gwd-imp" style={{ height: 32, padding: '0 10px', fontSize: 12, marginLeft: 6 }} disabled={busy} onClick={() => apply(r, 'auto')}>Terapkan ke {n}</button></>}
                {m > 0 && <div style={{ marginTop: 4 }}>Diatur manual: <b>{m}</b> <button className="gwd-imp" style={{ height: 32, padding: '0 10px', fontSize: 12, marginLeft: 6 }} disabled={busy} onClick={() => apply(r, 'all')}>Samakan semua</button></div>}
              </div>
            )}
          </div>
        )
      })}
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'} style={{ marginTop: 6 }}>{msg.text}</p>}
    </div>
  )
}

// Bersihkan nama file di GitHub (Border, Wallpaper, Emblem, Pet, semua subfolder). Pratinjau dulu, baru jalankan.
function CleanNames() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [plan, setPlan] = useState(null)
  async function preview() {
    if (busy) return
    setBusy(true); setMsg(null); setPlan(null)
    try {
      const r = await cleanGithubNames(false)
      setPlan(r)
      setMsg({ ok: true, text: r.planned ? `${r.planned} file akan diganti namanya, ${r.unchanged} sudah rapi${r.skipped ? `, ${r.skipped} dilewati karena dipakai` : ''}.` : `Semua nama file sudah rapi (${r.unchanged} file)${r.skipped ? `, ${r.skipped} dilewati karena dipakai` : ''}.` })
    } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  async function run() {
    if (busy || !plan?.planned) return
    if (!window.confirm(`Ganti nama ${plan.planned} file di GitHub?\nHanya nama yang berubah; isi, animasi, dan transparansi gambar tidak disentuh. File yang sedang dipakai tidak diganti.`)) return
    setBusy(true); setMsg(null)
    try {
      const r = await cleanGithubNames(true)
      setPlan(null)
      setMsg({ ok: !r.failed?.length, text: `${r.applied} nama file dibersihkan.${r.failed?.length ? ` Gagal: ${r.failed[0]}` : ''}${r.truncated ? ' Repository sangat besar, sebagian belum terbaca. Jalankan lagi.' : ''}` })
    } catch (e) { setMsg({ text: e.message }) }
    setBusy(false)
  }
  return (
    <div style={{ marginTop: 6 }}>
      <p className="gwd-hint">Pembersih nama file: membuang teks seperti "— Discord avatar decoration", sumber, dan promosi dari nama file di Border, Wallpaper, Emblem, Pet (semua subfolder). Nama utama dan ekstensi dipertahankan, nama kembar diberi angka. Berlaku otomatis juga saat Impor Panel dan Sinkronisasi.</p>
      <div className="dv-btns" style={{ justifyContent: 'flex-start' }}>
        <Button variant="secondary" onClick={preview} disabled={busy}>{busy ? 'Memeriksa…' : 'Periksa nama file'}</Button>
        {plan?.planned > 0 && <Button onClick={run} disabled={busy}>Bersihkan {plan.planned} file</Button>}
      </div>
      {msg && <p className={msg.ok ? 'dv-ok' : 'dv-err'} style={{ marginTop: 6 }}>{msg.text}</p>}
      {plan?.planned_list?.length > 0 && (
        <details><summary className="gwd-hint">Rencana ganti nama ({plan.planned})</summary>
          {plan.planned_list.map((m) => <p key={m.from} className="gwd-hint">{m.from} → {m.to.slice(m.to.lastIndexOf('/') + 1)}</p>)}
        </details>
      )}
      {plan?.skipped_list?.length > 0 && (
        <details><summary className="gwd-hint">Dilewati ({plan.skipped})</summary>
          {plan.skipped_list.map((m) => <p key={m.path} className="gwd-hint">{m.path}: {m.reason}</p>)}
        </details>
      )}
    </div>
  )
}
