import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { warmCache, peekApi, api } from './services/animeApi'
import { getTopAnimeByViews } from './services/db'
import { warmImages, warmImagesFor, collectUrls, ensureImages } from './lib/img'
import { idbPrune } from './lib/store'
import { loadLevelCfg } from './services/levelcfg'
import { getLevelCfg, onLevelCfg } from './lib/levelcurve'
import '@fontsource-variable/montserrat'
import './index.css'

try { navigator.storage && navigator.storage.persist && navigator.storage.persist() } catch { }
const root = createRoot(document.getElementById('root'))
const animDone = new Promise((resolve) => {
  if (window.__wpAnimDone || !document.getElementById('wp-splash')) return resolve()
  window.addEventListener('wp-anim-done', () => resolve(), { once: true })
})
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const warmP = warmCache()
const warm = Promise.race([warmP.then(() => warmImagesFor(collectUrls(peekApi.home()))), wait(2500)])

async function preloadFresh() {
  await warmP
  const h = await api.home().catch(() => null)
  if (!h) return
  const top = await Promise.race([getTopAnimeByViews(10).catch(() => []), wait(1500).then(() => [])])
  const byId = new Map()
  Object.values(h).forEach((l) => { if (Array.isArray(l)) l.forEach((a) => { if (a && a.id != null && !byId.has(String(a.id))) byId.set(String(a.id), a) }) })
  const urls = []
  const both = (a) => { if (a) { urls.push(a.cover); urls.push(a.poster) } }
  ;(top || []).slice(0, 6).forEach((r) => both(byId.get(String(r.id))))
  ;(h.slider || []).slice(0, 6).forEach(both)
  ;[['fresh', 12], ['today', 12], ['hot', 8], ['popular', 9]].forEach(([k, n]) => (h[k] || []).slice(0, n).forEach((a) => a && urls.push(a.poster)))
  await ensureImages(urls.filter((u) => typeof u === 'string' && /^https?:/i.test(u)).slice(0, 54), 4000)
}
const fresh = Promise.race([preloadFresh().catch(() => {}), wait(4500)])
const lvl = Promise.race([loadLevelCfg(), wait(2500)])
let shown = false, rk = 0, hadCfg = !!getLevelCfg()
onLevelCfg(() => { if (shown && !hadCfg) root.render(<App key={++rk} />); hadCfg = true })
Promise.all([warm, fresh, animDone, lvl]).finally(() => {
  shown = true
  root.render(<App />)
  window.__wpReady = true; window.dispatchEvent(new Event('wp-ready'))
  setTimeout(() => warmImages(300), 3500)
  setTimeout(() => { idbPrune('img', 800); idbPrune('api', 150) }, 8000)
})
