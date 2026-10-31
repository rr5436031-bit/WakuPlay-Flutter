import { useEffect, useRef } from 'react'
import { useApi } from '../hooks/useApi'
import { getMyProfile } from '../services/db'
import { useApp } from '../context'
import { userName } from '../lib/format'
import { useStaffRoles } from '../lib/roles'
import { useGold, fmtNum } from '../lib/gold'
import Icon from '../components/Icon'
import RoleBadge from '../components/RoleBadge'
import GoldCoin from '../components/GoldCoin'
import CosmicBg from '../components/CosmicBg'
import { ClanTag } from '../components/ClanBadge'
import { Avatar } from '../components/ui'
import { ClanEmblem, WallIcon, CarrotIcon, BorderIcon, InfoIcon, PetIcon } from '../components/GameIcons'
import { hasGameInfo } from '../lib/gameInfo'

const FX = { farm: 3, clans: 3, gacha: 3, avborder: 3, info: 3, gold: 3, pet: 2 }

export default function WakuGames() {
  const { user, nav } = useApp()
  const roles = useStaffRoles()
  const gold = useGold()
  const prof = useApi(() => getMyProfile(user.id).catch(() => null), [user?.id])
  const board = useRef(null)
  const MENUS = [
    { id: 'farm', title: 'Kebun Waku', sub: 'Panen wortel', icon: <CarrotIcon />, onClick: () => nav.push('farm') },
    { id: 'clans', title: 'Clan', sub: '', icon: <ClanEmblem />, onClick: () => nav.push('clans') },
    { id: 'gacha', title: 'Gacha Wallpaper', sub: 'Koleksi banner', icon: <WallIcon />, onClick: () => nav.push('gacha') },
    { id: 'avborder', title: 'Avatar Border', sub: 'Dekorasi avatar', icon: <BorderIcon />, onClick: () => nav.push('avatarborder') },
    { id: 'pet', title: 'Pet', sub: '', icon: <PetIcon />, onClick: () => nav.push('pet') },
    { id: 'info', title: 'Info', sub: '', icon: <InfoIcon />, onClick: () => nav.push('gameinfo'), noInfo: true },
  ]
  const GOLD = { id: 'gold', title: gold == null ? '…' : fmtNum(gold), sub: 'WakuGold', label: 'Saldo WakuGold, buka Beli Premium', icon: <GoldCoin size={30} />, onClick: () => nav.push('premium') }
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const miss = MENUS.filter((m) => !m.noInfo && !hasGameInfo(m.id)).map((m) => m.id)
    if (miss.length) console.warn('[WakuGames] Menu belum punya Info:', miss.join(', '), '-> tambahkan di src/lib/gameInfo.js')
  }, [])
  useEffect(() => {
    const el = board.current
    if (!el) return
    const vis = () => el.classList.toggle('hid', document.hidden)
    document.addEventListener('visibilitychange', vis)
    let io = null
    if ('IntersectionObserver' in window) { io = new IntersectionObserver(([e]) => el.classList.toggle('off', !e.isIntersecting)); io.observe(el) }
    return () => { document.removeEventListener('visibilitychange', vis); io && io.disconnect() }
  }, [])
  return (
    <div className="cs-page">
      <CosmicBg />
      <div className="cs-scroll wg page-scroll">
        <div className="wg-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <h1>WakuGames</h1><span className="wg-beta wgd-beta">BETA</span>
        </div>

        <div className="wg-me">
          <Avatar user={user} size={64} />
          <div className="wg-meinfo">
            <span className="wg-hello">Selamat datang!</span>
            <div className="wg-mename">
              <b>{userName(user, 'Pengguna')}</b>
              {prof.data?.seq != null && <span className="wg-id">#{prof.data.seq}</span>}
              <span className="wg-role"><RoleBadge role={roles[user.id]} uid={user.id} part="check" /></span>
            </div>
            <div className="wg-merow">
              <ClanTag uid={user.id} size={20} />
              <span className="wg-role"><RoleBadge role={roles[user.id]} uid={user.id} part="capsule" /></span>
              <div className="wg-gold"><GoldCoin size={20} /><b>{gold == null ? '…' : fmtNum(gold)}</b></div>
            </div>
          </div>
        </div>

        <div className="wgx-board" ref={board}>
          <i className="wgx-st a" /><i className="wgx-st b" /><i className="wgx-st c" /><i className="wgx-st d" />
          {[...MENUS, GOLD].map((m, i) => (
            <div key={m.id} className={`wgx-dm ${m.id}`} style={{ '--i': i }}>
              <div className="wgx-fl">
                <button className="wgx-sq" onClick={m.onClick} aria-label={m.label || m.title} />
                {FX[m.id] > 0 && <span className="wgx-fx" aria-hidden="true">{Array.from({ length: FX[m.id] }, (_, k) => <i key={k} className={`f${k + 1}`} />)}</span>}
                <div className="wgx-in">
                  <span className="wgx-ico">{m.icon}</span>
                  <b>{m.title}</b>{m.sub && <small>{m.sub}</small>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
