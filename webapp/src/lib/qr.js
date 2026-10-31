import qrcode from 'qrcode-generator'

export function qrPath(text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) {
    let c = 0
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue }
      let e = c
      while (e < n && qr.isDark(r, e)) e++
      d += `M${c} ${r}h${e - c}v1h-${e - c}z`
      c = e
    }
  }
  return { n, d }
}
