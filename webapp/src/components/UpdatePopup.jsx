import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { APP_VERSION, cmpVer } from '../lib/version'
import UpdateCard from './UpdateCard'

export default function UpdatePopup({ userId }) {
  const [u, setU] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.rpc('get_app_update').then(({ data, error }) => {
      const row = Array.isArray(data) ? data[0] : data
      if (alive && !error && row && cmpVer(row.latest_version, APP_VERSION) > 0) setU(row)
    })
    return () => { alive = false }
  }, [userId])
  if (!u) return null
  return (
    <div className={`up-bg ${u.force_update ? 'force' : ''}`} onClick={() => { if (!u.force_update) setU(null) }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
        <UpdateCard
          version={u.latest_version} current={APP_VERSION} message={u.message}
          onClose={u.force_update ? undefined : () => setU(null)}
          onDownload={() => window.open(u.download_url, '_blank')}
        />
      </div>
    </div>
  )
}
