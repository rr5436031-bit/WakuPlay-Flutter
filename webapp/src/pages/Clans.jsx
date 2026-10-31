import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../context'
import { useGold, fmtNum, fmtK } from '../lib/gold'
import { colorOf } from '../lib/clanui'
import { clanOverview, clanDetail, clanTop } from '../services/clan'
import { CreateClanSheet } from '../components/ClanSheets'
import ClanBadge from '../components/ClanBadge'
import CosmicBg from '../components/CosmicBg'
import GoldCoin from '../components/GoldCoin'
import Icon from '../components/Icon'
import CmBg from '../components/CmBg'
import { bannerToShow } from '../lib/clanbanner'

const mem = { ov: null, my: null, list: null }

export default function Clans() {
  const { nav, focusKey } = useApp()
  const gold = useGold()
  const [ov, setOv] = useState(mem.ov)
  const [my, setMy] = useState(mem.my)
  const [list, setList] = useState(mem.list)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState(false)
  const [err, setErr] = useState('')
  const [create, setCreate] = useState(false)

  const load = useCallback(async () => {
    try {
      const o = await clanOverview(); mem.ov = o; setOv(o)
      const m = o.clan_id ? await clanDetail(o.clan_id) : null
      mem.my = m; setMy(m)
    } catch (e) { setErr(e.message) }
  }, [])
  useEffect(() => { load() }, [load, focusKey])
  useEffect(() => {
    const t = setTimeout(() => clanTop(q).then((r) => { if (!q) mem.list = r; setList(r); setErr('') }).catch((e) => setErr(e.message)), q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, ov?.clan_id, focusKey])

  const open = (id) => nav.push('clandetail', { id })
  return (
    <div className="cs-page">
      <CosmicBg />
      <div className="cs-scroll page-scroll">
        <div className="cl-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <h1>Clans</h1>
        </div>
        <p className="cl-desc">Bangun clan bersama temanmu, setor WakuGold untuk menambah XP clan, dan naik ke puncak Top Clans.</p>

        <div className="cl-gold"><GoldCoin size={26} /><div><small>WakuGold kamu</small><b>{gold == null ? '…' : fmtNum(gold)}</b></div></div>

        {ov && (my ? (
          <button className="cl-mine" onClick={() => open(my.id)}>
            <ClanBadge tag={my.tag} tier={my.tier} color={colorOf(my.color)} emblem={my.emblem?.image_url} size={28} />
            <span><small>Clan kamu</small><b>{my.name}</b></span>
            <em>Buka clan <Icon name="chevron" size={16} /></em>
          </button>
        ) : (
          <div className="cl-choose">
            <button className="cl-btn primary" onClick={() => { setSearch(true); setTimeout(() => document.getElementById('cl-search')?.focus(), 50) }}>Gabung Clan</button>
            <button className="cl-btn ghost" onClick={() => setCreate(true)}>Buat Clan · {fmtNum(ov.config?.create_cost || 3500)}</button>
          </div>
        ))}

        <div className="cl-head">
          <h2>Top Clans</h2>
          <button className="cl-pill" onClick={() => setSearch((s) => !s)}><Icon name="search" size={16} /> Cari Clan</button>
        </div>
        {search && <input id="cl-search" className="cl-input" value={q} placeholder="Cari tag atau nama clan" onChange={(e) => setQ(e.target.value)} />}

        {err && <p className="cl-warn">{err}</p>}
        {list === null ? <div>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton cl-skel" />)}</div> : list.length === 0 ? <p className="cl-empty">{q ? 'Clan tidak ditemukan' : 'Belum ada clan. Jadilah yang pertama!'}</p> : (
          <div className="cl-list">
            {list.map((c) => {
              const bn = bannerToShow(c.banner)
              return (
                <button key={c.id} className={`cl-item cl-big ${bn ? 'has-bn' : ''}`} onClick={() => open(c.id)}>
                  {bn && <CmBg url={bn} />}
                  <span className="cl-big-top">
                    <span className={`cl-rk r${Math.min(Number(c.rk), 4)}`}>{c.rk}</span>
                    <span className="cl-badgebox"><ClanBadge tag={c.tag} tier={c.tier} color={colorOf(c)} emblem={c.emblem} size={34} /></span>
                    <span className="cl-xp"><b>{fmtK(c.total_xp)}</b><small>XP</small></span>
                  </span>
                  <span className="cl-info"><b>{c.name}</b><small>Lv.{c.level} · {c.members}/{c.slots} anggota{c.join_mode === 'closed' ? ' · Tertutup' : ''}</small></span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {create && <CreateClanSheet cfg={ov?.config} gold={gold} onClose={() => setCreate(false)} onDone={(id) => { setCreate(false); load(); open(id) }} />}
    </div>
  )
}
