import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { media } from '../lib/media'
import { useApp } from '../context'
import { saveProgress } from '../services/db'
import Icon from './Icon'

const MARGIN = 10
const TOP_MIN = 48

function size() {
  const w = Math.min(230, Math.round(window.innerWidth * 0.56))
  return { w, h: Math.round((w * 9) / 16) }
}

export default function MiniPlayer({ mini, onClose, onExpand }) {
  const { user } = useApp()
  const { w, h } = size()
  const box = useRef(null)
  const host = useRef(null)
  const hnd = useRef({})
  const drag = useRef(null)
  const lastSave = useRef(0)
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - w - MARGIN,
    y: window.innerHeight - h - 100,
  }))
  const [snap, setSnap] = useState(false)
  const [playing, setPlaying] = useState(!!mini.playing)
  const [time, setTime] = useState(mini.time || 0)
  const [dur, setDur] = useState(mini.duration || 0)
  const [err, setErr] = useState(false)

  useLayoutEffect(() => {
    if (!host.current) return
    media.mount(host.current, 'mini-video')
    return () => media.park()
  }, [])
  useEffect(() => {
    const types = ['play', 'pause', 'loadedmetadata', 'timeupdate', 'error']
    const fns = types.map((t) => [t, (e) => hnd.current[t] && hnd.current[t](e)])
    fns.forEach(([t, f]) => media.el.addEventListener(t, f))
    const r = media.setSource(mini.url, { key: mini.episodeId, autoplay: !!mini.playing, start: mini.time || 0, onFatal: () => setErr(true) })
    const v = media.el
    if (r === 'same') { setPlaying(!v.paused); setTime(v.currentTime || 0); setDur(v.duration || 0) }
    else if (mini.playing) v.play().catch(() => {})
    return () => fns.forEach(([t, f]) => v.removeEventListener(t, f))
  }, [mini.url])
  hnd.current = {
    play: () => setPlaying(true),
    pause: () => { setPlaying(false); persist() },
    loadedmetadata: () => setDur(media.el.duration || 0),
    timeupdate: () => {
      setTime(media.el.currentTime)
      if (Date.now() - lastSave.current > 15000) { lastSave.current = Date.now(); persist() }
    },
    error: () => setErr(true),
  }

  function persist() {
    const v = media.el
    if (!user || !v.duration || v.currentTime < 3) return
    saveProgress(user.id, {
      animeId: mini.animeId, episodeId: mini.episodeId, episodeNumber: mini.episodeNumber,
      title: mini.anime?.title, poster: mini.anime?.poster, progress: v.currentTime, duration: v.duration,
    }).catch(() => {})
  }
  useEffect(() => () => persist(), [])

  function toggle(e) {
    e.stopPropagation()
    const v = media.el
    if (v.paused) v.play().catch(() => {}); else v.pause()
  }
  function close(e) { e.stopPropagation(); persist(); media.release(); onClose() }
  function expand() { persist(); onExpand({ ...mini, time: media.el.currentTime || mini.time || 0, playing: !media.el.paused }) }

  function down(e) {
    if (e.target.closest('button')) return
    box.current.setPointerCapture?.(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false }
    setSnap(false)
  }
  function move(e) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    d.moved = true
    const maxY = window.innerHeight - h - MARGIN
    setPos({
      x: Math.max(-w * 0.85, Math.min(window.innerWidth - w * 0.15, d.ox + dx)),
      y: Math.max(TOP_MIN, Math.min(maxY, d.oy + dy)),
    })
  }
  function up() {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) return expand()
    const center = pos.x + w / 2
    if (pos.x < -w * 0.45 || pos.x > window.innerWidth - w * 0.55) { persist(); media.release(); return onClose() }
    setSnap(true)
    setPos((p) => ({ ...p, x: center < window.innerWidth / 2 ? MARGIN : window.innerWidth - w - MARGIN }))
  }

  const pct = dur ? Math.min(100, (time / dur) * 100) : 0
  const outside = pos.x < 0 || pos.x > window.innerWidth - w
  return (
    <div
      ref={box}
      className={`mini ${snap ? 'snap' : ''}`}
      style={{ width: w, height: h, transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, opacity: outside ? 0.65 : 1 }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    >
      <div ref={host} className="mini-host" />
      <div className="mini-shade" />
      {err && <div className="mini-err">Tidak bisa diputar. Tap untuk buka.</div>}
      <button className="mini-x" onClick={close} aria-label="Tutup"><Icon name="close" size={16} /></button>
      <button className="mini-play" onClick={toggle} aria-label="Putar/Jeda"><Icon name={playing ? 'pause' : 'play'} size={22} /></button>
      <div className="mini-title">{mini.anime?.title}{mini.episodeNumber != null ? ` · Eps ${mini.episodeNumber}` : ''}</div>
      <div className="mini-bar"><i style={{ width: pct + '%' }} /></div>
    </div>
  )
}
