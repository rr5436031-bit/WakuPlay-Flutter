const ROLE = {
  developer: { label: 'Developer', cls: 'red' },
  admin: { label: 'Admin', cls: 'red' },
  moderator: { label: 'Moderator', cls: 'purple' },
}

export default function RolePill({ role }) {
  const r = ROLE[role]
  if (!r) return null
  if (role === 'developer' || role === 'admin') return null
  return <span className={`rolepill ${r.cls}`}>{r.label}</span>
}
