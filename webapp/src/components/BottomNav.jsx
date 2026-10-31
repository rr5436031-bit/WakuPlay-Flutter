import Icon from './Icon'
import { Avatar } from './ui'

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'history', label: 'Riwayat', icon: 'clock' },
  { id: 'schedule', label: 'Jadwal', icon: 'calendar' },
  { id: 'favorites', label: 'Favorit', icon: 'library' },
  { id: 'account', label: 'Akun', icon: null },
]

export default function BottomNav({ tab, onTab, user }) {
  return (
    <nav className="bottomnav">
      {TABS.map((t) => (
        <button key={t.id} className={`navitem ${tab === t.id ? 'active' : ''}`} onClick={() => onTab(t.id)}>
          <span className="navpill">
            {t.icon ? <Icon name={t.icon} size={24} /> : <Avatar user={user} size={26} />}
          </span>
          {tab === t.id && <span className="navlabel">{t.label}</span>}
        </button>
      ))}
    </nav>
  )
}
