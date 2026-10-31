(function () {
  if (window.__wpPayRunning) return
  window.__wpPayRunning = true
  var F = window.__WPFILL || {}
  var S = { amount: 0, name: 0, email: 0, message: 0, boxes: 0, next: 0, qris: 0, pay: 0 }
  var started = Date.now()

  function vis(el) { var r = el.getBoundingClientRect(); var cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  function txt(el) { return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() }
  function ctx(el) {
    var s = [el.getAttribute('aria-label'), el.placeholder, el.name, el.id]
    if (el.labels && el.labels[0]) s.push(txt(el.labels[0]))
    var p = el.parentElement
    for (var i = 0; i < 3 && p; i++, p = p.parentElement) { var t = txt(p); if (t && t.length < 90) { s.push(t); break } }
    return s.filter(Boolean).join(' ').toLowerCase()
  }
  function setVal(el, v) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
  }
  function fill(el, key, v) {
    if (v === undefined || v === null || v === '') return
    v = String(v)
    if (el.value !== v) { if (S[key] < 6) { S[key]++; setVal(el, v) } }
  }
  function clickBtn(re) {
    var els = document.querySelectorAll('button, [role="button"], a, input[type="submit"]')
    for (var i = 0; i < els.length; i++) {
      var t = txt(els[i]) || els[i].value || ''
      if (re.test(t) && vis(els[i]) && !els[i].disabled) { els[i].click(); return true }
    }
    return false
  }

  function formStep() {
    var inputs = document.querySelectorAll('input, textarea')
    var seen = 0
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i]; if (!vis(el)) continue
      var ty = (el.type || 'text').toLowerCase()
      if (ty === 'checkbox' || ty === 'radio' || ty === 'hidden' || ty === 'button' || ty === 'submit') continue
      var c = ctx(el)
      if (ty === 'email' || /email/.test(c)) { fill(el, 'email', F.email); seen++ }
      else if (el.tagName === 'TEXTAREA' || /pesan|message/.test(c)) { fill(el, 'message', F.message); seen++ }
      else if (/nama|name/.test(c) && !/nominal/.test(c)) { fill(el, 'name', F.name); seen++ }
      else if (ty === 'number' || ty === 'tel' || el.inputMode === 'numeric' || /nominal|amount|jumlah/.test(c)) { fill(el, 'amount', F.amount); seen++ }
    }
    if (seen < 3) return false
    var boxes = document.querySelectorAll('input[type="checkbox"]')
    for (var j = 0; j < boxes.length; j++) {
      var b = boxes[j]; var c2 = ctx(b)
      if (/anonim|sembunyikan|hide|anonymous/.test(c2)) continue
      if (/menyatakan|18 tahun|berusia|agree|setuju|terms|ketentuan/.test(c2) && !b.checked && S.boxes < 8) { S.boxes++; b.click() }
    }
    return true
  }

  function ready() {
    var all = document.querySelectorAll('input[type="checkbox"]'), need = 0, ok = 0
    for (var i = 0; i < all.length; i++) { var c = ctx(all[i]); if (/menyatakan|18 tahun|berusia|agree|setuju|ketentuan/.test(c) && !/anonim|sembunyikan/.test(c)) { need++; if (all[i].checked) ok++ } }
    return need > 0 && ok === need
  }

  function clickable(el) {
    for (var i = 0; i < 6 && el; i++, el = el.parentElement) {
      var t = (el.tagName || '').toLowerCase()
      if (t === 'button' || t === 'a' || t === 'label' || t === 'li' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'radio' || el.onclick || (el.className && /radio|option|method|item|card|channel|payment/i.test(String(el.className)))) return el
    }
    return null
  }
  function findQris() {
    var i, el, c
    var inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
    for (i = 0; i < inputs.length; i++) { el = inputs[i]; if (/qris/i.test([el.value, el.id, el.name, el.getAttribute('aria-label')].join(' '))) return el }
    var imgs = document.querySelectorAll('img')
    for (i = 0; i < imgs.length; i++) { el = imgs[i]; if (/qris/i.test((el.alt || '') + ' ' + (el.src || '')) && vis(el)) { c = clickable(el); if (c) return c } }
    var all = document.querySelectorAll('button, [role="button"], [role="radio"], label, li, div, span, a, p')
    var best = null, bl = 1e9
    for (i = 0; i < all.length; i++) {
      el = all[i]; var t = txt(el)
      if (/qris/i.test(t) && t.length < 80 && vis(el) && t.length < bl) { best = el; bl = t.length }
    }
    if (best) return clickable(best) || best
    var data = document.querySelectorAll('[data-method], [data-channel], [data-payment], [data-value], [data-id]')
    for (i = 0; i < data.length; i++) { el = data[i]; if (/qris/i.test(Array.prototype.map.call(el.attributes, function (a) { return a.value }).join(' ')) && vis(el)) return el }
    return null
  }
  function qrisStep() {
    var now = Date.now()
    if (S.qris < 5 && (!S.qrisAt || now - S.qrisAt > 1800)) {
      var q = findQris()
      if (q) { q.scrollIntoView({ block: 'center' }); q.click(); if (q.tagName === 'INPUT') { q.checked = true; q.dispatchEvent(new Event('change', { bubbles: true })) } S.qris++; S.qrisAt = now; return true }
      return false
    }
    if (S.qris && !S.pay && now - S.qrisAt > 900) {
      if (clickBtn(/^(bayar|bayar sekarang|bayar dengan qris|lanjut|lanjutkan|lanjut bayar|konfirmasi|selanjutnya|pay|pay now|continue|next|proceed)$/i)) { S.pay = 1; S.qrisAt = now + 4000 }
    }
    return true
  }

  var AUTO = window.__WPAUTO !== false
  var iv = AUTO ? setInterval(function () {
    try {
      if (Date.now() - started > 120000) { clearInterval(iv); window.__wpPayRunning = false; return }
      if (formStep()) {
        if (!S.next && ready() && Date.now() - (S.fAt || (S.fAt = Date.now())) > 900) {
          if (clickBtn(/pilih metode pembayaran/i)) S.next = 1
        }
      } else if (S.next) { qrisStep() }
    } catch (e) { }
  }, 450) : 0

  if (!window.__wpQrRunning) {
    window.__wpQrRunning = true
    var sentSig = '', qStart = Date.now()
    var qiv = setInterval(function () {
      try {
        if (Date.now() - qStart > 15 * 60 * 1000) { clearInterval(qiv); return }
        if (!window.WPPay || !window.WPPay.qr) return
        var els = document.querySelectorAll('img, canvas'), best = null, bs = 0
        for (var i = 0; i < els.length; i++) {
          var el = els[i]; if (!vis(el)) continue
          var r = el.getBoundingClientRect(), w = r.width, h = r.height
          if (w < 130 || h < 130) continue
          var ratio = w / h; if (ratio < 0.85 || ratio > 1.18) continue
          var meta = (el.alt || '') + ' ' + (el.src || '').slice(0, 200) + ' ' + (el.className || '')
          if (/logo|avatar|banner|icon|profile|header|brand/i.test(meta)) continue
          if (w * h > bs) { best = el; bs = w * h }
        }
        if (!best) return
        var src = ''
        if (best.tagName === 'CANVAS') { src = best.toDataURL('image/png') }
        else if (/^data:image\//.test(best.src)) { src = best.src }
        else if (best.complete && best.naturalWidth) {
          try { var c = document.createElement('canvas'); c.width = best.naturalWidth; c.height = best.naturalHeight; c.getContext('2d').drawImage(best, 0, 0); src = c.toDataURL('image/png') }
          catch (e) { src = /^https:\/\//.test(best.src) ? best.src : '' }
        }
        if (!src) return
        var sig = src.length + ':' + src.slice(-60)
        if (sig === sentSig) return
        sentSig = sig
        window.WPPay.qr(src)
      } catch (e) { }
    }, 800)
  }
})();
