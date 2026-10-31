const RANK = { leader: 5, vice_leader: 4, admiral: 3, officer: 2, member: 1 }
export const ROLE_NAME = { leader: 'Leader', vice_leader: 'Vice Leader', admiral: 'Admiral', officer: 'Officer', member: 'Member' }
export const ROLE_TAG = { leader: 'LEADER', vice_leader: 'VICE LEADER', admiral: 'ADMIRAL', officer: 'OFFICER' }
export const ROLE_COLOR = { leader: '#ffc83a', vice_leader: '#ff9a3c', admiral: '#5fb0ff', officer: '#5be08a' }

export const rankOf = (r) => RANK[r] || 1
export const isManager = (r) => rankOf(r) >= 4
export const canHandleRequests = (r) => rankOf(r) >= 2
export const isOwner = (r) => r === 'leader'
export const canKick = (me, target) => rankOf(me) >= 2 && rankOf(target) < rankOf(me)
export function assignableRoles(me, target) {
  if (rankOf(target) >= rankOf(me)) return []
  if (me === 'leader') return ['vice_leader', 'admiral', 'officer', 'member'].filter((x) => x !== target)
  if (me === 'vice_leader') return ['admiral', 'officer', 'member'].filter((x) => x !== target)
  if (me === 'admiral') return target === 'member' ? ['officer'] : []
  return []
}
