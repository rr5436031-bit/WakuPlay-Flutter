import { useEffect, useState } from 'react'
import { getGold } from '../services/clan'

let gold = null
let last = 0
const subs = new Set()
export async function refreshGold() {
  try { gold = Number(await getGold()) || 0; last = Date.now(); subs.forEach((f) => f(gold)) } catch { }
}
export function setGoldLocal(v) { gold = v; last = Date.now(); subs.forEach((f) => f(gold)) }
export function useGold() {
  const [g, set] = useState(gold)
  useEffect(() => {
    subs.add(set)
    if (Date.now() - last > 20000) refreshGold()
    const t = setInterval(refreshGold, 60000)
    return () => { subs.delete(set); clearInterval(t) }
  }, [])
  return g
}
export const fmtNum = (n) => Number(n || 0).toLocaleString('id-ID')
export const fmtK = (n) => {
  n = Number(n) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '') + 'M'
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace('.', ',').replace(/,0$/, '') + 'K'
  return n.toLocaleString('id-ID')
}
