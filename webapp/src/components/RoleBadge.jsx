import RoleCapsule from './RoleCapsule'
import { PremiumCheck } from './PremiumBadge'

const BADGE = {
  developer: { a: '#ff5a67', b: '#d4153a', label: 'Developer' },
  admin: { a: '#ff5a67', b: '#d4153a', label: 'Admin' },
  moderator: { a: '#b87cff', b: '#7a3ee0', label: 'Moderator' },
}
const SEAL = '12.00,1.60 13.68,3.57 15.98,2.39 16.78,4.85 19.35,4.65 19.15,7.22 21.61,8.02 20.43,10.32 22.40,12.00 20.43,13.68 21.61,15.98 19.15,16.78 19.35,19.35 16.78,19.15 15.98,21.61 13.68,20.43 12.00,22.40 10.32,20.43 8.02,21.61 7.22,19.15 4.65,19.35 4.85,16.78 2.39,15.98 3.57,13.68 1.60,12.00 3.57,10.32 2.39,8.02 4.85,7.22 4.65,4.65 7.22,4.85 8.02,2.39 10.32,3.57'

function Seal({ c }) {
  return (
    <svg className="rb" viewBox="0 0 24 24" role="img" aria-label={c.label}>
      <polygon points={SEAL} fill={c.b} stroke={c.a} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.6 12.4l3 3 5.9-6.2" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function RoleBadge({ role, uid, part }) {
  const c = BADGE[role]
  const staffRed = role === 'developer' || role === 'admin'
  const showCheck = part !== 'capsule'
  const showCapsule = part !== 'check'
  return (
    <>
      {showCheck && c && <Seal c={c} />}
      {showCapsule && staffRed && <RoleCapsule role={role} />}
      {showCheck && uid && !c ? <PremiumCheck uid={uid} /> : null}
    </>
  )
}
