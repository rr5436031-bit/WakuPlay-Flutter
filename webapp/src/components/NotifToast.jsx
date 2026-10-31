import { useEffect, useRef } from 'react'
import { useApp } from '../context'
import { useToast, dismissToast, openNotif } from '../lib/notif'
import Icon from './Icon'

const ICON = { friend_request: 'adduser', friend_accept: 'adduser', dm: 'chat', episode: 'play', new_anime: 'play', mention: 'people', reply: 'chat', clan_request: 'shield' }

export default function NotifToast() {
  const { nav } = useApp()
  const n = useToast()
  const y0 = useRef(null)
  useEffect(() => {
    if (!n) return
    const t = setTimeout(dismissToast, 5000)
    return () => clearTimeout(t)
  }, [n])
  if (!n) return null
  const withPoster = (n.type === 'episode' || n.type === 'new_anime') && n.data?.poster
  return (
    <div
      key={n.id + ':' + n.created_at}
      className="nf-toast"
      role="alert"
      onClick={() => { dismissToast(); openNotif(n, nav) }}
      onTouchStart={(e) => { y0.current = e.touches[0].clientY }}
      onTouchEnd={(e) => { if (y0.current !== null && e.changedTouches[0].clientY - y0.current < -24) dismissToast(); y0.current = null }}
    >
      {withPoster ? <img decoding="async" className="nf-poster" src={n.data.poster} alt="" /> : <span className="nf-ico"><Icon name={ICON[n.type] || 'bell'} size={22} /></span>}
      <span className="nf-txt">
        <b>{n.title}</b>
        {n.body && <span>{n.body}</span>}
      </span>
    </div>
  )
}
