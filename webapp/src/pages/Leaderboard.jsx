import BorderFrame from '../components/BorderFrame'
import { useBorderOf } from '../lib/borders'
import { useEffect, useState } from 'react'
import { useApp } from '../context'
import { getLeaderboard, getMyRank, fmtXpShort } from '../lib/xp'
import LevelBadge from '../components/LevelBadge'
import { Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import RoleBadge from '../components/RoleBadge'

const TABS = [['daily', 'Harian'], ['weekly', 'Mingguan'], ['monthly', 'Bulanan']]
const ROLE_TAG = { developer: ['Developer', 'dev'], admin: ['ADMIN', 'admin'], moderator: ['MOD', 'mod'] }
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID')
const todayWib = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)

function Face({ url, name, size , uid }) {
  const [bad, setBad] = useState(false)
  const bid = useBorderOf(size < 30 ? null : uid)
  const el = url && !bad ? <img decoding="async" className="avatar" style={{ width: size, height: size }} src={url} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <div className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?')[0].toUpperCase()}</div>
  return bid ? <BorderFrame id={bid} size={size}>{el}</BorderFrame> : el
}
const Lvl = ({ xp, role }) => <LevelBadge xp={xp} role={role} dot className="lb-lvl" />
const Tag = ({ role }) => { if (role === 'developer' || role === 'admin') return null; const t = ROLE_TAG[role] || ['USER', 'user']; return <span className={`lb-tag lb-tag-${t[1]}`}>{t[0]}</span> }

function Podium({ r, pos, onOpen }) {
  if (!r) return <div className={`lb-pod p${pos} empty`} />
  return (
    <div className={`lb-pod p${pos} lb-tap`} onClick={() => onOpen(r)}>
      {pos === 1 && <span className="lb-crown"><Icon name="crown" size={22} /></span>}
      <div className="lb-pod-av"><Face url={r.avatar} name={r.name} size={pos === 1 ? 76 : 62} uid={r.user_id} /><span className={`hb-medal m${pos}`}>{pos}</span></div>
      <div className="lb-pod-name"><b>{r.name}</b><RoleBadge role={r.role} uid={r.user_id} /></div>
      <Lvl xp={r.total_xp} role={r.role} />
      <div className="lb-pod-xp">+{fmt(r.gain)}</div>
    </div>
  )
}

export default function Leaderboard() {
  const { user, nav } = useApp()
  const [period, setPeriod] = useState('daily')
  const [rows, setRows] = useState(null)
  const [mine, setMine] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let off = false
    setRows(null); setErr(false)
    Promise.all([getLeaderboard(period), getMyRank(period).catch(() => null)])
      .then(([r, m]) => { if (!off) { setRows(r); setMine(m) } })
      .catch(() => { if (!off) setErr(true) })
    return () => { off = true }
  }, [period])

  const openProfile = (r) => nav.push('userprofile', { uid: r.user_id, name: r.name, avatar: r.avatar, seq: r.seq })
  const top = rows || []
  const rest = top.slice(3)
  const myRow = top.find((r) => r.user_id === user.id)

  return (
    <div className="page-scroll lb-page">
      <div className="topbar center">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" /></button>
        <h1>Leaderboard XP</h1>
        <span style={{ width: 40 }} />
      </div>
      <div className="lb-tabs">
        {TABS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}
      </div>
      <div className="lb-date">{todayWib()}</div>

      {err && <div className="state"><p>Gagal memuat leaderboard. Pastikan supabase/leaderboard-xp.sql sudah dijalankan.</p></div>}
      {!rows && !err && <Skeleton style={{ height: 280, borderRadius: 22, margin: '8px 14px' }} />}
      {rows && rows.length === 0 && <div className="state"><p>Belum ada yang dapat XP periode ini. Ayo nonton!</p></div>}

      {rows && rows.length > 0 && (
        <>
          <div className="lb-podium">
            <Podium r={top[1]} pos={2} onOpen={openProfile} /><Podium r={top[0]} pos={1} onOpen={openProfile} /><Podium r={top[2]} pos={3} onOpen={openProfile} />
          </div>
          <div className="lb-list">
            {rest.map((r) => (
              <div key={r.user_id} className={`lb-row lb-tap ${r.user_id === user.id ? 'me' : ''}`} onClick={() => openProfile(r)}>
                <span className="lb-pos">#{r.rank}</span>
                <Face url={r.avatar} name={r.name} size={46} uid={r.user_id} />
                <div className="lb-mid">
                  <div className="lb-nm"><b>{r.name}</b><RoleBadge role={r.role} uid={r.user_id} part="check" />{r.seq != null && <i>#{r.seq}</i>}<RoleBadge role={r.role} uid={r.user_id} part="capsule" /></div>
                  <div className="lb-chips"><Tag role={r.role} /><Lvl xp={r.total_xp} role={r.role} /></div>
                </div>
                <span className="lb-gain">+{fmt(r.gain)}</span>
              </div>
            ))}
          </div>
          {!myRow && mine && (
            <div className="lb-note">
              {mine.rank ? `Kamu di peringkat #${fmt(mine.rank)} (+${fmt(mine.gain)} XP)` : 'Kamu belum masuk 50 besar periode ini.'}
            </div>
          )}
        </>
      )}
      <div style={{ height: 24 }} />
    </div>
  )
}
