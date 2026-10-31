import { useEffect, useState } from 'react'
import { useApp } from '../context'
import Icon from '../components/Icon'
import RoleBadge from '../components/RoleBadge'
import { Skeleton, UserFace } from '../components/ui'
import { getTopGivers, getMyTopGiver } from '../services/topgiver'

const TABS = [['weekly', 'Mingguan'], ['monthly', 'Bulanan'], ['all', 'Semua']]
const SUB = { weekly: 'Minggu ini (Senin–Minggu, WIB)', monthly: 'Bulan ini (WIB)', all: 'Sepanjang waktu' }
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID')

const RULES = [
  ['Hanya hari yang benar-benar diklaim', 'Yang dihitung total hari dari giveaway Chat Global yang sudah diklaim orang lain. Contoh: giveaway 3 hari × 2 orang, keduanya klaim = 6 hari. Hadiah yang tidak terklaim dikembalikan dan tidak dihitung.'],
  ['Hanya giveaway Chat Global', 'Gift langsung ke satu orang, tambahan dari Developer, dan pembelian Premium tidak masuk Top Giver.'],
  ['Klaim sendiri tidak dihitung', 'Giveaway yang diklaim oleh pembuatnya sendiri tidak menambah hari.'],
  ['Anti tukar-tukar akun', 'Satu penerima dihitung maksimal 60 hari untuk satu pemberi per bulan. Jadi bagi-bagi ke akun yang itu-itu saja tidak bisa menaikkan peringkat.'],
  ['Akun diblokir tidak dihitung', 'Akun yang sedang diblokir tidak tampil di peringkat, dan klaim dari akun yang diblokir tidak dihitung.'],
  ['Urutan peringkat', 'Hari terbanyak lebih tinggi. Kalau sama, yang hadiahnya diterima lebih banyak orang berbeda menang. Kalau masih sama, yang lebih dulu mencapai angka itu.'],
  ['Dihitung langsung oleh server', 'Angka diambil dari catatan klaim permanen, bukan angka tersimpan, jadi tidak bisa diubah dari aplikasi dan selalu cocok dengan giveaway yang terjadi.'],
]

function Pod({ r, pos, onOpen }) {
  if (!r) return <div className={`tg-pod p${pos} empty`} />
  return (
    <button className={`tg-pod p${pos}`} onClick={() => onOpen(r)}>
      {pos === 1 && <span className="tg-crown"><Icon name="crown" size={24} /></span>}
      <div className="tg-pod-av">
        <UserFace url={r.avatar} name={r.name} size={pos === 1 ? 72 : 58} uid={r.user_id} />
        <span className={`tg-medal m${pos}`}>{pos}</span>
      </div>
      <div className="tg-pod-name"><b>{r.name}</b><RoleBadge role={r.role} uid={r.user_id} /></div>
      <div className="tg-pod-val">{fmt(r.days)}<small> hari</small></div>
      <span className="tg-pod-ppl">{fmt(r.people)} orang</span>
    </button>
  )
}

export default function TopGiver() {
  const { user, nav } = useApp()
  const [period, setPeriod] = useState('all')
  const [rows, setRows] = useState(null)
  const [mine, setMine] = useState(null)
  const [err, setErr] = useState('')
  const [rules, setRules] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let off = false
    setRows(null); setErr('')
    Promise.all([getTopGivers(period, 100), getMyTopGiver(period).catch(() => null)])
      .then(([r, m]) => { if (!off) { setRows(r); setMine(m) } })
      .catch((e) => { if (!off) setErr(e?.message || 'Gagal memuat') })
    return () => { off = true }
  }, [period, tick])

  const openProfile = (r) => nav.push('userprofile', { uid: r.user_id, name: r.name, avatar: r.avatar, seq: r.seq })
  const list = rows || []
  const rest = list.slice(3)
  const best = Number(list[0]?.days) || 1
  const myRow = list.find((r) => r.user_id === user?.id)

  return (
    <div className="page-scroll tg-page">
      <div className="topbar center">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" /></button>
        <h1>Top Giver</h1>
        <span style={{ width: 40 }} />
      </div>

      <div className="tg-hero">
        <i className="tg-hero-glow" />
        <span className="tg-hero-ic"><Icon name="gift" size={28} /></span>
        <div className="tg-hero-tx">
          <b>Top 100 Giver</b>
          <small>Total hari Premium yang dibagikan lewat giveaway Chat Global dan sudah diklaim orang lain.</small>
        </div>
      </div>

      <div className="lb-tabs tg-tabs">
        {TABS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
      </div>
      <div className="lb-date">{SUB[period]}</div>

      {err && (
        <div className="state">
          <p>{err}</p>
          <p style={{ fontSize: 13 }}>Pastikan <b>supabase/top-giver.sql</b> sudah dijalankan di SQL Editor.</p>
          <button className="tg-retry" onClick={() => setTick((n) => n + 1)}>Coba lagi</button>
        </div>
      )}
      {!rows && !err && <Skeleton style={{ height: 270, borderRadius: 22, margin: '8px 14px' }} />}

      {rows && rows.length === 0 && (
        <div className="state tg-empty">
          <span className="tg-empty-ic"><Icon name="gift" size={34} /></span>
          <strong>Belum ada giver di periode ini</strong>
          <p>Jadilah yang pertama! Buat giveaway Premium di Chat Global, dan hari yang diklaim orang akan masuk peringkat.</p>
          <button className="tg-cta" onClick={() => nav.push('chat')}><Icon name="gift" size={18} /> Buka Chat Global</button>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="tg-podium">
            <Pod r={list[1]} pos={2} onOpen={openProfile} />
            <Pod r={list[0]} pos={1} onOpen={openProfile} />
            <Pod r={list[2]} pos={3} onOpen={openProfile} />
          </div>

          <div className="tg-list">
            {rest.map((r) => (
              <button key={r.user_id} className={`tg-row ${r.user_id === user?.id ? 'me' : ''}`} onClick={() => openProfile(r)}>
                <span className="tg-pos">#{r.rank}</span>
                <UserFace url={r.avatar} name={r.name} size={44} uid={r.user_id} />
                <div className="tg-mid">
                  <div className="tg-nm"><b>{r.name}</b><RoleBadge role={r.role} uid={r.user_id} part="check" />{r.seq != null && <i>#{r.seq}</i>}<RoleBadge role={r.role} uid={r.user_id} part="capsule" /></div>
                  <div className="tg-bar"><span style={{ width: `${Math.max(4, Math.round((Number(r.days) / best) * 100))}%` }} /></div>
                  <small>{fmt(r.people)} orang menerima</small>
                </div>
                <span className="tg-val">{fmt(r.days)}<small> hari</small></span>
              </button>
            ))}
          </div>
        </>
      )}

      {rows && mine && !err && (
        <div className="tg-mine">
          {myRow || mine.rank
            ? <>Kamu di peringkat <b>#{fmt(mine.rank)}</b> · {fmt(mine.days)} hari · {fmt(mine.people)} orang</>
            : <>Kamu belum punya giveaway yang diklaim di periode ini.</>}
          <button className="tg-mine-btn" onClick={() => nav.push('chat')}><Icon name="gift" size={16} /> Buat Giveaway</button>
        </div>
      )}

      <div className={`tg-rules ${rules ? 'open' : ''}`}>
        <button className="tg-rules-h" onClick={() => setRules((v) => !v)} aria-expanded={rules}>
          <Icon name="shield" size={20} />
          <span><b>Aturan Top Giver</b><small>{RULES.length} aturan ketat, dijaga server</small></span>
          <Icon name="chevron" size={18} />
        </button>
        {rules && (
          <ol className="tg-rules-b">
            {RULES.map(([t, d], i) => <li key={t}><i>{i + 1}</i><p><b>{t}</b>{d}</p></li>)}
          </ol>
        )}
      </div>
      <div style={{ height: 28 }} />
    </div>
  )
}
