import { useState } from 'react'
import { useApp } from '../context'
import Icon from '../components/Icon'
import { Room } from './Chat'

const TABS = {
  request: {
    label: 'Request',
    placeholder: 'Tulis request fitur: apa dan untuk apa…',
    empty: 'Belum ada request. Tulis fitur yang kamu mau!',
    tip: 'Tulis fitur apa yang kamu mau dan kegunaannya. Minimal 15 karakter.',
  },
  lapor: {
    label: 'Lapor',
    placeholder: 'Jelaskan bug: di mana, apa yang terjadi, cara mengulang…',
    empty: 'Belum ada laporan. Temukan bug? Laporkan di sini!',
    tip: 'Tulis di halaman mana, apa yang terjadi, dan cara mengulangnya. Minimal 20 karakter.',
  },
}
const RULES = [
  'Maksimal 500 karakter per pesan, 3 pesan per menit, 20 pesan per 24 jam.',
  'Tanpa link, iklan, spam, atau pesan yang sama berulang.',
  'Tulis dengan jelas. Pesan asal-asalan ditolak otomatis.',
  'Tag orang dengan @ID (contoh @1), maksimal 5 orang per pesan.',
  'Pesan yang sudah ditandai Selesai/Ditolak oleh staf tidak bisa dihapus.',
]

export default function Feedback({ tab: first }) {
  const { nav } = useApp()
  const [tab, setTab] = useState(first === 'lapor' ? 'lapor' : 'request')
  const [online, setOnline] = useState(false)
  const [rules, setRules] = useState(false)
  const T = TABS[tab]
  const pick = (t) => { if (t === tab) return; setOnline(false); setTab(t) }
  return (
    <div className="gc-page">
      <div className="gc-head">
        <button className="iconbtn" onClick={nav.back} aria-label="Kembali"><Icon name="back" /></button>
        <h1>Lapor / Req</h1>
        <span className={`gc-online ${online ? 'on' : ''}`}><i />{online ? 'Online' : 'Menyambung'}</span>
      </div>
      <div className="lb-tabs cc-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'request'} className={tab === 'request' ? 'on' : ''} onClick={() => pick('request')}>Request</button>
        <button role="tab" aria-selected={tab === 'lapor'} className={tab === 'lapor' ? 'on' : ''} onClick={() => pick('lapor')}>Lapor</button>
      </div>
      <div className="fb-tip">
        <span>{T.tip}</span>
        <button className="fb-rulebtn" onClick={() => setRules((v) => !v)} aria-expanded={rules}>{rules ? 'Tutup aturan' : 'Aturan'}</button>
      </div>
      {rules && <ul className="fb-rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>}
      <Room key={tab} room={{ kind: 'feedback', channel: tab, placeholder: T.placeholder, empty: T.empty }} onOnline={setOnline} />
    </div>
  )
}
