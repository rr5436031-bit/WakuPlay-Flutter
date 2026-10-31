import BorderFrame from '../components/BorderFrame'
import { useBorderOf } from '../lib/borders'
import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context'
import { useGold, fmtK, fmtNum } from '../lib/gold'
import { useAct, ago, colorOf } from '../lib/clanui'
import { levelInfo } from '../lib/xp'
import { invalidateClanBadges } from '../lib/clanbadge'
import * as C from '../services/clan'
import { DonateSheet, Confirm, Sheet } from '../components/ClanSheets'
import ClanShop from '../components/ClanShop'
import ClanSettings, { MODE_LABEL } from '../components/ClanSettings'
import CmBg from '../components/CmBg'
import { bannerToShow } from '../lib/clanbanner'
import DailyClan from '../components/DailyClan'
import ClanBadge from '../components/ClanBadge'
import CosmicBg from '../components/CosmicBg'
import GoldCoin from '../components/GoldCoin'
import LevelBadge from '../components/LevelBadge'
import RoleBadge from '../components/RoleBadge'
import { useStaffRoles } from '../lib/roles'
import { nameColor } from '../lib/format'
import Icon from '../components/Icon'
import { ROLE_NAME, ROLE_TAG, ROLE_COLOR, rankOf, isManager, isOwner, canHandleRequests, canKick, assignableRoles } from '../lib/clanrole'

function Face({ url, name, size = 50 , uid }) {
  const [bad, setBad] = useState(false)
  const bid = useBorderOf(size < 30 ? null : uid)
  const el = url && !bad ? <img decoding="async" className="avatar" style={{ width: size, height: size }} src={url} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <div className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?')[0].toUpperCase()}</div>
  return bid ? <BorderFrame id={bid} size={size}>{el}</BorderFrame> : el
}

const dmem = new Map()

export default function ClanDetail({ id }) {
  const { user, nav, focusKey } = useApp()
  const gold = useGold()
  const roles = useStaffRoles()
  const act = useAct()
  const [d, setD] = useState(() => dmem.get(id)?.d)
  const [cfg, setCfg] = useState(() => dmem.get(id)?.cfg || {})
  const [tab, setTab] = useState('members')
  const [q, setQ] = useState('')
  const [members, setMembers] = useState(null)
  const [dons, setDons] = useState(null)
  const [log, setLog] = useState(null)
  const [reqs, setReqs] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [ask, setAsk] = useState(null)
  const [menu, setMenu] = useState(null)

  const load = useCallback(async () => {
    try {
      const [det, ov] = await Promise.all([C.clanDetail(id), C.clanOverview()])
      dmem.set(id, { d: det, cfg: ov.config || {} }); setD(det); setCfg(ov.config || {})
    } catch (e) { act.say(e.message); setD((x) => (x === undefined ? null : x)) }
  }, [id])
  useEffect(() => { load() }, [load, focusKey])

  const isMember = d && d.my_clan === d.id
  const myRole = d ? d.my_role : null
  const isLeader = isOwner(myRole)
  const isMgr = isMember && isManager(myRole)
  const canReq = isMember && canHandleRequests(myRole)
  useEffect(() => {
    if (!d) return
    const t = setTimeout(() => C.clanMembers(id, q).then(setMembers).catch(() => {}), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [id, q, d?.members, d?.slots, d?.leader, d?.my_role, focusKey])
  useEffect(() => {
    if (!d) return
    C.clanDonations(id).then(setDons).catch(() => {})
    if (isMember) C.clanLog(id).then(setLog).catch(() => {})
    if (canReq) C.clanRequests(id).then(setReqs).catch(() => {})
  }, [id, d?.xp_available, d?.members, isMember, canReq])

  const refresh = async () => { await load(); invalidateClanBadges() }
  const mutate = (fn, okMsg) => act.run(async () => { await fn(); if (okMsg) act.say(okMsg); await refresh(); setAsk(null); setMenu(null) })

  if (d === undefined) return (
    <div className="cs-page"><CosmicBg /><div className="cs-scroll page-scroll">
      <div className="cl-top"><button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button></div>
      <div className="skeleton" style={{ height: 44, width: '60%', borderRadius: 12 }} />
      <div className="skeleton" style={{ height: 30, width: '40%', borderRadius: 10, margin: '16px 0 20px' }} />
      <div className="cl-stats2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 84, borderRadius: 20 }} />)}</div>
    </div></div>
  )
  if (d === null) return (
    <div className="cs-page"><CosmicBg /><div className="cs-scroll page-scroll">
      <div className="cl-top"><button className="iconbtn" onClick={nav.back}><Icon name="back" size={26} /></button><h1>Clan</h1></div>
      <p className="cl-empty">Clan tidak ditemukan atau sudah dibubarkan.</p>
    </div></div>
  )

  const color = colorOf(d.color)
  const emblem = d.emblem?.image_url || null
  const into = Math.max(0, d.total_xp - d.lvl_start), need = d.lvl_next - d.lvl_start
  const pct = Math.min(100, Math.max(2, (into / need) * 100))
  const bn = bannerToShow(d.banner)

  return (
    <div className="cs-page">
      <CosmicBg />
      <div className="cs-scroll page-scroll">
        <div className="cl-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <span style={{ flex: 1 }} />
          <button className="cl-pill" onClick={() => nav.push('clans')}>Top Clans</button>
        </div>
        <div className={`cl-hero ${bn ? 'has-bn' : ''}`}>
          {bn && <CmBg url={bn} />}
          {isMgr && <button className="cl-gear" aria-label="Pengaturan clan" onClick={() => setSheet('settings')}><Icon name="gear" size={22} /></button>}
          <div className="cl-hero-top">
            <span className="cl-logo" style={{ background: `linear-gradient(135deg, ${color?.c1 || '#ff4d6d'}, ${color?.c2 || '#7a5cff'})` }}>{String(d.tag || '').slice(0, 2)}</span>
            <div className="cl-hero-id">
              <h1>{d.name}</h1>
              <div className="cl-hero-pills"><ClanBadge tag={d.tag} tier={d.tier} color={color} emblem={emblem} size={26} /><span className="cl-lv">Lv.{d.level}</span><span className={`cl-modechip ${d.join_mode}`}>{d.join_mode === 'closed' && <Icon name="lock" size={12} />}{MODE_LABEL[d.join_mode] || 'Request'}</span></div>
            </div>
          </div>

          <div className="cl-prog"><span>Menuju Level {d.level + 1}</span><b>{fmtK(into)} / {fmtK(need)} XP</b></div>
          <div className="cl-bar"><i style={{ width: `${pct}%` }} /></div>

          <div className="cl-stats3">
            <div className="cl-stat"><b>{fmtK(d.total_xp)}</b><span>Total XP</span></div>
            <div className="cl-stat"><b><Icon name="people" size={16} /> {d.members}/{d.slots}</b><span>Member</span></div>
            <div className="cl-stat"><b className="gold"><GoldCoin size={16} /> {fmtNum(d.xp_available)}</b><span>XPGold</span></div>
          </div>

          {isMember ? (
            <div className="cl-btns">
              <button className="cl-btn primary" onClick={() => setSheet('donate')}><GoldCoin size={20} /> Setor Gold</button>
              <button className="cl-btn ghost" onClick={() => setSheet('shop')}>Shop Clan</button>
            </div>
          ) : (
            <div className="cl-btns one">
              {d.my_clan ? <button className="cl-btn ghost" disabled>Kamu sudah punya clan</button>
                : d.my_request ? <button className="cl-btn ghost" disabled={act.busy} onClick={() => mutate(() => C.clanCancelRequest(d.id), 'Permintaan dibatalkan')}>Batalkan permintaan</button>
                : d.join_mode === 'closed' ? <button className="cl-btn ghost" disabled>Clan privat (tertutup)</button>
                : d.members >= d.slots ? <button className="cl-btn ghost" disabled>Clan penuh</button>
                : <button className="cl-btn primary" disabled={act.busy} onClick={() => mutate(async () => { const r = await C.clanJoin(d.id, C.newReq()); act.say(r === 'joined' ? 'Berhasil bergabung!' : 'Permintaan bergabung terkirim') })}>{d.join_mode === 'open' ? 'Gabung Clan' : 'Minta bergabung'}</button>}
            </div>
          )}
          {isMember && !isLeader && <button className="cl-leave" onClick={() => setAsk({ title: 'Keluar dari clan?', body: `Kamu akan keluar dari [${d.tag}] ${d.name}.`, yes: 'Keluar', danger: true, fn: () => mutate(async () => { await C.clanLeave(); nav.back() }) })}>Keluar Clan</button>}
        </div>

        {isMember && <DailyClan act={act} focusKey={focusKey} />}
        {act.msg && <p className="cl-toast">{act.msg}</p>}

        <div className="cl-tabs">
          {['members', 'donasi', ...(canReq ? ['permintaan'] : [])].map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'members' ? 'Members' : t === 'donasi' ? 'Donasi' : 'Permintaan'}{t === 'permintaan' && d.pending > 0 && <i>{d.pending}</i>}
            </button>
          ))}
        </div>

        {tab === 'members' && (
          <>
            <label className="cl-search"><Icon name="search" size={18} /><input value={q} placeholder="Cari member (nama atau ID)" onChange={(e) => setQ(e.target.value)} /></label>
            {members === null ? <p className="cl-empty">Memuat…</p> : members.length === 0 ? <p className="cl-empty">Tidak ada member</p> : members.map((m) => (
              <div key={m.user_id} className="cl-mem">
                <button className="cl-mem-main" onClick={() => nav.push('userprofile', { uid: m.user_id, name: m.name, avatar: m.avatar, seq: m.seq })}>
                  <span className="cl-face"><Face url={m.avatar} name={m.name} uid={m.user_id} />{ROLE_TAG[m.role] && <em style={{ background: ROLE_COLOR[m.role] }}>{ROLE_TAG[m.role]}</em>}</span>
                  <span className="cl-mem-info">
                    <span className="cl-mem-name">
                      <b style={{ color: nameColor(m.user_id) }}>{m.name}</b>
                      <RoleBadge role={roles[m.user_id]} uid={m.user_id} />
                      {m.seq != null && <i>#{m.seq}</i>}
                    </span>
                    <span className="cl-mem-tags"><ClanBadge tag={d.tag} tier={d.tier} color={color} emblem={emblem} size={20} /><LevelBadge level={levelInfo(Number(m.xp) || 0).level} role={roles[m.user_id]} /></span>
                  </span>
                </button>
                <span className="cl-contrib" title="WakuGold yang disetor"><GoldCoin size={18} />{fmtK(m.donated_gold)}</span>
                {isMember && m.user_id !== user.id && (isLeader || canKick(myRole, m.role) || assignableRoles(myRole, m.role).length > 0) && <button className="iconbtn" aria-label="Kelola" onClick={() => setMenu(m)}><Icon name="more" size={22} /></button>}
              </div>
            ))}
          </>
        )}

        {tab === 'donasi' && (
          <>
            {dons === null ? <p className="cl-empty">Memuat…</p> : dons.length === 0 ? <p className="cl-empty">Belum ada donasi</p> : dons.map((x) => (
              <div key={x.id} className="cl-don"><Face url={x.avatar} name={x.name} size={40} uid={x.user_id} /><span><span className="cl-mem-name"><b style={{ color: nameColor(x.user_id) }}>{x.name}</b><RoleBadge role={roles[x.user_id]} uid={x.user_id} /></span><small>{ago(x.created_at)}</small></span><em><GoldCoin size={16} />{fmtNum(x.gold)}</em></div>
            ))}
            {isMember && log && log.length > 0 && (
              <>
                <h3 className="cl-h3">Riwayat XPGold</h3>
                {log.map((x) => (
                  <div key={x.id} className="cl-don"><span className="cl-logico">{x.delta >= 0 && x.kind !== 'tier' && x.kind !== 'slot' ? '+' : '−'}</span><span><b>{x.kind === 'donasi' ? 'Donasi' : x.kind === 'slot' ? 'Upgrade slot' : x.kind === 'tier' ? 'Upgrade tier' : x.kind === 'dev' ? 'Diatur developer' : 'Spin warna'}</b><small>{x.note}{x.name ? ` · ${x.name}` : ''} · {ago(x.created_at)}</small></span><em className={x.delta >= 0 ? 'up' : 'down'}>{x.delta >= 0 ? '+' : ''}{fmtNum(x.delta)}</em></div>
                ))}
              </>
            )}
          </>
        )}

        {tab === 'permintaan' && canReq && (
          <>
            <div className="cl-mode">
              <span>Mode gabung<small>{d.join_mode === 'open' ? 'Terbuka: siapa saja langsung masuk' : d.join_mode === 'closed' ? 'Tertutup: tidak menerima anggota baru' : 'Perlu persetujuan Leader / Vice / Admiral / Officer'}</small></span>
              {isMgr && <button className="cl-pill" onClick={() => setSheet('settings')}>Ubah</button>}
            </div>
            {reqs === null ? <p className="cl-empty">Memuat…</p> : reqs.length === 0 ? <p className="cl-empty">Tidak ada permintaan</p> : reqs.map((r) => (
              <div key={r.id} className="cl-don"><Face url={r.avatar} name={r.name} size={44} uid={r.user_id} />
                <span><span className="cl-mem-name"><b style={{ color: nameColor(r.user_id) }}>{r.name}</b><RoleBadge role={roles[r.user_id]} uid={r.user_id} part="check" />{r.seq != null && <i>#{r.seq}</i>}<RoleBadge role={roles[r.user_id]} uid={r.user_id} part="capsule" /></span><small>{roles[r.user_id] === 'developer' || roles[r.user_id] === 'admin' ? 'Lvl 999.999' : `Lv.${levelInfo(Number(r.xp) || 0).level}`} · {ago(r.created_at)}</small></span>
                <span className="cl-rq"><button className="cl-btn primary sm" disabled={act.busy} onClick={() => mutate(() => C.clanRespond(r.id, true), 'Diterima')}>Terima</button><button className="cl-btn ghost sm" disabled={act.busy} onClick={() => mutate(() => C.clanRespond(r.id, false), 'Ditolak')}>Tolak</button></span>
              </div>
            ))}
          </>
        )}
        <div style={{ height: 40 }} />
      </div>

      {sheet === 'donate' && <DonateSheet cfg={cfg} gold={gold} onClose={() => setSheet(null)} onDone={(r) => { setSheet(null); act.say(`Berhasil setor, +${fmtNum(r.xp)} XPGold`); refresh() }} />}
      {sheet === 'settings' && isMgr && <ClanSettings d={d} isOwner={isLeader} onClose={() => setSheet(null)} onChanged={refresh} onGone={() => { setSheet(null); nav.back() }} />}
      {sheet === 'shop' && <ClanShop d={d} cfg={cfg} isLeader={isMgr} isOwner={isLeader} onClose={() => setSheet(null)} onChanged={refresh} onGacha={() => nav.push('clangacha', { id: d.id })} onEmblem={() => nav.push('clanemblem', { id: d.id })} onGone={() => { setSheet(null); nav.back() }} />}
      {menu && !ask && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <p className="cl-sub" style={{ marginTop: -6 }}>Role saat ini: <b>{ROLE_NAME[menu.role] || 'Member'}</b></p>
          {assignableRoles(myRole, menu.role).map((r) => {
            const up = rankOf(r) > rankOf(menu.role)
            return (
              <button key={r} className="cl-btn ghost wide" style={{ marginBottom: 10 }} disabled={act.busy}
                onClick={() => setAsk({ title: `${up ? 'Naikkan' : 'Turunkan'} jadi ${ROLE_NAME[r]}?`, body: `${menu.name} akan menjadi ${ROLE_NAME[r]} di clan ini.`, yes: up ? 'Naikkan' : 'Turunkan', fn: () => mutate(() => C.clanSetRole(menu.user_id, r), `${menu.name} sekarang ${ROLE_NAME[r]}`) })}>
                {up ? 'Naikkan' : 'Turunkan'} jadi {ROLE_NAME[r]}
              </button>
            )
          })}
          {isLeader && <button className="cl-btn ghost wide" style={{ marginBottom: 10 }} onClick={() => setAsk({ title: 'Pindahkan kepemimpinan?', body: `${menu.name} akan menjadi Leader. Kamu menjadi Member biasa.`, yes: 'Pindahkan', fn: () => mutate(() => C.clanTransfer(menu.user_id), 'Kepemimpinan dipindahkan') })}>Pindahkan kepemimpinan</button>}
          {canKick(myRole, menu.role) && <button className="cl-btn danger wide" onClick={() => setAsk({ title: 'Keluarkan anggota?', body: `${menu.name} akan dikeluarkan dari clan.`, yes: 'Keluarkan', danger: true, fn: () => mutate(() => C.clanKick(menu.user_id), 'Anggota dikeluarkan') })}>Keluarkan dari clan</button>}
        </Sheet>
      )}
      {ask && <Confirm title={ask.title} body={ask.body} yes={ask.yes} danger={ask.danger} busy={act.busy} onNo={() => setAsk(null)} onYes={ask.fn} />}
    </div>
  )
}
