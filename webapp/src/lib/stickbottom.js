import { useEffect, useLayoutEffect, useRef } from 'react'

const SETTLE_MS = 2500
const RESHOW_MS = 900

export function useStickBottom(list, msgs) {
  const stick = useRef(true)
  const until = useRef(0)
  const first = useRef(false)
  const lastUser = useRef(0)
  const lastGap = useRef(0)
  const timer = useRef(0)

  const settle = (el, ms) => {
    el.classList.add('gc-settle')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { el.classList.remove('gc-settle') }, ms)
  }

  useLayoutEffect(() => {
    const el = list.current
    if (el && msgs != null && !first.current) {
      first.current = true; stick.current = true
      until.current = Date.now() + SETTLE_MS
      settle(el, SETTLE_MS)
    }
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [msgs, list])

  useEffect(() => {
    const el = list.current
    if (!el) return undefined
    let raf = 0, hidden = el.clientHeight === 0
    const pin = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (stick.current || Date.now() < until.current) el.scrollTop = el.scrollHeight
      })
    }
    const onScroll = () => {
      if (el.clientHeight === 0) return
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (near) stick.current = true
      else if (Date.now() - lastUser.current < 1500) stick.current = false
      lastGap.current = Math.max(el.scrollHeight - el.scrollTop - el.clientHeight, 0)
    }
    const onUser = () => { until.current = 0; lastUser.current = Date.now() }
    const reshow = () => {
      settle(el, RESHOW_MS)
      if (stick.current) { until.current = Date.now() + RESHOW_MS; el.scrollTop = el.scrollHeight; pin() }
      else requestAnimationFrame(() => { el.scrollTop = Math.max(el.scrollHeight - el.clientHeight - lastGap.current, 0) })
    }
    const onResize = () => {
      if (el.clientHeight === 0) { hidden = true; return }
      if (hidden) { hidden = false; reshow(); return }
      pin()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('touchstart', onUser, { passive: true })
    el.addEventListener('touchmove', onUser, { passive: true })
    el.addEventListener('wheel', onUser, { passive: true })
    el.addEventListener('load', pin, true)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    const watched = new WeakSet()
    const watch = () => { if (ro) Array.from(el.children).forEach((c) => { if (!watched.has(c)) { watched.add(c); ro.observe(c) } }) }
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { watch(); pin() }) : null
    if (mo) mo.observe(el, { childList: true, subtree: true })
    if (ro) { ro.observe(el); watch() }
    const iv = setInterval(() => { if (Date.now() < until.current) pin() }, 120)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(pin).catch(() => {})
    return () => {
      el.removeEventListener('scroll', onScroll); el.removeEventListener('touchstart', onUser); el.removeEventListener('touchmove', onUser); el.removeEventListener('wheel', onUser)
      el.removeEventListener('load', pin, true)
      mo && mo.disconnect(); ro && ro.disconnect(); clearInterval(iv); cancelAnimationFrame(raf); clearTimeout(timer.current)
      el.classList.remove('gc-settle')
    }
  }, [list])
  return stick
}
