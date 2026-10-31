import { useMemo } from 'react'

const LABEL = { developer: 'Developer', admin: 'Admin' }
const PERIOD = 4.6

export default function RoleCapsule({ role }) {
  const delay = useMemo(() => -((Date.now() / 1000) % PERIOD), [])
  const label = LABEL[role]
  if (!label) return null
  return <span className="rcap" style={{ '--rc-d': `${delay.toFixed(2)}s` }}><rc-t>{label}</rc-t></span>
}
