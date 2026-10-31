(function () {
  if (window.__wpGif) return
  window.__wpGif = true
  var URL_RE = /https:\/\/[^\s"'<>()\\]+?\.gif(?:\?[^\s"'<>()\\]*)?/i
  var roots = []
  var sent = ''
  var t0 = Date.now()
  var st = document.createElement('style')
  st.textContent = '[data-wpx]{display:none!important}html.wp-pending body{visibility:hidden!important}'
  document.documentElement.appendChild(st)
  document.documentElement.classList.add('wp-pending')
  function reveal() { document.documentElement.classList.remove('wp-pending') }
  setTimeout(reveal, 5000)

  function big(el) { var r = el.getBoundingClientRect(); return r.width >= 150 && r.height >= 70 }
  function findDrop() {
    var inp = document.querySelector('input[type=file]')
    if (!inp) return null
    var el = inp
    for (var i = 0; i < 7 && el.parentElement && el.parentElement !== document.body; i++) {
      el = el.parentElement
      if (big(el)) return el
    }
    return inp.parentElement || inp
  }
  function findResult() {
    if (!window.__wpUploaded) return null
    var i, el, m, list = document.querySelectorAll('input,textarea')
    for (i = 0; i < list.length; i++) { el = list[i]; if (el.type !== 'file' && (m = URL_RE.exec(el.value || ''))) return { el: el, url: m[0] } }
    list = document.querySelectorAll('a[href]')
    for (i = 0; i < list.length; i++) { el = list[i]; if ((m = URL_RE.exec(el.href || ''))) return { el: el, url: m[0] } }
    list = document.querySelectorAll('body *')
    for (i = 0; i < list.length; i++) { el = list[i]; if (el.children.length === 0 && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && (m = URL_RE.exec(el.textContent || ''))) return { el: el, url: m[0] } }
    return null
  }
  function box(el) {
    var p = el
    for (var i = 0; i < 4 && p.parentElement && p.parentElement !== document.body && p.parentElement.innerText.length < 400; i++) p = p.parentElement
    return p
  }
  function relevant(el) { for (var i = 0; i < roots.length; i++) if (roots[i] === el || roots[i].contains(el) || el.contains(roots[i])) return true; return false }
  function apply() {
    var drop = findDrop()
    if (!drop) { if (Date.now() - t0 > 6000) reveal(); return }
    roots = [drop]
    var res = findResult()
    if (res) {
      roots.push(box(res.el))
      if (res.url !== sent) { sent = res.url; try { WPGif.url(res.url) } catch (e) {} }
    }
    var all = document.querySelectorAll('body *')
    for (var i = 0; i < all.length; i++) {
      var el = all[i]
      if (el === st || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue
      if (relevant(el)) el.removeAttribute('data-wpx'); else el.setAttribute('data-wpx', '1')
    }
    for (var r = 0; r < roots.length; r++) for (var p = roots[r].parentElement; p && p !== document.body; p = p.parentElement) p.removeAttribute('data-wpx')
    reveal()
  }
  var timer = null
  function later() { if (timer) return; timer = setTimeout(function () { timer = null; apply() }, 150) }
  new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, attributes: false, characterData: true })
  document.addEventListener('input', later, true)
  window.__wpGifApply = apply
  apply()
})()
