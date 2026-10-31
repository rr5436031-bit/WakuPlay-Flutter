import Icon from './Icon'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadImageNative, peekImage, subscribeImages } from '../lib/img'
import { errorMessage } from '../services/animeApi'
import BorderFrame from './BorderFrame'
import { useBorderOf } from '../lib/borders'

export function Button({ variant = 'primary', icon, children, className = '', ...p }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...p}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}

export function Toggle({ on, onChange }) {
  return (
    <button role="switch" aria-checked={on} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

export function Chip({ children, active, onClick }) {
  return <button className={`chip ${active ? 'active' : ''}`} onClick={onClick}>{children}</button>
}

export function SectionHeader({ title, action, onAction }) {
  const [first, ...rest] = String(title).split(' ')
  return (
    <div className="section-header">
      <h2><b>{first}</b>{rest.length ? ' ' + rest.join(' ') : ''}</h2>
      {action && <button className="link" onClick={onAction}>{action} &gt;</button>}
    </div>
  )
}

export function Skeleton({ style, className = '' }) {
  return <div className={`skeleton ${className}`} style={style} />
}

export function GridSkeleton({ count = 6 }) {
  return (
    <div className="grid3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton style={{ aspectRatio: '0.72', borderRadius: 14 }} />
          <Skeleton style={{ height: 10, width: '80%', marginTop: 8 }} />
          <Skeleton style={{ height: 10, width: '55%', marginTop: 6 }} />
        </div>
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state">
      <p>{errorMessage(error)}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Coba lagi</Button>}
    </div>
  )
}

export function EmptyState({ title, text }) {
  return (
    <div className="state">
      {title && <strong>{title}</strong>}
      {text && <p>{text}</p>}
    </div>
  )
}

export function SearchBar({ value, onChange, onClick, readOnly, autoFocus, placeholder = 'Cari Anime Di Sini' }) {
  return (
    <div className="searchbar" onClick={onClick}>
      <Icon name="search" size={22} />
      <input
        value={value || ''}
        readOnly={readOnly}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={readOnly ? { pointerEvents: 'none' } : undefined}
      />
    </div>
  )
}

export function Poster({ src, alt = '' }) {
  const box = useRef(null)
  const [url, setUrl] = useState(() => (src ? peekImage(src) : null))
  const [bad, setBad] = useState(false)
  const [visible, setVisible] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    setBad(false)
    const hit = src ? peekImage(src) : null
    if (hit) {
      setUrl(hit)
      if (hit.startsWith('data:')) loadImageNative(src).catch(() => {})
      return
    }
    setUrl(null)
    if (!src || !visible) return
    loadImageNative(src).then((u) => {
      if (!alive) return
      setUrl(u || src)
    })
    return () => { alive = false }
  }, [src, visible, attempt])

  useEffect(() => {
    if (!src || (url && !url.startsWith('data:'))) return
    return subscribeImages(() => { const hit = peekImage(src); if (hit && hit !== url && !hit.startsWith('data:')) { setBad(false); setUrl(hit) } })
  }, [url, src])

  function onError() {
    if (attempt < 2) setTimeout(() => { setUrl(null); setAttempt((n) => n + 1) }, 1200 * (attempt + 1))
    else setBad(true)
  }

  return (
    <div ref={box} style={{ width: '100%', height: '100%' }}>
      {!src || bad || !url
        ? <div className="poster-ph" />
        : <img className="poster-img" src={url} alt={alt} referrerPolicy="origin" decoding="async" onError={onError} />}
    </div>
  )
}

export function Avatar({ user, size = 52, plain }) {
  const meta = user?.user_metadata || {}
  const [bad, setBad] = useState(false)
  const bid = useBorderOf(plain || size < 30 ? null : user?.id)
  const initial = (meta.display_name || meta.full_name || meta.name || user?.email || '?').trim()[0]?.toUpperCase()
  const el = meta.avatar_url && !bad
    ? <img decoding="async" className="avatar" style={{ width: size, height: size }} src={meta.avatar_url} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} />
    : <div className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</div>
  return bid ? <BorderFrame id={bid} size={size}>{el}</BorderFrame> : el
}

export function UserFace({ url, name, size = 48, uid }) {
  const [bad, setBad] = useState(false)
  const bid = useBorderOf(size < 30 ? null : uid)
  const el = url && !bad
    ? <img decoding="async" className="avatar" style={{ width: size, height: size }} src={url} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} />
    : <div className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?')[0].toUpperCase()}</div>
  return bid ? <BorderFrame id={bid} size={size}>{el}</BorderFrame> : el
}

export function AutoTextarea({ value, onChange, className = '', ...rest }) {
  const ref = useRef(null)
  const prev = useRef(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const len = String(value || '').length
    if (len < prev.current || len === 0) el.style.height = 'auto'
    if (len === 0) { el.style.height = ''; prev.current = 0; return }
    if (el.scrollHeight > el.clientHeight + 1 || len < prev.current) el.style.height = Math.min(el.scrollHeight, 128) + 'px'
    prev.current = len
  }, [value])
  return <textarea ref={ref} rows={1} className={className} value={value} onChange={onChange} {...rest} />
}
