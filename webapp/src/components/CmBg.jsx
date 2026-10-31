import { useEffect, useRef, useState } from 'react'

let io = null
const cbs = new WeakMap()
function observer() {
  if (!io) io = new IntersectionObserver((es) => es.forEach((e) => cbs.get(e.target)?.(e.isIntersecting)), { rootMargin: '250px 0px' })
  return io
}
export default function CmBg({ url }) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  const [bad, setBad] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return undefined }
    cbs.set(el, setOn)
    observer().observe(el)
    return () => { observer().unobserve(el); cbs.delete(el) }
  }, [])
  return (
    <span ref={ref} className="cm-bg" aria-hidden="true">
      {on && !bad && <img src={url} alt="" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setBad(true)} />}
    </span>
  )
}
