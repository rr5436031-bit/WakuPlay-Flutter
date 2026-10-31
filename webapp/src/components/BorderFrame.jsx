import { useEffect, useRef } from 'react'
import { borderArt, borderImg, IMG_SCALE } from '../lib/borderArt'
import { BORDER_URL_RE } from '../lib/borderUrl'
import '../borders.css'

let io = null
function watch(el) {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  if (!io) io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('off', !e.isIntersecting)), { rootMargin: '60px' })
  io.observe(el)
  return () => io.unobserve(el)
}

export default function BorderFrame({ id, size, children, still, src }) {
  const imgUrl = (src && (BORDER_URL_RE.test(src) || /^blob:/.test(src)) ? src : null) || borderImg(id)
  const img = !!imgUrl
  const art = img ? null : borderArt(id)
  const ref = useRef(null)
  useEffect(() => { const el = ref.current; if (el && (art || img)) return watch(el) }, [art, img])
  if (img) {
    const pad = ((IMG_SCALE - 1) / 2) * 100
    return (
      <span ref={ref} className="bdw bdw-img" style={{ width: size, height: size }}>
        {children}
        <img className="bd-img" src={imgUrl} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer"
          style={{ left: `-${pad}%`, top: `-${pad}%`, width: `${IMG_SCALE * 100}%`, height: `${IMG_SCALE * 100}%` }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
      </span>
    )
  }
  if (!art) return children
  return (
    <span ref={ref} className="bdw" style={{ width: size, height: size }}>
      <svg className={`bd bd-b ${still ? 'still' : ''}`} viewBox="-15 -15 180 180" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={art.b} />
      {children}
      {art.f.__html && <svg className={`bd bd-f ${still ? 'still' : ''}`} viewBox="-15 -15 180 180" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={art.f} />}
    </span>
  )
}
