import { useEffect, useState } from 'react'
import { useApp } from '../context'
import Icon from '../components/Icon'
import RoleBadge from '../components/RoleBadge'
import LevelBadge from '../components/LevelBadge'
import { Skeleton, UserFace } from '../components/ui'
import { getTopLevels, getMyTopLevel } from '../services/toplevel'
import { fmtXpShort } from '../lib/xp'

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID')

const RULES = [
  ['Satu peringkat untuk semua waktu', 'Tidak ada harian, mingguan, atau bulanan. Yang level (total XP) paling tinggi ada di puncak.'],
  ['Dihitung dari total XP', 'Level hanya turunan dari XP, jadi urutannya sama. Kalau level sama, yang XP-nya lebih banyak menang.'],
  ['Badge TOP LEVEL untuk 10 besar', 'Badge muncul di profil peringkat 1 sampai 10. Peringkat 11 ke bawah tidak mendapat badge.'],
  ['Badge tidak bisa dipalsukan', 'Badge tidak disimpan di akun mana pun. Setiap profil dibuka, server menghitung ulang dari XP asli.'],
  ['Akun diblokir tidak tampil', 'Selama diblokir, akun tidak masuk peringkat dan tidak mendapat badge. Setelah blokir dibuka, otomatis kembali.'],
  ['Developer dan Admin tidak ikut', 'Level akun staf tampil maksimal di aplikasi, bukan hasil XP, jadi tidak dihitung.'],
  ['XP hanya dari jalur resmi', 'XP naik lewat nonton, gift, giveaway, atau Panel Developer. Tidak bisa diubah dari aplikasi.'],
  ['Dihitung langsung oleh server', 'Slide Home, halaman ini, dan badge profil memakai satu sumber urutan yang sama, jadi angkanya selalu cocok.'],
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
      <LevelBadge xp={r.total_xp} role="user" dot className="lb-lvl" />
      <span className="tg-pod-ppl">{fmtXpShort(r.total_xp)} XP</span>
    </button>
  )
}

export default function TopLevel() {
  const { user, nav } = useApp()
  const [rows, setRows] = useState(null)
  const [mine, setMine] = useState(null)
  const [err, setErr] = useState('')
  const [rules, setRules] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let off = false
    setRows(null); setErr('')
    Promise.all([getTopLevels(100), getMyTopLevel().catch(() => null)])
      .then(([r, m]) => { if (!off) { setRows(r); setMine(m) } })
      .catch((e) => { if (!off) setErr(e?.message || 'Gagal memuat') })
    return () => { off = true }
  }, [tick])

  const openProfile = (r) => nav.push('userprofile', { uid: r.user_id, name: r.name, avatar: r.avatar, seq: r.seq })
  const list = rows || []
  const rest = list.slice(3)
  const best = Number(list[0]?.total_xp) || 1

  return (
    <div className="page-scroll tg-page tlv-page">
      <div className="topbar center">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" /></button>
        <h1>Top Level</h1>
        <span style={{ width: 40 }} />
      </div>

      <div className="tg-hero">
        <i className="tg-hero-glow" />
        <span className="tg-hero-ic"><Icon name="crown" size={28} /></span>
        <div className="tg-hero-tx">
          <b>Top 100 Level</b>
          <small>Pemilik level tertinggi sepanjang waktu. 10 besar mendapat badge TOP LEVEL di profil.</small>
        </div>
      </div>

      {err && (
        <div className="state">
          <p>{err}</p>
          <p style={{ fontSize: 13 }}>Pastikan <b>supabase/top-level.sql</b> sudah dijalankan di SQL Editor.</p>
          <button className="tg-retry" onClick={() => setTick((n) => n + 1)}>Coba lagi</button>
        </div>
      )}
      {!rows && !err && <Skeleton style={{ height: 270, borderRadius: 22, margin: '8px 14px' }} />}

      {rows && rows.length === 0 && (
        <div className="state tg-empty">
          <span className="tg-empty-ic"><Icon name="crown" size={34} /></span>
          <strong>Belum ada yang masuk peringkat</strong>
          <p>Nonton anime untuk mengumpulkan XP dan naik level.</p>
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
                  <div className="tg-bar"><span style={{ width: `${Math.max(4, Math.round((Number(r.total_xp) / best) * 100))}%` }} /></div>
                  <small>{fmt(r.total_xp)} XP</small>
                </div>
                <LevelBadge xp={r.total_xp} role="user" dot className="lb-lvl" />
              </button>
            ))}
          </div>
        </>
      )}

      {rows && mine && !err && (
        <div className="tg-mine">
          {mine.rank
            ? <>Kamu di peringkat <b>#{fmt(mine.rank)}</b> · {fmt(mine.total_xp)} XP</>
            : <>Kamu belum masuk peringkat level.</>}
          <button className="tg-mine-btn" onClick={() => nav.tab('home')}><Icon name="play" size={16} /> Nonton</button>
        </div>
      )}

      <div className={`tg-rules ${rules ? 'open' : ''}`}>
        <button className="tg-rules-h" onClick={() => setRules((v) => !v)} aria-expanded={rules}>
          <Icon name="shield" size={20} />
          <span><b>Aturan Top Level</b><small>{RULES.length} aturan ketat, dijaga server</small></span>
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
