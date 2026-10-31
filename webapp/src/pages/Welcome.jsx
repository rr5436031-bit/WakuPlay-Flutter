import { useEffect, useRef, useState } from 'react'

const THRESHOLD = 90
const VELOCITY = 0.5

export default function Welcome({ onDone, fromLogin = false }) {
  const [step, setStep] = useState(fromLogin ? 1 : 0)
  const [dy, setDy] = useState(0)
  const [phase, setPhase] = useState(fromLogin ? 'entering' : 'idle')
  const [sign, setSign] = useState(fromLogin ? 1 : -1)
  const start = useRef(null)
  const busy = useRef(fromLogin)
  useEffect(() => {
    if (!fromLogin) return
    const t = setTimeout(() => { setPhase('idle'); busy.current = false }, 450)
    return () => clearTimeout(t)
  }, [fromLogin])

  function advance(s = -1) {
    if (busy.current) return
    if (step === 0 && s > 0) { setDy(0); setPhase('idle'); return }
    busy.current = true
    setSign(s)
    setPhase('leaving')
    setTimeout(() => {
      if (step === 1 && s < 0) {
        onDone()
      } else {
        setStep(step === 0 ? 1 : 0)
        setDy(0)
        setPhase('entering')
        setTimeout(() => { setPhase('idle'); busy.current = false }, 450)
      }
    }, 320)
  }

  function onStart(e) {
    if (busy.current) return
    start.current = { y: e.touches[0].clientY, t: Date.now() }
    setPhase('drag')
  }
  function onMove(e) {
    if (!start.current) return
    setDy((e.touches[0].clientY - start.current.y) * 0.9)
  }
  function onEnd(e) {
    if (!start.current) return
    const d = e.changedTouches[0].clientY - start.current.y
    const v = Math.abs(d) / Math.max(1, Date.now() - start.current.t)
    start.current = null
    if (Math.abs(d) > THRESHOLD || v > VELOCITY) advance(d < 0 ? -1 : 1)
    else { setDy(0); setPhase('idle') }
  }

  const progress = Math.min(1, Math.abs(dy) / 220)
  const style =
    phase === 'drag'
      ? { transform: `translateY(${dy}px)`, opacity: 1 - progress * 0.8, transition: 'none' }
      : phase === 'leaving'
      ? { transform: `translateY(${sign * 110}px)`, opacity: 0, transition: 'transform .32s cubic-bezier(.4,0,1,1), opacity .32s ease' }
      : {}

  return (
    <div className="welcome" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      <header className="brandbar">
        <img decoding="async" src="./icon.png" alt="" />
      </header>

      <div className={`welcome-content ${phase === 'entering' ? 'entering' : ''} ${phase === 'idle' ? 'settle' : ''}`} style={phase === 'entering' ? { ...style, '--from': `${-sign * 70}px` } : style} key={step}>
        {step === 0 ? (
          <h1 className="welcome-title">
            <small>Selamat datang di</small>
            <b>WakuPlay</b>
            <i />
          </h1>
        ) : (
          <div className="disclaimer">
            <h1>Disclaimer</h1>
            <p>
              WakuPlay adalah aplikasi tidak resmi. Seluruh merek dagang dan hak cipta dimiliki oleh
              pemiliknya masing-masing. WakuPlay tidak menyimpan video di server sendiri; konten
              berasal dari pihak ketiga dan kami tidak bertanggung jawab atas isinya.
            </p>
            <p>
              Jika kamu pemilik hak cipta dan merasa ada konten yang melanggar, hubungi pengelola
              aplikasi agar konten dapat ditinjau. Dengan menggunakan aplikasi ini, kamu menyetujui
              kebijakan di atas.
            </p>
          </div>
        )}
      </div>

      <button className="swipe" onClick={() => advance(-1)} style={phase === 'drag' ? { opacity: 1 - progress } : undefined}>
        <span className="swipe-chevrons"><i /><i /><i /></span>
        <span className="swipe-pill"><i /></span>
        <span className="swipe-chevrons down"><i /><i /><i /></span>
        <span>{step === 0 ? 'Geser ke atas untuk lanjut' : 'Geser atas: Login · bawah: kembali'}</span>
      </button>
    </div>
  )
}
