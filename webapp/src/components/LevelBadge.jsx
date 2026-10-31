import elytra from '../assets/elytra.png'
import lv01 from '../assets/lv/lv01.png'
import lv02 from '../assets/lv/lv02.png'
import lv03 from '../assets/lv/lv03.png'
import lv04 from '../assets/lv/lv04.png'
import lv05 from '../assets/lv/lv05.png'
import lv06 from '../assets/lv/lv06.png'
import lv07 from '../assets/lv/lv07.png'
import lv08 from '../assets/lv/lv08.png'
import lv09 from '../assets/lv/lv09.png'
import lv10 from '../assets/lv/lv10.png'
import { levelInfo, levelTier } from '../lib/xp'
import { getLevelCfg, onLevelCfg } from '../lib/levelcurve'

export const DEV_LEVEL = 999999

export const TIER_DEFS = [
  { name: 'Batu Bara', icon: lv01, color: '#9aa0aa' },
  { name: 'Tembaga', icon: lv02, color: '#e0875a' },
  { name: 'Besi', icon: lv03, color: '#d4d7de' },
  { name: 'Zamrud', icon: lv04, color: '#4fd68a' },
  { name: 'Berlian', icon: lv05, color: '#5fe0e6' },
  { name: 'Netherite', icon: lv06, color: '#b49a8c' },
  { name: 'Totem', icon: lv07, color: '#f0c24a' },
  { name: 'Nether Star', icon: lv08, color: '#f4f0b0' },
  { name: 'Ember Lava', icon: lv09, color: '#ff8a3d' },
  { name: 'Bedrock', icon: lv10, color: '#a9a4c4' },
]
const applyTiers = (c) => {
  TIER_DEFS.forEach((t, i) => { t.min = c ? c.tiers[i] : i === 0 ? 1 : Infinity })
  TIER_DEFS.forEach((t, i) => { t.max = i + 1 < TIER_DEFS.length ? TIER_DEFS[i + 1].min - 1 : Infinity })
}
applyTiers(getLevelCfg())
onLevelCfg(applyTiers)
const tierNo = (lv) => TIER_DEFS.findIndex((t) => lv <= t.max) + 1
export const levelIcon = (lv) => TIER_DEFS[tierNo(lv) - 1].icon

export default function LevelBadge({ xp, role, level, dot = false, className = '' }) {
  const dev = role === 'developer' || role === 'admin'
  const lv = dev ? DEV_LEVEL : level ?? levelInfo(xp).level
  const text = `Lvl${dot ? '.' : ''} ${lv.toLocaleString('id-ID')}`
  if (dev) {
    return (
      <span className={`lvl lvl-dev ${className}`}>
        <img decoding="async" className="lvl-ico" src={elytra} alt="" draggable="false" />
        <span className="lvl-txt">{text}</span>
        <i className="lvl-spark s1" /><i className="lvl-spark s2" /><i className="lvl-spark s3" />
      </span>
    )
  }
  const tn = tierNo(lv)
  return (
    <span className={`lvl lvl-${levelTier(lv)} ${tn >= 4 ? `lvl-shine lvl-t${tn}` : ''} ${className}`}>
      <img decoding="async" className="lvl-ico" src={levelIcon(lv)} alt="" draggable="false" />
      {text}
    </span>
  )
}
