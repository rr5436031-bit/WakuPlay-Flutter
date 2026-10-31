import { useState } from 'react'
import { Sheet, Confirm } from './ClanSheets'
import ClanBadge from './ClanBadge'
import { useAct, TIER_NAMES, MAX_TIER, colorOf } from '../lib/clanui'
import { fmtNum } from '../lib/gold'
import { invalidateClanBadges } from '../lib/clanbadge'
import { newReq, clanBuySlots, clanUpgradeTier } from '../services/clan'

export default function ClanShop({ d, cfg, isLeader, isOwner, onClose, onChanged, onGacha, onEmblem, onGone }) {
  const { busy, msg, run } = useAct()
  const [ask, setAsk] = useState(null)
  const step = Number(cfg.slot_step || 5), max = Number(cfg.max_slots || 100), slotCost = Number(cfg.slot_cost || 1000)
  const slotMax = d.slots + step > max
  const slotShort = d.xp_available < slotCost
  const tierMax = d.tier >= MAX_TIER
  const tierCost = tierMax ? 0 : Number(cfg['tier_cost_' + (d.tier + 1)] || 0)
  const tierShort = d.xp_available < tierCost
  const color = colorOf(d.color)
  const emblem = d.emblem?.image_url || null

  const go = (fn, after) => run(async () => { await fn(); invalidateClanBadges(); await onChanged(); setAsk(null); after && after() })
  const need = !isLeader ? 'Hanya Leader & Vice Leader' : null

  return (
    <Sheet title="Shop Clan" onClose={onClose}>
      <div className="cl-stats2">
        <div className="cl-stat"><span>XPGold tersedia</span><b className="gold">{fmtNum(d.xp_available)}</b></div>
        <div className="cl-stat"><span>Slot anggota</span><b>{d.members}/{d.slots}</b></div>
      </div>
      {msg && <p className="cl-warn">{msg}</p>}

      <div className="cl-card">
        <h3>Tambah +{step} slot <i>· {fmtNum(slotCost)} XPGold</i></h3>
        <p>XPGold yang dipakai hanya mengurangi XPGold tersedia. Total XP di Top Clans tidak berkurang. Slot maksimal {max}.</p>
        <div className="cl-after">Slot: <b>{d.slots}</b> → <b>{slotMax ? d.slots : d.slots + step}</b></div>
        <button className="cl-btn primary wide" disabled={busy || slotMax || slotShort || !isLeader}
          onClick={() => setAsk({ title: 'Tambah slot?', body: `${fmtNum(slotCost)} XPGold dipakai untuk menambah ${step} slot (jadi ${d.slots + step}).`, fn: () => go(() => clanBuySlots(newReq())) })}>
          {need || (slotMax ? 'Kapasitas sudah maksimal' : slotShort ? 'XPGold belum cukup' : 'Beli slot')}
        </button>
      </div>

      <div className="cl-card">
        <h3>Tier badge <i>· Tier {d.tier} ({TIER_NAMES[d.tier - 1]})</i></h3>
        <p>Naikkan tier untuk mengubah bentuk emblem clan di komentar, chat, dan profil. Naik satu tier setiap kali, tidak bisa langsung ke tier akhir.</p>
        <div className="cl-tierprev">
          <div><small>Sekarang</small><ClanBadge tag={d.tag} tier={d.tier} color={color} emblem={emblem} size={28} /></div>
          {!tierMax && <><span className="cl-arrow">→</span><div><small>Tier {d.tier + 1} · {TIER_NAMES[d.tier]}</small><ClanBadge tag={d.tag} tier={d.tier + 1} color={color} emblem={emblem} size={28} /></div></>}
        </div>
        <button className="cl-btn gold wide" disabled={busy || tierMax || tierShort || !isLeader}
          onClick={() => setAsk({ title: 'Naikkan tier?', body: `${fmtNum(tierCost)} XPGold dipakai untuk naik ke Tier ${d.tier + 1} (${TIER_NAMES[d.tier]}).`, fn: () => go(() => clanUpgradeTier(newReq())) })}>
          {need || (tierMax ? 'Tier sudah maksimal' : tierShort ? `XPGold belum cukup (${fmtNum(tierCost)})` : `Naik ke Tier ${d.tier + 1} · ${fmtNum(tierCost)} XPGold`)}
        </button>
      </div>

      <div className="cl-card">
        <h3>Warna clan</h3>
        <p>Putar gacha dengan XPGold untuk mendapat warna Common, Rare, Legend, atau Mythic. Makin langka makin mengkilap. Pilih warna favoritmu dari koleksi.</p>
        <div className="cl-row2"><ClanBadge tag={d.tag} tier={d.tier} color={color} emblem={emblem} size={28} />
          <button className="cl-btn primary" onClick={() => { onClose(); onGacha() }}>Gacha Warna</button></div>
      </div>

      <div className="cl-card">
        <h3>Emblem clan</h3>
        <p>Putar gacha dengan XPGold untuk mendapat emblem Common, Epic, Legend, atau Mythic. Emblem tampil di sisi kiri badge clan. Rarity langka (Epic, Legend, Mythic) susah didapat.</p>
        <div className="cl-row2"><ClanBadge tag={d.tag} tier={d.tier} color={color} emblem={emblem} size={28} />
          <button className="cl-btn primary" onClick={() => { onClose(); onEmblem() }}>Gacha Emblem</button></div>
      </div>

      {ask && <Confirm title={ask.title} body={ask.body} danger={ask.danger} busy={busy} onNo={() => setAsk(null)} onYes={ask.fn} />}
    </Sheet>
  )
}
