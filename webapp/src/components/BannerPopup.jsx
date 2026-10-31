import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import BannerCard from './BannerCard'

export default function BannerPopup({ userId }) {
  const [b, setB] = useState(null)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      supabase.rpc('get_active_banner').then(({ data, error }) => {
        const row = Array.isArray(data) ? data[0] : data
        if (alive && !error && row) setB(row)
      })
    }, 1200)
    return () => { alive = false; clearTimeout(t) }
  }, [userId])
  if (!b) return null
  return (
    <div className="bn-bg" onClick={() => setB(null)}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
        <BannerCard
          title={b.title} body={b.body} button={b.button_enabled && !!b.button_url} buttonText={b.button_text}
          onClose={() => setB(null)}
          onButton={() => { window.open(b.button_url, '_blank'); setB(null) }}
        />
      </div>
    </div>
  )
}
