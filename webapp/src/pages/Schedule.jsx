import { useState } from 'react'
import { useApp } from '../context'
import { useApi } from '../hooks/useApi'
import { api, peekApi } from '../services/animeApi'
import Icon from '../components/Icon'
import { Poster, Skeleton, ErrorState, EmptyState } from '../components/ui'
import { fmtTimeField } from '../lib/format'
import { AnimeViewsText } from '../components/Views'

const DAYS = [
  ['MONDAY', 'Senin'], ['TUESDAY', 'Selasa'], ['WEDNESDAY', 'Rabu'], ['THURSDAY', 'Kamis'],
  ['FRIDAY', 'Jumat'], ['SATURDAY', 'Sabtu'], ['SUNDAY', 'Minggu'],
]
const todayIdx = () => (new Date().getDay() + 6) % 7

export default function Schedule() {
  const { nav } = useApp()
  const [day, setDay] = useState(todayIdx())
  const sch = useApi((s) => api.schedule(DAYS[day][0], s), [day], true, peekApi.schedule(DAYS[day][0]))
  const items = sch.data || []

  return (
    <div className="page-scroll schedule">
      <h1 className="page-title">Jadwal Tayang</h1>
      <div className="daybar">
        {DAYS.map(([, label], i) => (
          <button key={label} className={i === day ? 'day on' : 'day'} onClick={() => setDay(i)}>{label}</button>
        ))}
      </div>
      <div className="daycount">{sch.data ? `${items.length} Anime` : ''}</div>

      {sch.loading && <div style={{ padding: '0 14px' }}>{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 110, borderRadius: 16, marginBottom: 12 }} />)}</div>}
      {sch.error && <ErrorState error={sch.error} onRetry={sch.retry} />}
      {!sch.loading && !sch.error && items.length === 0 && <EmptyState title="Belum ada jadwal" text="Tidak ada anime tayang di hari ini." />}

      <div className="timeline">
        {items.map((a) => (
          <div className="tl-row" key={a.id}>
            <div className="tl-time">{fmtTimeField(a.time)}</div>
            <div className="tl-line"><i /></div>
            <button className="sch-card" onClick={() => nav.push('detail', { id: a.id, preview: a })}>
              <div className="sch-poster"><Poster src={a.poster} alt={a.title} /></div>
              <div className="sch-info">
                <strong>{a.title}</strong>
                {a.episode !== undefined && <span>Episode {a.episode}</span>}
                {a.status && <span className="sch-status">{String(a.status)}</span>}
                <span className="sch-meta">
                  {a.id != null && <><Icon name="play" size={10} /> <AnimeViewsText id={a.id} /></>}
                  {a.id != null && a.rating > 0 && ' · '}
                  {a.rating > 0 && <span className="gold"><Icon name="star" size={11} /> {a.rating.toFixed(1)}</span>}
                </span>
              </div>
            </button>
          </div>
        ))}
      </div>
      <div style={{ height: 24 }} />
    </div>
  )
}
