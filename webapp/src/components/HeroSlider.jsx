import { useRef, useState } from 'react'
import Icon from './Icon'
import { Poster } from './ui'
import { AnimeViewsText } from './Views'

export default function HeroSlider({ items, onOpen }) {
  const ref = useRef(null)
  const [idx, setIdx] = useState(0)
  if (!items.length) return null
  return (
    <div className="hero-wrap">
      <div
        className="hero"
        ref={ref}
        onScroll={() => {
          const el = ref.current
          if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {items.map((a, i) => (
          <button key={a.id + '-' + i} className="hero-slide" onClick={() => onOpen(a)}>
            <Poster src={a.cover || a.poster} alt={a.title} />
            <div className="hero-shade" />
            <span className="hero-rank">#{i + 1}</span>
            {a.id != null && (
              <span className="hero-views"><Icon name="eye" size={18} /> <AnimeViewsText id={a.id} /></span>
            )}
            <span className="hero-title"><b>{a.title.split(' ')[0]}</b> {a.title.split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
      </div>
      <div className="dots">
        {items.map((_, i) => <i key={i} className={i === idx ? 'on' : ''} />)}
      </div>
    </div>
  )
}
