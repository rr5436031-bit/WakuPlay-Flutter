import { useRef } from 'react'
import Icon from './Icon'
import { Poster } from './ui'
import { AnimeViewsText } from './Views'

export default function AnimeCard({ anime: a, onClick, rank, onHold }) {
  const t = useRef(null)
  const held = useRef(false)
  const start = () => { if (!onHold) return; held.current = false; t.current = setTimeout(() => { held.current = true; onHold(a) }, 600) }
  const stop = () => clearTimeout(t.current)
  return (
    <button
      className={rank ? 'acard rcard' : 'acard'}
      onClick={() => { if (held.current) { held.current = false; return } onClick() }}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onPointerMove={stop}
      onContextMenu={(e) => onHold && e.preventDefault()}
    >
      <div className="acard-poster">
        <Poster src={a.poster} alt={a.title} />
        {rank && <span className="badge-rank">#{rank}</span>}
        {a.isNew && <span className={rank ? 'badge-new badge-new-r' : 'badge-new'}>New</span>}
        {a.rating > 0 && (
          <span className="badge-rate"><Icon name="star" size={11} /> {a.rating.toFixed(2)}</span>
        )}
        {a.episode !== undefined && a.episode !== null && <span className="acard-eps">Eps {a.episode}</span>}
      </div>
      {a.id != null && (
        <div className="acard-views"><Icon name="eye" size={13} /> <AnimeViewsText id={a.id} /> views</div>
      )}
      <div className="acard-title">{a.title}</div>
    </button>
  )
}
