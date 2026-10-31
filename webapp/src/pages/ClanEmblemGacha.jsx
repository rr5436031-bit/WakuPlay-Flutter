import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { isManager } from '../lib/clanrole'
import { useAct, EMBLEM_RARITY as RARITY, EMBLEM_ORDER, MYSTERY_EMBLEM, colorOf } from '../lib/clanui'
import { fmtNum } from '../lib/gold'
import { invalidateClanBadges } from '../lib/clanbadge'
import * as C from '../services/clan'
import ClanBadge from '../components/ClanBadge'
import CosmicBg from '../components/CosmicBg'
import Icon from '../components/Icon'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RANK = { common: 0, epic: 1, legend: 2, mythic: 3 }
const gmem = new Map()

export default function ClanEmblemGacha({ id }) {
  const { nav } = useApp()
  const act = useAct()
  const [d, setD] = useState(() => gmem.get(id)?.d || null)
  const [cfg, setCfg] = useState(() => gmem.get(id)?.cfg || {})
  const [list, setList] = useState(() => gmem.get(id)?.list || [])
  const [tab, setTab] = useState('spin')
  const [phase, setPhase] = useState('idle')
  const [rr, setRr] = useState(null)
  const [result, setResult] = useState(null)
  const [multi, setMulti] = useState(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const load = useCallback(async () => {
    try {
      const [det, ov, em] = await Promise.all([C.clanDetail(id), C.clanOverview(), C.clanEmblems(id)])
      if (!alive.current) return
      gmem.set(id, { d: det, cfg: ov.config || {}, list: em || [] }); setD(det); setCfg(ov.config || {}); setList(em || [])
    } catch (e) { act.say(e.message) }
  }, [id])
  useEffect(() => { load() }, [load])

  const isLeader = isManager(d?.my_role)
  const cost = Number(cfg.emblem_spin_cost || 500)
  const cost5 = Number(cfg.emblem_spin5_cost || cost * 5)
  const owned = list.filter((e) => e.owned)
  const pool = list.filter((e) => e.active)
  const w = { common: +cfg.emblem_odds_common || 0, epic: +cfg.emblem_odds_epic || 0, legend: +cfg.emblem_odds_legend || 0, mythic: +cfg.emblem_odds_mythic || 0 }
  const eff = Object.fromEntries(EMBLEM_ORDER.map((k) => [k, pool.some((e) => e.rarity === k) ? w[k] : 0]))
  const tot = Object.values(eff).reduce((a, b) => a + b, 0)
  const pctOf = (k) => (tot > 0 ? ((eff[k] / tot) * 100).toFixed(eff[k] / tot < 0.1 ? 1 : 0).replace('.0', '') : '0')
  const idle = phase !== 'rolling' && !act.busy
  const canSpin = isLeader && d && pool.length >= 1 && d.xp_available >= cost && idle
  const canSpin5 = isLeader && d && pool.length >= 1 && d.xp_available >= cost5 && idle
  const selected = list.find((e) => e.selected)
  const color = d ? colorOf(d.color) : null

  const roll = async (call) => {
    const resP = call()
    let res = null, fail = null
    resP.then((r) => { res = r }, (e) => { fail = e })
    let i = 0, delay = 80
    while (alive.current) {
      setRr(EMBLEM_ORDER[Math.floor(Math.random() * 4)])
      await sleep(delay)
      delay = Math.min(delay * 1.14, 300); i++
      if ((i >= 14 && (res || fail)) || i > 60) break
    }
    try { return await resP } catch (e) { setPhase('idle'); setRr(null); throw e }
  }
  const finish = async (best, many) => {
    if (!alive.current) return
    setRr(best.emblem.rarity); setResult(best); setMulti(many); setPhase('reveal')
    invalidateClanBadges()
    await load()
  }
  const spin = (n) => act.run(async () => {
    if (n === 1 ? !canSpin : !canSpin5) return
    setPhase('rolling'); setResult(null); setMulti(null)
    const res = await roll(() => C.clanEmblemSpin(C.newReq(), n))
    const best = res.results.reduce((a, b) => (RANK[b.emblem.rarity] > RANK[a.emblem.rarity] ? b : a))
    await finish(best, n === 1 ? null : res.results)
  })
  const pick = (emblemId) => act.run(async () => {
    if (!isLeader) { act.say('Hanya Leader & Vice Leader yang bisa memilih emblem'); return }
    await C.clanSetEmblem(emblemId)
    invalidateClanBadges(); await load()
    act.say(emblemId == null ? 'Emblem dilepas' : 'Emblem dipakai di badge clan')
  })

  const shown = phase === 'rolling' ? { image_url: MYSTERY_EMBLEM, rarity: rr } : phase === 'reveal' && result ? result.emblem : selected
  const rar = shown?.rarity ? RARITY[shown.rarity] : null

  return (
    <div className="cs-page">
      <CosmicBg />
      <div className="cs-scroll page-scroll">
        <div className="cl-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <h1>Gacha Emblem</h1>
          <span className="cl-pill gold">{d ? fmtNum(d.xp_available) : '…'} XPGold</span>
        </div>

        <div className="cl-tabs two">
          <button className={tab === 'spin' ? 'on' : ''} onClick={() => setTab('spin')}>Spin Emblem</button>
          <button className={tab === 'koleksi' ? 'on' : ''} onClick={() => setTab('koleksi')}>Koleksi ({owned.length}/{list.length})</button>
        </div>
        {act.msg && <p className="cl-toast">{act.msg}</p>}

        {tab === 'spin' && d && (
          <>
            <div className={`cg-stage ${phase} ${shown?.rarity ? 'r-' + shown.rarity : ''}`} style={rar ? { '--rc': rar.color } : undefined}>
              <i className="cg-ring" /><i className="cg-ring b" />
              <div className="cg-badge"><ClanBadge tag={d.tag} tier={d.tier} color={color} emblem={shown?.image_url || null} size={44} /></div>
              {phase === 'rolling' && <small className="cg-note">Memutar…</small>}
              {phase === 'idle' && <small className="cg-note">{selected ? 'Emblem dipakai: ' + selected.name : 'Belum memakai emblem'}</small>}
              {phase === 'reveal' && result && (
                <div className="cg-result">
                  <b style={{ color: rar?.color }}>{rar?.label}</b>
                  <strong>{result.emblem.name}</strong>
                  <small>{multi ? 'Emblem terbaik dari 5 spin' : result.dupe ? 'Sudah kamu miliki sebelumnya' : 'Emblem baru masuk koleksi!'}</small>
                </div>
              )}
            </div>

            <div className="cg-actions">
              {phase === 'reveal' && result && !multi && isLeader && <button className="cl-btn gold" disabled={act.busy} onClick={() => pick(result.emblem.id)}>Pakai emblem ini</button>}
              <div className="cg-spinrow">
                <button className="cl-btn primary" disabled={!canSpin} onClick={() => spin(1)}>
                  {phase === 'rolling' ? 'Memutar…' : `Spin ×1 · ${fmtNum(cost)}`}
                </button>
                <button className="cl-btn gold" disabled={!canSpin5} onClick={() => spin(5)}>
                  Spin ×5 · {fmtNum(cost5)}{cost * 5 > cost5 && <small>hemat {fmtNum(cost * 5 - cost5)}</small>}
                </button>
              </div>
              {!isLeader ? <p className="cl-sub" style={{ textAlign: 'center' }}>Hanya Leader & Vice Leader yang bisa spin</p>
                : pool.length === 0 ? <p className="cl-sub" style={{ textAlign: 'center' }}>Belum ada emblem di gacha</p>
                : d.xp_available < cost ? <p className="cl-sub" style={{ textAlign: 'center' }}>XPGold belum cukup</p> : null}
            </div>

            {multi && (
              <div className="cg-multi">
                {multi.map((r, i) => (
                  <button key={i} className="cg-mini" style={{ '--rc': RARITY[r.emblem.rarity].color }} onClick={() => pick(r.emblem.id)}>
                    <ClanBadge tag={d.tag} tier={d.tier} color={color} emblem={r.emblem.image_url} size={22} />
                    <b>{r.emblem.name}</b><small>{RARITY[r.emblem.rarity].label} · {r.dupe ? 'sudah punya' : 'baru'}</small>
                  </button>
                ))}
                <p className="cl-sub" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>Tekan emblem untuk memakainya</p>
              </div>
            )}

            <div className="cl-card">
              <h3>Peluang</h3>
              <div className="cg-odds">
                {EMBLEM_ORDER.map((k) => <span key={k} style={{ '--rc': RARITY[k].color }}><i />{RARITY[k].label}<b>{pctOf(k)}%</b></span>)}
              </div>
              <p>Hasil diundi di server. Emblem yang sudah dimiliki tetap bisa keluar lagi, dan punya banyak emblem tidak membuat peluang Epic, Legend, atau Mythic naik.</p>
            </div>
          </>
        )}

        {tab === 'koleksi' && (
          <>
            <p className="cl-sub">Tekan emblem yang ingin dipakai di badge clan{isLeader ? '.' : ' (hanya Leader & Vice Leader yang bisa memilih).'}</p>
            {d && (
              <button className={`cg-default ${!selected ? 'on' : ''}`} onClick={() => pick(null)}>
                <ClanBadge tag={d.tag} tier={d.tier} color={color} size={24} /><span>Tanpa emblem</span>
                {!selected && <Icon name="check" size={18} />}
              </button>
            )}
            <div className="cg-grid">
              {list.map((e) => (
                <button key={e.id} className={`cg-card ${e.owned ? '' : 'lock'} ${e.selected ? 'on' : ''}`} style={{ '--rc': RARITY[e.rarity]?.color }} disabled={!e.owned} onClick={() => pick(e.id)}>
                  {e.owned && d ? <ClanBadge tag={d.tag} tier={d.tier} color={color} emblem={e.image_url} size={26} /> : <span className="cg-q">?</span>}
                  <b>{e.owned ? e.name : '???'}</b>
                  <small>{RARITY[e.rarity]?.label}</small>
                  {e.selected && <em><Icon name="check" size={14} /></em>}
                </button>
              ))}
            </div>
            {list.length === 0 && <p className="cl-sub" style={{ textAlign: 'center' }}>Belum ada emblem di gacha.</p>}
          </>
        )}
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}
