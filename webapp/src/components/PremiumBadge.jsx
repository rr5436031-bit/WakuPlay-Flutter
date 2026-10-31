import { usePremiumFlag } from '../lib/premium'
import { useStaffRoles } from '../lib/roles'

const STAFF = new Set(['developer', 'admin', 'moderator'])
const useShow = (uid) => {
  const on = usePremiumFlag(uid)
  const roles = useStaffRoles()
  return on && !STAFF.has(roles[uid])
}

export function CheckIcon({ size = 12 }) {
  return (
    <svg className="pmb-ic" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7.2" fill="#fff" />
      <path d="M4.7 8.3l2.3 2.3 4.4-4.9" fill="none" stroke="#1b6cff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
export function DiamondIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.2 3.5h11.6l4 5.2L12 21 2.2 8.7z" fill="currentColor" opacity=".95" />
      <path d="M2.6 8.7h18.8M8.6 8.7L12 21l3.4-12.3M6.2 3.5l2.4 5.2M17.8 3.5l-2.4 5.2" fill="none" stroke="rgba(8,20,60,.55)" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

export function PremiumPill() {
  return <span className="pmb" aria-label="Premium"><CheckIcon /><b>PREMIUM</b></span>
}

export default function PremiumBadge({ uid }) {
  return useShow(uid) ? <PremiumPill /> : null
}

export function PremiumCheck({ uid }) {
  if (!useShow(uid)) return null
  return (
    <svg className="rb pmc" viewBox="0 0 24 24" role="img" aria-label="Premium">
      <polygon points="12.00,1.60 13.68,3.57 15.98,2.39 16.78,4.85 19.35,4.65 19.15,7.22 21.61,8.02 20.43,10.32 22.40,12.00 20.43,13.68 21.61,15.98 19.15,16.78 19.35,19.35 16.78,19.15 15.98,21.61 13.68,20.43 12.00,22.40 10.32,20.43 8.02,21.61 7.22,19.15 4.65,19.35 4.85,16.78 2.39,15.98 3.57,13.68 1.60,12.00 3.57,10.32 2.39,8.02 4.85,7.22 4.65,4.65 7.22,4.85 8.02,2.39 10.32,3.57" fill="#1a63ff" stroke="#5db0ff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.6 12.4l3 3 5.9-6.2" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
