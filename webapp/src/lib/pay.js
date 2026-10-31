import { Capacitor, registerPlugin } from '@capacitor/core'

export const Pay = Capacitor.isNativePlatform() ? registerPlugin('Pay') : null

export async function openPay(order) {
  const fill = order.fill || {}
  const url = order.pay_url || fill.page
  if (!url) throw new Error('Alamat pembayaran belum diatur')
  if (!Pay) { window.open(url, '_blank', 'noopener'); return }
  let base = '/'
  try { base = new URL(fill.page || url).pathname } catch { }
  await Pay.open({
    url, title: `Pembayaran Premium · ${order.plan_name || ''}`.trim(), basePath: base,
    fill, autoFill: !order.pay_url,
  })
}
export const closePay = () => { if (Pay) Pay.close().catch(() => {}) }
