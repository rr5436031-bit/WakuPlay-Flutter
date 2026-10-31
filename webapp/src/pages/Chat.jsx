import { isManager } from '../lib/clanrole'
import { ClanTag } from '../components/ClanBadge'
import RolePill from '../components/RolePill'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useStickBottom } from '../lib/stickbottom'
import { useApp } from '../context'
import { listChat, sendChat, deleteChat, subscribeChat, getMyProfile, listFeedback, sendFeedback, deleteFeedback, subscribeFeedback, feedbackSetStatus, mentionPreview } from '../services/db'
import { splitMentions, mentionSeqs, MAX_TAGS } from '../lib/mention'
import { nameColor } from '../lib/format'
import { levelInfo, getXps, useMyXp, refreshMyXp } from '../lib/xp'
import Icon from '../components/Icon'
import { Avatar, AutoTextarea } from '../components/ui'
import BorderFrame from '../components/BorderFrame'
import { useBorderOf } from '../lib/borders'
import ActionSheet from '../components/ActionSheet'
import { copyText } from '../lib/clipboard'
import RoleBadge from '../components/RoleBadge'
import LevelBadge from '../components/LevelBadge'
import { useStaffRoles } from '../lib/roles'
import GiftPremium from '../components/GiftPremium'
import GiveawayCreate from '../components/GiveawayCreate'
import { giveawayClaim, giveawayStates, giveawaySweep, subscribeGiveaways } from '../services/premium'
import { DiamondIcon } from '../components/PremiumBadge'
import { listClanChat, sendClanChat, deleteClanChat, subscribeClanChat } from '../services/clanchat'
import { clanOverview, clanDetail } from '../services/clan'
import { useGold, fmtNum } from '../lib/gold'
import { colorOf } from '../lib/clanui'
import { CreateClanSheet } from '../components/ClanSheets'
import ClanBadge from '../components/ClanBadge'

function Face({ m, me, user, onProfile }) {
  const [bad, setBad] = useState(false)
  const bid = useBorderOf(me ? null : m.user_id)
  if (me) return <span className="avatar-link" onClick={onProfile}><Avatar user={user} size={32} /></span>
  const el = m.user_avatar && !bad
    ? <img decoding="async" className="avatar gc-av avatar-link" src={m.user_avatar} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} onClick={onProfile} />
    : <div className="avatar avatar-fallback gc-av avatar-link" onClick={onProfile}>{(m.user_name || '?')[0].toUpperCase()}</div>
  return bid ? <BorderFrame id={bid} size={32}>{el}</BorderFrame> : el
}

function clock(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const hm = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')
  if (d.toDateString() === new Date().toDateString()) return hm
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`
}

function Body({ m, onProfile }) {
  const parts = splitMentions(m.body, m.mentions)
  if (parts.length === 1 && !parts[0].tag) return m.body
  return parts.map((x, i) => (x.tag
    ? <span key={i} className="gc-mention" role="link" onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onProfile({ user_id: x.tag.uid, user_name: x.tag.name, user_avatar: null, user_seq: x.tag.seq }) }}>{x.raw} | {x.tag.name}</span>
    : <span key={i}>{x.t}</span>))
}
const STATUS_LABEL = { done: 'Selesai', rejected: 'Ditolak' }

function GaCard({ m, ga, onClaim }) {
  const [busy, setBusy] = useState(false)
  const slots = ga?.slots ?? m.meta.slots, claimed = ga?.claimed ?? 0, days = ga?.days ?? m.meta.days
  const over = ga && (ga.status === 'ended' || (ga.expires_at && new Date(ga.expires_at).getTime() <= Date.now()))
  const left = ga?.expires_at ? Math.max(0, new Date(ga.expires_at).getTime() - Date.now()) : 0
  const hrs = Math.floor(left / 3600000), min = Math.floor((left % 3600000) / 60000)
  let label = 'Klaim', cls = 'go', can = true
  if (!ga) { label = '…'; cls = 'dim'; can = false }
  else if (ga.owner) { label = 'Punyamu'; cls = 'dim'; can = false }
  else if (ga.mine) { label = 'Diklaim ✓'; cls = 'dim'; can = false }
  else if (ga.status === 'done' || claimed >= slots) { label = 'Habis'; cls = 'dim'; can = false }
  else if (over) { label = 'Berakhir'; cls = 'dim'; can = false }
  return (
    <div className="gc-ga">
      <span className="gc-ga-ic"><DiamondIcon size={26} /></span>
      <div className="gc-ga-tx">
        <b>{days} Hari Premium</b>
        <small>{claimed}/{slots} diklaim{ga && !over && ga.status === 'open' ? ` · ${hrs}j ${min}m lagi` : ''}</small>
        {ga?.owner && Number(ga.xp) > 0 && <small className="gc-ga-xp">+{Number(ga.xp).toLocaleString('en-US')} XP didapat</small>}
      </div>
      <button className={`gc-ga-btn ${cls}`} disabled={!can || busy} onPointerDown={(e) => e.stopPropagation()} onClick={async (e) => { e.stopPropagation(); setBusy(true); await onClaim(m.meta.gid); setBusy(false) }}>{label}</button>
      {m.meta.note && <p className="gc-ga-note">{m.meta.note}</p>}
    </div>
  )
}

const Bubble = memo(function Bubble({ m, me, user, xp, staff, role, fresh, ga, onClaim, onReply, onMenu, onProfile }) {
  const ready = xp != null
  const lv = levelInfo(xp || 0).level
  const openProfile = (e) => { e.stopPropagation(); onProfile(m) }
  const canDelete = (me && (m.status == null || m.status === 'open')) || staff
  const timer = useRef(null)
  const held = useRef(false)
  const swiped = useRef(false)
  const bubRef = useRef(null)
  const icRef = useRef(null)
  const g = useRef({ id: null, x: 0, y: 0, dx: 0, mode: 0 })
  const TH = 56, MAX = 84
  const shift = (x, anim) => {
    const b = bubRef.current, ic = icRef.current
    if (!b) return
    b.style.transition = anim ? 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .2s ease-out' : 'opacity .2s ease-out'
    b.style.transform = x ? `translate3d(${x}px,0,0)` : ''
    if (ic) {
      const p = Math.min(1, x / TH)
      ic.style.opacity = String(p)
      ic.style.transform = `scale(${0.6 + 0.4 * p})`
      ic.classList.toggle('hit', x >= TH)
    }
  }
  const start = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    held.current = false; swiped.current = false
    g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, mode: 0 }
    timer.current = setTimeout(() => { held.current = true; if (navigator.vibrate) navigator.vibrate(12); onMenu(m, canDelete) }, 450)
  }
  const stop = () => clearTimeout(timer.current)
  const move = (e) => {
    const s = g.current
    if (s.id !== e.pointerId || s.mode === -1) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (s.mode === 0) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s.mode = -1; stop(); return }
      if (dx > 10 && dx > Math.abs(dy) * 1.5) {
        s.mode = 1; stop()
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { }
        if (bubRef.current) bubRef.current.style.willChange = 'transform'
      } else { if (Math.hypot(dx, dy) > 12) stop(); return }
    }
    const x = Math.max(0, dx < MAX ? dx : MAX + (dx - MAX) * 0.15)
    const was = s.dx >= TH
    s.dx = x
    shift(x, false)
    if (!was && x >= TH && navigator.vibrate) navigator.vibrate(10)
  }
  const end = (e) => {
    stop()
    const s = g.current
    if (s.id !== e.pointerId) return
    if (s.mode === 1) {
      swiped.current = true
      const ok = e.type === 'pointerup' && s.dx >= TH
      shift(0, true)
      if (bubRef.current) { const b = bubRef.current; setTimeout(() => { b.style.willChange = '' }, 260) }
      if (ok) onReply(m)
    }
    g.current = { id: null, x: 0, y: 0, dx: 0, mode: 0 }
  }
  return (
    <div className={`gc-row ${me ? 'mine' : ''} ${fresh ? 'gc-new' : ''} ${m.pending ? 'pending' : ''}`}>
      <span className="gc-swipe-ic" ref={icRef} aria-hidden="true"><Icon name="reply" size={18} /></span>
      {me ? <span className="gc-gutter" /> : <div className="gc-avcol"><div className="gc-avstick"><Face m={m} onProfile={openProfile} /></div></div>}
      <div
        ref={bubRef}
        className="gc-bubble"
        onClick={() => { if (held.current || swiped.current) { held.current = false; swiped.current = false; return } onReply(m) }}
        onPointerDown={start} onPointerUp={end} onPointerLeave={stop} onPointerCancel={end} onPointerMove={move}
        onContextMenu={(e) => e.preventDefault()}
      >
        {m.reply_to && (
          <div className="gc-quote" style={{ '--qc': nameColor(m.reply_name) }}>
            <b>{m.reply_name || 'User'}</b>
            <span>{m.reply_body}</span>
          </div>
        )}
        <div className="gc-name">
          <b className="avatar-link" style={{ color: nameColor(m.user_id) }} onClick={openProfile} onPointerDown={(e) => e.stopPropagation()}>{m.user_name || 'User'}</b>
          <RoleBadge role={role} uid={m.user_id} part="check" />
          {m.user_seq != null && <span className="gc-id">#{m.user_seq}</span>}
          <RoleBadge role={role} uid={m.user_id} part="capsule" />
        </div>
        <div className={`gc-sub ${ready ? 'ready' : ''}`}><ClanTag uid={m.user_id} /><RolePill role={role} /><LevelBadge level={lv} role={role} /></div>
        {m.kind === 'gift' && m.meta ? (
          <div className="gc-gift">
            <span className="gc-gift-ic"><DiamondIcon size={26} /></span>
            <div className="gc-gift-tx"><b>{m.meta.days} Hari Premium</b><small>Gift untuk {m.meta.to_name || 'User'}</small></div>
            <span className="gc-gift-n">+{m.meta.days}<small>hari</small></span>
          </div>
        ) : m.kind === 'giveaway' && m.meta ? (
          <GaCard m={m} ga={ga} onClaim={onClaim} />
        ) : <p><Body m={m} onProfile={onProfile} /></p>}
        <div className="gc-time">{STATUS_LABEL[m.status] && <span className={`gc-st ${m.status}`}>{STATUS_LABEL[m.status]}</span>}{clock(m.created_at)}</div>
      </div>
      {me ? <div className="gc-avcol"><div className="gc-avstick"><Face m={m} me user={user} onProfile={openProfile} /></div></div> : <span className="gc-gutter" />}
    </div>
  )
})

const tagCache = new Map()
function Composer({ user, reply, onCancelReply, onSend, onGift, onGiveaway, placeholder, tags, tagReq }) {
  const [text, setText] = useState('')
  const [pv, setPv] = useState([])
  async function send() {
    const body = text.trim()
    if (!body) return
    setText('')
    const ok = await onSend(body)
    if (!ok) setText((cur) => cur || body)
  }
  useEffect(() => {
    if (!tagReq) return
    setText((cur) => {
      const add = '@' + tagReq.seq + ' '
      if (cur.length + add.length > 500) return cur
      return cur && !/\s$/.test(cur) ? cur + ' ' + add : cur + add
    })
  }, [tagReq])
  const seqs = tags ? mentionSeqs(text) : []
  const seqKey = seqs.join(',')
  useEffect(() => {
    if (!seqKey) { setPv([]); return undefined }
    const list = seqKey.split(',')
    const fresh = (s) => { const c = tagCache.get(s); return c && Date.now() - c.t < 300000 ? c : null }
    const show = () => setPv(list.map((s) => ({ seq: s, name: tagCache.has(s) ? tagCache.get(s).name : undefined })))
    show()
    const need = list.filter((s) => !fresh(s)).slice(0, MAX_TAGS)
    if (!need.length) return undefined
    let alive = true
    const t = setTimeout(async () => {
      try {
        const rows = await mentionPreview(need.map(Number))
        const got = new Map((rows || []).map((r) => [String(r.seq), r.name]))
        need.forEach((s) => tagCache.set(s, { name: got.get(s) || null, t: Date.now() }))
        if (alive) show()
      } catch { }
    }, 400)
    return () => { alive = false; clearTimeout(t) }
  }, [seqKey])
  const tooMany = seqs.length > MAX_TAGS
  return (
    <>
      {reply && (
        <div className="gc-replybar">
          <div><b>Membalas {reply.user_name}</b><span>{reply.body}</span></div>
          <button className="iconbtn" onClick={onCancelReply} aria-label="Batal"><Icon name="close" size={18} /></button>
        </div>
      )}
      {tags && pv.length > 0 && (
        <div className="gc-tagbar">
          {pv.slice(0, MAX_TAGS).map((x) => (
            <span key={x.seq} className={`gc-tagchip ${x.name === null ? 'bad' : ''}`}>
              {x.name === undefined ? `@${x.seq} …` : x.name === null ? `@${x.seq} tidak ditemukan` : `@${x.seq} | ${x.name}`}
            </span>
          ))}
          {tooMany && <span className="gc-tagchip bad">Maksimal {MAX_TAGS} tag per pesan</span>}
        </div>
      )}
      <div className="gc-input">
        <Avatar user={user} size={44} />
        {onGift && reply && reply.user_id !== user.id && !reply.pending && <button className="gc-giftbtn" onClick={() => onGift(reply)} aria-label="Gift Premium"><DiamondIcon size={22} /></button>}
        <AutoTextarea value={text} maxLength={500} placeholder={placeholder || 'Ketik pesan...'} enterKeyHint="enter" onChange={(e) => setText(e.target.value)} />
        {onGiveaway && <button className="gc-gabtn" onClick={onGiveaway} aria-label="Buat giveaway Premium"><Icon name="gift" size={24} /></button>}
        <button className="cm-send" disabled={!text.trim() || tooMany} onClick={send} aria-label="Kirim"><Icon name="send" size={20} /></button>
      </div>
    </>
  )
}

export function Room({ room, onOnline }) {
  const { user, nav } = useApp()
  const isClan = room.kind === 'clan'
  const isFb = room.kind === 'feedback'
  const isGlobal = !isClan && !isFb
  const chan = room.channel
  const [msgs, setMsgs] = useState(null)
  const [xps, setXps] = useState({})
  const [err, setErr] = useState('')
  const [online, setOnline] = useState(false)
  const [reply, setReply] = useState(null)
  const [, tick] = useState(0)
  const seq = useRef(null)
  const [role, setRole] = useState('user')
  const list = useRef(null)
  const stick = useStickBottom(list, msgs)
  const known = useRef(new Set())
  const myId = useRef(user.id)
  const myXp = useMyXp(user.id)
  const roles = useStaffRoles()

  const animated = useRef(new Set())
  const burst = useRef([])
  const add = useCallback((row) => {
    const now = Date.now()
    burst.current = burst.current.filter((t) => now - t < 600)
    burst.current.push(now)
    if (burst.current.length <= 3) { if (animated.current.size > 400) animated.current.clear(); animated.current.add(row.id) }
    setMsgs((l) => {
      if (!l || l.some((x) => x.id === row.id)) return l
      if (row.user_id === myId.current) {
        const i = l.findIndex((x) => x.pending && x.body === row.body)
        if (i >= 0) { const c = [...l]; c[i] = { ...row, key: l[i].key }; return c }
      }
      return [...l, row].slice(-150)
    })
  }, [])

  const loadXps = useCallback(async (ids) => {
    if (!ids.length) return
    const fill = (p, r) => { const n = { ...p, ...r }; ids.forEach((id) => { if (n[id] == null) n[id] = 0 }); return n }
    try { const r = await getXps(ids); setXps((p) => fill(p, r)) } catch { setXps((p) => fill(p, {})) }
  }, [])

  useEffect(() => {
    let alive = true;
    (isClan ? listClanChat(room.clanId) : isFb ? listFeedback(chan) : listChat()).then((r) => alive && setMsgs(r)).catch((e) => { if (alive) { setMsgs([]); setErr(e?.message || 'Chat belum tersedia') } })
    getMyProfile(user.id).then((p) => { seq.current = p.seq; if (alive) setRole(p.role || 'user') }).catch(() => {})
    const subscribe = isClan ? (a, b, c) => subscribeClanChat(room.clanId, a, b, c)
      : isFb ? (a, b, c) => subscribeFeedback(chan, a, b, c, (row) => alive && setMsgs((l) => l && l.map((x) => (x.id === row.id ? { ...x, ...row } : x))))
      : subscribeChat
    const off = subscribe(
      (row) => alive && add(row),
      (old) => alive && setMsgs((l) => l && l.filter((x) => x.id !== old.id)),
      (st) => alive && setOnline(st === 'SUBSCRIBED')
    )
    const t = setInterval(() => {
      tick((n) => n + 1)
      loadXps([...known.current])
    }, 30000)
    return () => { alive = false; off(); clearInterval(t) }
  }, [user.id, add, loadXps, isClan, isFb, chan, room.clanId])
  useEffect(() => { if (onOnline) onOnline(online) }, [online, onOnline])

  useEffect(() => {
    if (!msgs) return
    const need = [...new Set(msgs.map((m) => m.user_id))].filter((id) => !known.current.has(id))
    need.forEach((id) => known.current.add(id))
    loadXps(need)
  }, [msgs, loadXps])

  const replyRef = useRef(null)
  replyRef.current = reply
  const send = useCallback(async (body) => {
    const rep = replyRef.current
    const key = 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const temp = { id: key, key, pending: true, user_id: user.id, user_name: (user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || (user.email || '').split('@')[0] || 'Kamu'), user_seq: seq.current, body, created_at: new Date().toISOString(), reply_to: rep ? rep.id : null, reply_name: rep ? rep.user_name : null, reply_body: rep ? String(rep.body || '').slice(0, 120) : null }
    stick.current = true
    animated.current.add(key)
    setMsgs((l) => (l ? [...l, temp].slice(-150) : l))
    setReply(null); setErr('')
    try {
      const row = await (isClan ? sendClanChat(user, { clanId: room.clanId, body, reply: rep }) : isFb ? sendFeedback(user, { channel: chan, body, reply: rep }) : sendChat(user, { body, reply: rep }))
      setMsgs((l) => {
        if (!l) return l
        if (l.some((x) => x.id === row.id)) return l.filter((x) => x.id !== key)
        return l.map((x) => (x.id === key ? { ...row, key } : x))
      })
      return true
    } catch (e) {
      setMsgs((l) => (l ? l.filter((x) => x.id !== key) : l))
      setErr(e?.message || 'Gagal mengirim pesan')
      return false
    }
  }, [user, isClan, isFb, chan, room.clanId])
  const remove = useCallback(async (m) => {
    if (!window.confirm('Hapus pesan ini?')) return
    try { await (isClan ? deleteClanChat(m.id) : isFb ? deleteFeedback(m.id) : deleteChat(m.id)); setMsgs((l) => l.filter((x) => x.id !== m.id)) } catch { setErr('Gagal menghapus pesan') }
  }, [isClan, isFb])
  const openProfile = useCallback((mm) => nav.push('userprofile', { uid: mm.user_id, name: mm.user_name, avatar: mm.user_avatar, seq: mm.user_seq }), [nav])
  const [menu, setMenu] = useState(null)
  const [gift, setGift] = useState(null)
  const [gaOpen, setGa] = useState(false)
  const [gaMap, setGaMap] = useState({})
  const [toast, setToast] = useState('')
  const [tagReq, setTagReq] = useState(null)
  const openMenu = useCallback((m, canDelete) => setMenu({ m, canDelete }), [])
  const flash = (t) => { setToast(t); setTimeout(() => setToast(''), 1800) }

  const gaIds = (msgs || []).filter((m) => m.kind === 'giveaway' && m.meta?.gid).map((m) => m.meta.gid)
  const gaKey = gaIds.join(',')
  const loadGa = useCallback(async (ids) => {
    if (!ids.length) return
    try { const rows = await giveawayStates(ids.slice(-100)); setGaMap((p) => { const n = { ...p }; (rows || []).forEach((r) => { n[r.id] = r }); return n }) } catch { }
  }, [])
  useEffect(() => { if (isGlobal) giveawaySweep().catch(() => {}) }, [isGlobal])
  useEffect(() => { if (gaKey) loadGa(gaKey.split(',').map(Number)) }, [gaKey, loadGa])
  useEffect(() => {
    if (!isGlobal) return undefined
    const off = subscribeGiveaways((row) => loadGa([row.id]))
    const t = setInterval(() => { if (gaKey) loadGa(gaKey.split(',').map(Number)) }, 20000)
    return () => { off(); clearInterval(t) }
  }, [gaKey, loadGa, isGlobal])
  const CLAIM_ERR = { ALREADY: 'Kamu sudah klaim giveaway ini', FULL: 'Yah, hadiahnya sudah habis', EXPIRED: 'Giveaway ini sudah berakhir', SELF: 'Tidak bisa klaim giveaway sendiri', TARGET_FULL: 'Premium kamu sudah hampir penuh (maks 365 hari)', BANNED: 'Akunmu sedang diblokir', NOT_FOUND: 'Giveaway tidak ditemukan' }
  const claim = useCallback(async (gid) => {
    try {
      const r = await giveawayClaim(gid)
      flash(r?.ok ? `Berhasil! +${r.days} hari Premium` : (CLAIM_ERR[r?.code] || 'Gagal klaim'))
    } catch (e) { flash(e?.message || 'Gagal klaim') }
    loadGa([gid])
  }, [loadGa])
  const setStatus = useCallback(async (m, st) => {
    try {
      await feedbackSetStatus(m.id, st)
      setMsgs((l) => l && l.map((x) => (x.id === m.id ? { ...x, status: st } : x)))
      flash(st === 'done' ? 'Ditandai selesai' : st === 'rejected' ? 'Ditandai ditolak' : 'Dibuka lagi')
    } catch (e) { setErr(e?.message || 'Gagal mengubah status') }
  }, [])
  const isStaff = !!roles[user.id] || ['developer', 'admin', 'moderator'].includes(role) || (isClan && !!room.leader)

  return (
    <>
      <div
        className="gc-list"
        ref={list}
      >
        {msgs === null && <p className="muted gc-empty">Memuat pesan...</p>}
        {msgs && msgs.length === 0 && !err && <p className="muted gc-empty">{isClan ? 'Belum ada pesan di clan. Sapa anggota lain!' : isFb ? (room.empty || 'Belum ada pesan.') : 'Belum ada pesan. Sapa yang lain!'}</p>}
        {err && <p className="muted small gc-empty">{err}</p>}
        {msgs && msgs.map((m) => {
          const me = m.user_id === user.id
          return <Bubble key={m.key || m.id} m={m} me={me} user={user} xp={me && myXp != null ? myXp : xps[m.user_id]} staff={isStaff} role={roles[m.user_id]} fresh={animated.current.has(m.key || m.id)} ga={m.kind === 'giveaway' ? gaMap[m.meta?.gid] : undefined} onClaim={claim} onReply={setReply} onMenu={openMenu} onProfile={openProfile} />
        })}
      </div>

      <Composer user={user} reply={reply} onCancelReply={() => setReply(null)} onSend={send} onGift={isGlobal ? (m) => setGift({ uid: m.user_id, name: m.user_name, avatar: m.user_avatar }) : null} onGiveaway={isGlobal ? () => setGa(true) : null} placeholder={room.placeholder} tags={!isClan} tagReq={tagReq} />
      {toast && <div className="cn-toast">{toast}</div>}
      {gaOpen && <GiveawayCreate onClose={() => setGa(false)} onDone={(r) => { setGa(false); refreshMyXp(user?.id); flash(Number(r?.xp) > 0 ? `Giveaway dibuat. +${Number(r.xp).toLocaleString('en-US')} XP` : 'Giveaway dibuat') }} />}
      {gift && <GiftPremium target={gift} onClose={() => setGift(null)} onDone={() => { setGift(null); setReply(null); flash('Gift Premium terkirim') }} />}
      {menu && (
        <ActionSheet
          title={menu.m.user_name}
          onClose={() => setMenu(null)}
          items={[
            { icon: 'reply', label: 'Balas', onClick: () => setReply(menu.m) },
            !isClan && menu.m.user_id !== user.id && !menu.m.pending && menu.m.user_seq != null && { icon: 'people', label: `Tag @${menu.m.user_seq}`, onClick: () => setTagReq({ n: Date.now(), seq: menu.m.user_seq }) },
            isGlobal && menu.m.user_id !== user.id && !menu.m.pending && { icon: 'gift', label: 'Gift Premium', onClick: () => setGift({ uid: menu.m.user_id, name: menu.m.user_name, avatar: menu.m.user_avatar }) },
            { icon: 'copy', label: 'Salin teks', onClick: async () => flash((await copyText(menu.m.body)) ? 'Teks disalin' : 'Gagal menyalin') },
            isFb && isStaff && !menu.m.pending && menu.m.status !== 'done' && { icon: 'check', label: 'Tandai selesai', onClick: () => setStatus(menu.m, 'done') },
            isFb && isStaff && !menu.m.pending && menu.m.status !== 'rejected' && { icon: 'close', label: 'Tolak', onClick: () => setStatus(menu.m, 'rejected') },
            isFb && isStaff && !menu.m.pending && menu.m.status && menu.m.status !== 'open' && { icon: 'repeat', label: 'Buka lagi', onClick: () => setStatus(menu.m, 'open') },
            menu.canDelete && { icon: 'trash', label: 'Hapus pesan', danger: true, onClick: () => remove(menu.m) },
          ]}
        />
      )}
    </>
  )
}

const memClan = { uid: null, ov: null, my: null }

export default function Chat() {
  const { user: me, nav, focusKey } = useApp()
  const gold = useGold()
  if (memClan.uid !== me.id) { memClan.uid = me.id; memClan.ov = null; memClan.my = null }
  const [tab, setTab] = useState('chat')
  const [online, setOnline] = useState(false)
  const [ov, setOv] = useState(memClan.ov)
  const [my, setMy] = useState(memClan.my)
  const [err, setErr] = useState('')
  const [create, setCreate] = useState(false)

  const loadClan = useCallback(async () => {
    try {
      const o = await clanOverview()
      memClan.ov = o; setOv(o)
      if (o.clan_id) {
        const d = await clanDetail(o.clan_id).catch(() => null)
        if (d) { memClan.my = d; setMy(d) }
      } else { memClan.my = null; setMy(null) }
      setErr('')
    } catch (e) { setErr(e?.message || 'Gagal memuat clan') }
  }, [])
  useEffect(() => { loadClan() }, [loadClan, focusKey])

  const hasClan = !!ov?.clan_id
  useEffect(() => {
    if (tab !== 'clan') return undefined
    const t = setInterval(loadClan, hasClan ? 30000 : 5000)
    const vis = () => { if (document.visibilityState === 'visible') loadClan() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [tab, hasClan, loadClan])

  const pick = (t) => { if (t === tab) return; setOnline(false); setTab(t); if (t === 'clan') loadClan() }
  const clanRoom = hasClan ? { kind: 'clan', clanId: ov.clan_id, leader: isManager(ov.role) } : null
  const showOnline = tab === 'chat' || !!clanRoom

  return (
    <div className="gc-page">
      <div className="gc-head">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" /></button>
        <h1>{tab === 'chat' ? 'Chat Global' : 'Chat Clan'}</h1>
        <button className="gc-fblink" onClick={() => nav.push('feedback')} aria-label="Buka Lapor dan Request">Lapor/Req</button>
        {showOnline && <span className={`gc-online ${online ? 'on' : ''}`}><i />{online ? 'Online' : 'Menyambung'}</span>}
      </div>
      <div className="lb-tabs cc-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => pick('chat')}>Chat</button>
        <button role="tab" aria-selected={tab === 'clan'} className={tab === 'clan' ? 'on' : ''} onClick={() => pick('clan')}>Clan</button>
      </div>

      {tab === 'chat' && <Room key="global" room={{ kind: 'global' }} onOnline={setOnline} />}

      {tab === 'clan' && (
        clanRoom ? (
          <>
            <button className="cc-bar" onClick={() => nav.push('clandetail', { id: ov.clan_id })} aria-label="Buka halaman clan">
              <ClanBadge tag={ov.clan?.tag || my?.tag || ''} tier={my?.tier || 1} color={colorOf(my?.color)} emblem={my?.emblem?.image_url} size={22} />
              <b>{ov.clan?.name || my?.name || 'Clan'}</b>
              <Icon name="chevron" size={16} />
            </button>
            <Room key={`clan-${ov.clan_id}`} room={clanRoom} onOnline={setOnline} />
          </>
        ) : !ov ? (
          <div className="cc-none">
            {err ? <><p className="muted">{err}</p><button className="cl-btn ghost" onClick={loadClan}>Coba lagi</button></> : <p className="muted">Memuat…</p>}
          </div>
        ) : (
          <div className="cc-none">
            <span className="cc-none-ic"><Icon name="people" size={36} /></span>
            <h2>Kamu belum punya clan</h2>
            <p>Gabung clan atau buat clan sendiri untuk ngobrol bareng anggota clanmu.</p>
            <div className="cc-none-btns">
              <button className="cl-btn primary" onClick={() => nav.push('clans')}>Gabung Clan</button>
              <button className="cl-btn ghost" onClick={() => setCreate(true)}>Buat Clan · {fmtNum(ov.config?.create_cost || 3500)}</button>
            </div>
            {err && <p className="muted small">{err}</p>}
          </div>
        )
      )}
      {create && <CreateClanSheet cfg={ov?.config} gold={gold} onClose={() => setCreate(false)} onDone={() => { setCreate(false); loadClan() }} />}
    </div>
  )
}
