import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context'
import { useGold, fmtNum } from '../lib/gold'
import { setGoldLocal } from '../lib/gold'
import { setMyBanner } from '../services/db'
import { gachaInfo, gachaInventory, gachaSummon, RARITY, RARITY_ORDER } from '../services/gacha'
import Icon from '../components/Icon'
import GoldCoin from '../components/GoldCoin'
import CosmicBg from '../components/CosmicBg'

const Sparkle = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 6.3L21 10l-6.8 1.7L12 18l-2.2-6.300L3 10l6.800-1.700z" fill="currentColor" /></svg>
)
const short = (n) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}K` : fmtNum(n))
const Img = ({ src, alt }) => <img className="gw-img" src={src} alt={alt || ''} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} />

export default function Gacha() {
  const { nav } = useApp()
  const gold = useGold()
  const [info, setInfo] = useState(null)
  const [inv, setInv] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [result, setResult] = useState(null)
  const [hero, setHero] = useState(null)
  const [view, setView] = useState(null)
  const [list, setList] = useState(false)
  const [bnMsg, setBnMsg] = useState('')

  const load = useCallback(async () => {
    try { const [i, v] = await Promise.all([gachaInfo(), gachaInventory()]); setInfo(i); setInv(v) }
    catch (e) { setMsg(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const c1 = info?.cost1 ?? 100, c10 = info?.cost10 ?? 1000
  const empty = info && info.total === 0
  const need = (c) => gold != null && gold < c

  async function summon(n) {
    if (busy || !info) return
    const cost = n === 1 ? c1 : c10
    if (need(cost)) { setMsg(`WakuGold tidak cukup (butuh ${fmtNum(cost)}).`); return }
    setBusy(true); setMsg('')
    try {
      const r = await gachaSummon(n)
      setGoldLocal(Number(r.gold))
      const best = [...r.results].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))[0]
      setHero(best); setResult(r)
      load()
    } catch (e) { setMsg(e.message) }
    setBusy(false)
  }
  async function setBanner(w) {
    setBnMsg('')
    try { await setMyBanner(w.image_url); setBnMsg('Banner dipasang!') }
    catch (e) { setBnMsg(e.message) }
  }
  const per = (n, c) => Math.floor(c / n)
  const dupeBack = info ? Math.floor((per(1, c1) * (info.refund_pct || 0)) / 100) : 0
  const rows = useMemo(() => (info?.rarity || []), [info])

  return (
    <div className="cs-page">
      <CosmicBg />
      <div className="cs-scroll gw page-scroll">
        <div className="gw-top">
          <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" size={26} /></button>
          <h1>Gacha Wallpaper</h1>
        </div>

        <div className="gw-bal"><GoldCoin size={26} /><b>{gold == null ? '…' : fmtNum(gold)}</b><span>WakuGold</span></div>

        <div className="gw-hero">
          {hero ? <Img src={hero.image_url} alt={hero.name} /> : <div className="gw-hero-bg" />}
          <div className="gw-hero-shade" />
          <h2>Wallpaper Summon</h2>
          {hero ? (
            <div className="gw-hero-cap" style={{ '--rc': RARITY[hero.rarity].color }}><b>{hero.name}</b><em>{RARITY[hero.rarity].label}</em></div>
          ) : (
            <div className="gw-hero-empty"><span className="gw-spark"><Sparkle size={64} /></span><p>Wallpaper langka akan muncul di sini setelah summon.</p></div>
          )}
        </div>

        <div className="gw-btns">
          <button className="gw-sum one" disabled={busy || empty} onClick={() => summon(1)}>
            <b>Summon 1x</b><span className="gw-price"><GoldCoin size={18} />{short(c1)}</span>
          </button>
          <button className="gw-sum ten" disabled={busy || empty} onClick={() => summon(10)}>
            <b>Summon 10x</b><span className="gw-price"><GoldCoin size={18} />{short(c10)}</span>
          </button>
        </div>
        {busy && <p className="gw-note">Memanggil wallpaper…</p>}
        {empty && <p className="gw-note warn">Belum ada wallpaper di gacha. Tunggu developer menambahkannya.</p>}
        {!empty && gold != null && gold < c1 && !msg && <p className="gw-note warn">WakuGold tidak cukup (butuh minimal {fmtNum(c1)}).</p>}
        {msg && <p className="gw-note warn">{msg}</p>}

        <div className="gw-sec"><h3>Koleksi Wallpaper</h3><span className="gw-cnt">{inv ? inv.length : 0}</span><button className="gw-link" onClick={load}>Refresh</button></div>
        {inv && inv.length === 0 ? (
          <div className="gw-emptybox"><Icon name="image" size={34} /><b>Belum ada wallpaper</b><span>Summon dulu untuk mengoleksi wallpaper pertamamu.</span></div>
        ) : (
          <div className="gw-grid">
            {(inv || []).map((w) => (
              <button key={w.id} className="gw-card" style={{ '--rc': RARITY[w.rarity].color }} onClick={() => { setView(w); setBnMsg('') }}>
                <Img src={w.image_url} alt={w.name} />
                <span className="gw-tag">{RARITY[w.rarity].label}</span>
                {w.count > 1 && <span className="gw-x">×{w.count}</span>}
                <b>{w.name}</b>
              </button>
            ))}
          </div>
        )}

        {info && info.total > 0 && (
          <div className="gw-rates">
            <h3>Peluang Summon</h3>
            <div className="gw-bar">{[...rows].reverse().map((r) => <i key={r.rarity} style={{ width: `${r.pct}%`, background: RARITY[r.rarity].color }} />)}</div>
            <div className="gw-chips">
              {rows.map((r) => (
                <div key={r.rarity} className="gw-chip"><i style={{ background: RARITY[r.rarity].color }} /><span>{RARITY[r.rarity].label}</span><b style={{ color: RARITY[r.rarity].color }}>{Number(r.pct).toFixed(2)}%</b></div>
              ))}
            </div>
            <p className="gw-info"><Icon name="repeat" size={16} /> Dapat yang sudah dimiliki? {info.refund_pct}% WakuGold kembali otomatis{dupeBack ? ` (+${dupeBack} per tarikan)` : ''}.</p>
            <p className="gw-info"><Icon name="shield" size={16} /> Hasil diundi di server. Peluang di atas adalah angka asli.</p>
            <button className="gw-listbtn" onClick={() => setList((v) => !v)}>Peluang tiap wallpaper ({info.total})<Icon name="chevron" size={18} /></button>
            {list && (
              <div className="gw-list">
                {info.list.map((w) => (
                  <div key={w.id} className="gw-li"><i style={{ background: RARITY[w.rarity].color }} /><span>{w.name}{w.owned && <em> ✓</em>}</span><b>{Number(w.pct).toFixed(3)}%</b></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {result && (
        <div className="gw-bg" onClick={() => setResult(null)}>
          <div className="gw-pop" onClick={(e) => e.stopPropagation()}>
            <h3>Hasil Summon</h3>
            <div className={`gw-res ${result.results.length > 1 ? 'many' : ''}`}>
              {result.results.map((w, k) => (
                <div key={k} className="gw-rc" style={{ '--rc': RARITY[w.rarity].color }}>
                  <Img src={w.image_url} alt={w.name} />
                  <span className="gw-tag">{RARITY[w.rarity].label}</span>
                  {w.dupe && <span className="gw-dupe">Duplikat</span>}
                  <b>{w.name}</b>
                </div>
              ))}
            </div>
            {result.refund > 0 && <p className="gw-info center">Duplikat dikembalikan <b>+{fmtNum(result.refund)}</b> WakuGold</p>}
            <button className="gw-ok" onClick={() => setResult(null)}>Oke</button>
          </div>
        </div>
      )}

      {view && (
        <div className="gw-bg" onClick={() => setView(null)}>
          <div className="gw-pop" onClick={(e) => e.stopPropagation()}>
            <div className="gw-rc big" style={{ '--rc': RARITY[view.rarity].color }}>
              <Img src={view.image_url} alt={view.name} />
              <span className="gw-tag">{RARITY[view.rarity].label}</span>
              <b>{view.name}</b>
            </div>
            {bnMsg && <p className={`gw-info center ${bnMsg === 'Banner dipasang!' ? 'okk' : 'bad'}`}>{bnMsg}</p>}
            <button className="gw-ok" onClick={() => setBanner(view)}>Pasang jadi banner profil</button>
            <button className="gw-link center" onClick={() => setView(null)}>Tutup</button>
          </div>
        </div>
      )}
    </div>
  )
}
