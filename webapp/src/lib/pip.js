import { useEffect } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { isWatching } from './xp'
import { useSettings } from './settings'

export const Pip = Capacitor.isNativePlatform() ? registerPlugin('Pip') : null

export const setLandscape = (on) => { if (Pip) Pip.setLandscape({ enabled: !!on }).catch(() => {}) }
export const setImmersive = (on) => { if (Pip) Pip.setImmersive({ enabled: !!on }).catch(() => {}) }

export function useInsets() {
  useEffect(() => {
    if (!Pip) return
    let last = { top: 0, bottom: 0, kb: 0 }
    let baseH = window.innerHeight
    const apply = (i) => {
      if (i) last = { top: i.top || 0, bottom: i.bottom || 0, kb: i.kb || 0 }
      const r = document.documentElement.style
      if (last.kb <= 0) baseH = Math.max(baseH, window.innerHeight)
      const shrunk = Math.max(0, baseH - window.innerHeight)
      const kb = last.kb > 0 ? Math.max(0, last.kb - shrunk) : 0
      r.setProperty('--sat', `${Math.max(0, last.top)}px`)
      r.setProperty('--sab', `${Math.max(0, last.bottom)}px`)
      r.setProperty('--kb', `${Math.round(kb)}px`)
      r.setProperty('--sabx', kb > 0 || last.kb > 0 ? '0px' : `${Math.max(0, last.bottom)}px`)
      document.documentElement.classList.toggle('kb-open', last.kb > 0)
    }
    Pip.getInsets().then(apply).catch(() => {})
    let h
    Pip.addListener('insets', apply).then((x) => { h = x }).catch(() => {})
    const onResize = () => apply()
    window.addEventListener('resize', onResize)
    return () => { h && h.remove(); window.removeEventListener('resize', onResize) }
  }, [])
}

export function useImmersive() {
  useInsets()
  const s = useSettings()
  const on = s.fullscreen !== false
  useEffect(() => {
    if (!Pip) return
    setLandscape(false)
    setImmersive(on)
    const re = () => { if (document.visibilityState === 'visible') setImmersive(on) }
    document.addEventListener('visibilitychange', re)
    return () => document.removeEventListener('visibilitychange', re)
  }, [on])
}

const videos = () => [...document.querySelectorAll('video')]

export function usePip() {
  useEffect(() => {
    if (!Pip) return
    let armed = null
    let inPip = false
    let wasWatching = false
    const t = setInterval(async () => {
      const w = isWatching()
      if (!inPip) wasWatching = w
      if (w !== armed) {
        armed = w
        try { await Pip.setActive({ active: w }) } catch { }
      }
      let now = inPip
      try { now = !!(await Pip.isActive()).active } catch { return }
      if (now === inPip) return
      inPip = now
      document.documentElement.classList.toggle('in-pip', now)
      if (now) {
        if (wasWatching) videos().forEach((v) => { if (v.paused && !v.ended) v.play().catch(() => {}) })
      } else if (document.hidden) {
        videos().forEach((v) => v.pause())
      }
    }, 1000)
    return () => { clearInterval(t); document.documentElement.classList.remove('in-pip') }
  }, [])
}
