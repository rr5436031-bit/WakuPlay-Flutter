import { useRef, useState } from 'react'
import { signInWithGoogle } from '../lib/auth'
import { checkDeviceBan } from '../lib/ban'
import BanPopup from '../components/BanPopup'

function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.9 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

const BACK_THRESHOLD = 90
const BACK_VELOCITY = 0.5

export default function Login({ onBack }) {
  const [loading, setLoading] = useState(false)
  const [dy, setDy] = useState(0)
  const [phase, setPhase] = useState('idle')
  const start = useRef(null)
  const busy = useRef(false)

  function onStart(e) {
    if (busy.current || loading) return
    start.current = { y: e.touches[0].clientY, t: Date.now() }
  }
  function onMove(e) {
    if (!start.current) return
    const d = e.touches[0].clientY - start.current.y
    if (d <= 0) { if (phase === 'drag') { setDy(0); setPhase('idle') } return }
    if (phase !== 'drag') setPhase('drag')
    setDy(d * 0.9)
  }
  function onEnd(e) {
    if (!start.current) return
    const d = e.changedTouches[0].clientY - start.current.y
    const v = d / Math.max(1, Date.now() - start.current.t)
    start.current = null
    if (d > BACK_THRESHOLD || (d > 30 && v > BACK_VELOCITY)) {
      busy.current = true
      setPhase('leaving')
      setTimeout(() => onBack && onBack(), 300)
    } else { setDy(0); setPhase('idle') }
  }

  const progress = Math.min(1, dy / 220)
  const style =
    phase === 'drag'
      ? { transform: `translateY(${dy}px)`, opacity: 1 - progress * 0.8, transition: 'none' }
      : phase === 'leaving'
      ? { transform: 'translateY(110px)', opacity: 0, transition: 'transform .3s cubic-bezier(.4,0,1,1), opacity .3s ease' }
      : { transition: 'transform .45s cubic-bezier(.22,1.2,.36,1), opacity .3s ease' }

  const [error, setError] = useState('')
  const [ban, setBan] = useState(null)

  async function onLogin() {
    setError('')
    setLoading(true)
    try {
      const b = await checkDeviceBan()
      if (b) { setBan(b); return }
      await signInWithGoogle()
    } catch (e) {
      setError(e?.message || 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    {ban && <BanPopup ban={ban} onClose={() => setBan(null)} />}
    <div className="login" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      <div className="login-body" style={style}>
      <div className="login-hint"><span className="swipe-chevrons down"><i /><i /><i /></span><small>Geser ke bawah untuk kembali</small></div>
      <div className="login-center">
        <img decoding="async" className="login-logo" src="./icon.png" alt="" />
        <h1 className="login-title">Lojin geogle</h1>
        <p className="login-sub">WakuPlay</p>
      </div>
      <div className="login-bottom">
        {error && <p className="err">{error}</p>}
        <button className="google-btn" onClick={onLogin} disabled={loading}>
          <GoogleG />
          <span>{loading ? 'Memproses...' : 'Lanjut pakai Google'}</span>
        </button>
        <p className="login-foot">Dengan login, kamu setuju dengan disclaimer aplikasi.</p>
      </div>
      </div>
    </div>
    </>
  )
}
