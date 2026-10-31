let started = false
const start = () => { if (started) return; started = true; import('./boot.jsx') }
if (!document.getElementById('wp-splash') || window.__wpSplashGo || window.__wpAnimDone) start()
else {
  window.addEventListener('wp-splash-go', start, { once: true })
  window.addEventListener('wp-anim-done', start, { once: true })
}
