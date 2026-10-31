const el = document.createElement('video')
el.playsInline = true
el.setAttribute('playsinline', '')
el.preload = 'auto'

const park = document.createElement('div')
park.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none'
const attachPark = () => { if (document.body && park.parentNode !== document.body) document.body.appendChild(park) }

let hls = null
let curUrl = null
let curKey = null

function teardownHls() { if (hls) { try { hls.destroy() } catch { } hls = null } }

export const media = {
  el,
  get url() { return curUrl },
  get key() { return curKey },
  mount(host, className) {
    el.className = className
    if (el.parentNode !== host) host.appendChild(el)
  },
  park() { attachPark(); if (el.parentNode !== park) park.appendChild(el) },
  setSource(url, { key = null, autoplay = true, start = 0, onFatal } = {}) {
    if (!url) return 'none'
    if (curUrl === url && String(curKey) === String(key)) return 'same'
    teardownHls()
    curUrl = url; curKey = key
    el.autoplay = !!autoplay
    if (start > 0) {
      const onMeta = () => { el.removeEventListener('loadedmetadata', onMeta); if (el.currentTime < 1) el.currentTime = start }
      el.addEventListener('loadedmetadata', onMeta)
    }
    if (/\.m3u8(\?|$)/i.test(url) && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        if (curUrl !== url) return
        if (!Hls.isSupported()) return onFatal && onFatal()
        hls = new Hls()
        hls.loadSource(url)
        hls.attachMedia(el)
        hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) onFatal && onFatal() })
        if (autoplay) el.play().catch(() => {})
      }).catch(() => onFatal && onFatal())
    } else {
      el.src = url
      el.load()
      if (autoplay) el.play().catch(() => {})
    }
    return 'new'
  },
  release() {
    teardownHls()
    try { el.pause() } catch { }
    el.removeAttribute('src')
    try { el.load() } catch { }
    curUrl = null; curKey = null
    attachPark()
    if (el.parentNode !== park) park.appendChild(el)
  },
}
