import { usePremiumFlag } from './premium'
import { useStaffRoles } from './roles'

const STAFF = ['admin', 'developer', 'moderator']
export const PERK_RULES = {
  rename:    { premium: true, roles: STAFF, label: 'Ubah nama akun' },
  banner:    { premium: true, roles: STAFF, label: 'Banner profil' },
  skipIntro: { premium: true, roles: STAFF, label: 'Skip Intro' },
}

export function usePerk(key, uid) {
  const rule = PERK_RULES[key]
  const roles = useStaffRoles()
  const prem = usePremiumFlag(uid)
  if (!rule) return { ok: false, by: null, label: key }
  if (rule.roles.includes(roles[uid])) return { ok: true, by: 'staff', label: rule.label }
  if (rule.premium && prem) return { ok: true, by: 'premium', label: rule.label }
  return { ok: false, by: null, label: rule.label }
}
