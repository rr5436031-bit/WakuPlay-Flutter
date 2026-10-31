import { Capacitor, registerPlugin } from '@capacitor/core'
import { copyText } from './clipboard'

export const GifUrl = Capacitor.isNativePlatform() ? registerPlugin('GifUrl') : null
export const GIF_TO_URL = 'https://picturetolink.com/gif-to-url'
const OK_URL = /^https:\/\/[^\s"'<>()\\]{1,480}\.gif(\?[^\s"'<>()\\]*)?$/i

let handles = []
const cleanup = () => { handles.forEach((h) => h.remove?.()); handles = [] }

export async function openGifToUrl(onUrl) {
  if (!GifUrl) { window.open(GIF_TO_URL, '_blank', 'noopener'); return }
  cleanup()
  handles.push(await GifUrl.addListener('gifUrl', async (e) => {
    const u = e?.url
    if (typeof u !== 'string' || !OK_URL.test(u)) return
    await copyText(u)
    onUrl?.(u)
  }))
  handles.push(await GifUrl.addListener('closed', cleanup))
  await GifUrl.open({ url: GIF_TO_URL, title: 'GIF ke Link' })
}
