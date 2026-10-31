import { isManager } from '../lib/clanrole'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { useAct, RARITY, colorOf } from '../lib/clanui'
import { fmtNum } from '../lib/gold'
import { invalidateClanBadges } from '../lib/clanbadge'
import * as C from '../services/clan'
import ClanBadge from '../components/ClanBadge'
import CosmicBg from '../components/CosmicBg'
import Icon from '../components/Icon'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RANK = { common: 0, rare: 1, legend: 2, mythic: 3 }

const gmem = new Map()

export default function ClanGacha({ id }) {
  const { nav } = useApp()
  const act = useAct()
  const [d, setD] = useState(() => gmem.get(id)?.d || null)
  const [cfg, setCfg] = useState(() => gmem.get(id)?.cfg || {})
  const [colors, setColors] = useState(() => gmem.get(id)?.colors || [])
  const [tab, setTab] = useState('spin')
  const [phase, setPhase] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [multi, setMulti] = useState(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const load = useCallback(async () => {
    try {
      const [det, ov, cl] = await Promise.all([C.clanDetail(id), C.clanOverview(), C.clanColors(id)])
      if (!alive.current) return
      gmem.set(id, { d: det, cfg: ov.config || {}, colors: cl || [] }); setD(det); setCfg(ov.config || {}); setColors(cl || [])
    } catch (e) { act.say(e.message) }
  }, [id])
  useEffect(() => { load() }, [load])

  const isLeader = isManager(d?.my_role)
  const cost = Number(cfg.spin_cost || 300)
  const w = { common: +cfg.odds_common || 0, rare: +cfg.odds_rare || 0, legend: +cfg.odds_legend || 0, mythic: +cfg.odds_mythic || 0 }
  const tot = w.common + w.rare + w.legend + w.mythic || 1
  const pctOf = (k) => ((w[k] / tot) * 100).toFixed(w[k] / tot < 0.1 ? 1 : 0).replace('.0', '')
  const owned = colors.filter((c) => c.owned)
  const cost5 = Number(cfg.spin5_cost || cost * 5)
  const canSpin = isLeader && d && d.xp_available >= cost && phase !== 'rolling'
  const canSpin5 = isLeader && d && d.xp_available >= cost5 && phase !== 'rolling'

  const roll = async (call) => {
    const resP = call()
    let res = null, fail = null
    resP.then((r) => { res = r }, (e) => { fail = e })
    let i = 0, delay = 80
    while (alive.current) {
      setPreview(colors[Math.floor(Math.random() * colors.length)])
      await sleep(delay)
      delay = Math.min(delay * 1.14, 300); i++
      if ((i >= 14 && (res || fail)) || i > 60) break
    }
    try { return await resP } catch (e) { setPhase('idle'); throw e }
  }
  const finish = async (best, list) => {
    if (!alive.current) return
    setPreview(colors.find((c) => c.id === best.color.id) || { ...best.color, owned: true })
    setResult(best); setMulti(list); setPhase('reveal')
    invalidateClanBadges()
    await load()
  }
  const spin = () => act.run(async () => {
    if (!canSpin) return
    setPhase('rolling'); setResult(null); setMulti(null)
    const res = await roll(() => C.clanSpin(C.newReq()))
    await finish(res, null)
  })
  const spin5 = () => act.run(async () => {
    if (!canSpin5) return
    setPhase('rolling'); setResult(null); setMulti(null)
    const res = await roll(() => C.clanSpin5(C.newReq()))
    const best = res.results.reduce((a, b) => (RANK[b.color.rarity] > RANK[a.color.rarity] ? b : a))
    await finish({ ...best, refund: res.refund, total: true }, res.results)
  })

  const pick = (colorId) => act.run(async () => {
    if (!isLeader) { act.say('Hanya Leader & Vice Leader yang bisa memilih warna'); return }
    await C.clanSetColor(colorId)
    invalidateClanBadges(); await load()
    act.say(colorId == null ? 'Kembali ke warna default' : 'Warna badge dipakai')
  })

  const showing = phase === 'idle' ? colors.find((c) => c.selected) : preview
  const rar = showing && RARITY[showing.rarity]

  return (
    <div className="cs-page">
      <CosmicBg />
      <div className="cs-scroll page-scroll">
        <div className="cl-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <h1>Gacha Warna</h1>
          <span className="cl-pill gold">{d ? fmtNum(d.xp_available) : '…'} XPGold</span>
        </div>

        <div className="cl-tabs two">
          <button className={tab === 'spin' ? 'on' : ''} onClick={() => setTab('spin')}>Spin Warna</button>
          <button className={tab === 'koleksi' ? 'on' : ''} onClick={() => setTab('koleksi')}>Koleksi ({owned.length}/{colors.length})</button>
        </div>
        {act.msg && <p className="cl-toast">{act.msg}</p>}

        {tab === 'spin' && d && (
          <>
            <div className={`cg-stage ${phase} ${showing ? 'r-' + showing.rarity : ''}`} style={rar ? { '--rc': rar.color } : undefined}>
              <i className="cg-ring" /><i className="cg-ring b" />
              <div className="cg-badge"><ClanBadge tag={d.tag} tier={d.tier} color={showing ? colorOf(showing) : null} size={44} /></div>
              {phase === 'rolling' && <small className="cg-note">Memutar…</small>}
              {phase === 'idle' && <small className="cg-note">{showing ? 'Warna dipakai: ' + showing.name : 'Warna default'}</small>}
              {phase === 'reveal' && result && (
                <div className="cg-result">
                  <b style={{ color: rar?.color }}>{rar?.label}</b>
                  <strong>{result.color.name}</strong>
                  {multi ? <small>Terbaik dari 5 spin{result.refund ? ` · XPGold kembali +${fmtNum(result.refund)}` : ''}</small>
                    : result.duplicate ? <small>Warna kembar · XPGold kembali +{fmtNum(result.refund)}</small> : <small>Warna baru masuk koleksi!</small>}
                </div>
              )}
            </div>

            <div className="cg-actions">
              {phase === 'reveal' && result && isLeader && <button className="cl-btn gold" disabled={act.busy} onClick={() => pick(result.color.id)}>Pakai warna ini</button>}
              <div className="cg-spinrow">
                <button className="cl-btn primary" disabled={!canSpin || act.busy} onClick={spin}>
                  {phase === 'rolling' ? 'Memutar…' : `Spin ×1 · ${fmtNum(cost)}`}
                </button>
                <button className="cl-btn gold" disabled={!canSpin5 || act.busy} onClick={spin5}>
                  Spin ×5 · {fmtNum(cost5)}<small>hemat {fmtNum(cost * 5 - cost5)}</small>
                </button>
              </div>
              {!isLeader ? <p className="cl-sub" style={{ textAlign: 'center' }}>Hanya Leader & Vice Leader yang bisa spin</p> : d.xp_available < cost ? <p className="cl-sub" style={{ textAlign: 'center' }}>XPGold belum cukup</p> : null}
            </div>

            {multi && (
              <div className="cg-multi">
                {multi.map((r, i) => (
                  <button key={i} className="cg-mini" style={{ '--rc': RARITY[r.color.rarity].color }} onClick={() => pick(r.color.id)}>
                    <ClanBadge tag={d.tag} tier={d.tier} color={colorOf(r.color)} size={22} />
                    <b>{r.color.name}</b><small>{RARITY[r.color.rarity].label}{r.duplicate ? ' · kembar' : ' · baru'}</small>
                  </button>
                ))}
                <p className="cl-sub" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>Tekan warna untuk memakainya</p>
              </div>
            )}

            <div className="cl-card">
              <h3>Peluang</h3>
              <div className="cg-odds">
                {Object.keys(RARITY).map((k) => <span key={k} style={{ '--rc': RARITY[k].color }}><i />{RARITY[k].label}<b>{pctOf(k)}%</b></span>)}
              </div>
              <p>Hasil diundi di server. Makin langka, warna makin cerah dan mengkilap. Warna kembar mengembalikan {cfg.spin_dup_refund_pct || 0}% XPGold.</p>
            </div>
          </>
        )}

        {tab === 'koleksi' && (
          <>
            <p className="cl-sub">Tekan warna yang ingin dipakai untuk badge clan{isLeader ? '.' : ' (hanya Leader & Vice Leader yang bisa memilih).'}</p>
            {d && (
              <button className={`cg-default ${!colors.some((c) => c.selected) ? 'on' : ''}`} onClick={() => pick(null)}>
                <ClanBadge tag={d.tag} tier={d.tier} color={null} size={24} /><span>Warna default</span>
                {!colors.some((c) => c.selected) && <Icon name="check" size={18} />}
              </button>
            )}
            <div className="cg-grid">
              {colors.map((c) => (
                <button key={c.id} className={`cg-card ${c.owned ? '' : 'lock'} ${c.selected ? 'on' : ''}`} style={{ '--rc': RARITY[c.rarity].color }} disabled={!c.owned} onClick={() => pick(c.id)}>
                  {c.owned && d ? <ClanBadge tag={d.tag} tier={d.tier} color={colorOf(c)} size={26} /> : <span className="cg-q">?</span>}
                  <b>{c.owned ? c.name : '???'}</b>
                  <small>{RARITY[c.rarity].label}</small>
                  {c.selected && <em><Icon name="check" size={14} /></em>}
                </button>
              ))}
            </div>
          </>
        )}
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}
