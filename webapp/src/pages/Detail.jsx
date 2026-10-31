import { useState } from 'react'
import { useApp } from '../context'
import { useApi } from '../hooks/useApi'
import { api, peekApi } from '../services/animeApi'
import { addFavorite, removeFavorite, isFavorite, getLastWatched, listWatchedIds } from '../services/db'
import Icon from '../components/Icon'
import { fmtAgo } from '../lib/format'
import { EpisodeViewsText } from '../components/Views'
import AnimeCard from '../components/AnimeCard'
import { relatedQueries, rankRelated } from '../lib/related'
import { Button, Chip, Poster, Skeleton, ErrorState, EmptyState } from '../components/ui'

export default function Detail({ id, preview }) {
  const { user, nav, focusKey } = useApp()
  const detail = useApi((s) => api.anime(id, s), [id], true, peekApi.anime(id))
  const [part, setPart] = useState(null)
  const eps = useApi((s) => api.episodes(id, s, setPart), [id])
  const fav = useApi(() => isFavorite(user.id, id).catch(() => false), [id, user?.id])
  const last = useApi(() => getLastWatched(user.id, id).catch(() => null), [id, user?.id, focusKey])
  const seenQ = useApi(() => listWatchedIds(user.id, id).catch(() => []), [id, user?.id, focusKey])
  const seen = new Set(seenQ.data || [])
  const [favOverride, setFavOverride] = useState(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [grid, setGrid] = useState(false)
  const [desc, setDesc] = useState(true)

  const a = { ...(preview || {}), ...(detail.data || {}), id }
  const rel = useApi(async (sig) => {
    const lists = await Promise.all(relatedQueries(a.title).map((q) => api.search({ q }, sig).then((r) => r.items || []).catch(() => [])))
    return rankRelated(a.title, id, lists)
  }, [id, a.title], !!a.title)
  const isFav = favOverride !== null ? favOverride : !!fav.data
  const episodes = eps.data || part || []
  const shown = desc ? [...episodes].reverse() : episodes
  const watched = last.data

  function play(ep) {
    nav.push('player', {
      animeId: id, episodeId: ep.id, episodeNumber: ep.number,
      anime: { id, title: a.title, poster: a.poster },
    })
  }

  async function toggleFav() {
    if (busy) return
    setBusy(true)
    const next = !isFav
    setFavOverride(next)
    try {
      if (next) await addFavorite(user.id, a)
      else await removeFavorite(user.id, id)
    } catch {
      setFavOverride(!next)
    } finally {
      setBusy(false)
    }
  }

  const cont = watched && episodes.find((e) => String(e.id) === String(watched.episode_id))
  const target = cont || episodes[0]

  return (
    <div className="page-scroll">
      <div className="detail-hero">
        <Poster src={a.cover || a.poster} alt={a.title} />
        <div className="hero-shade" />
        <button className="iconbtn floating" onClick={nav.back}><Icon name="back" /></button>
      </div>

      <div className="detail-head">
        <div className="detail-poster"><Poster src={a.poster} alt={a.title} /></div>
        <div className="detail-meta">
          <h1>{a.title}</h1>
          <div className="meta-line">
            {a.rating > 0 && <span className="meta-rate"><Icon name="star" size={13} /> {a.rating.toFixed(2)}</span>}
            {a.status && <span>{String(a.status)}</span>}
            {a.type && <span>{String(a.type)}</span>}
          </div>
        </div>
      </div>

      {detail.error && !preview && <ErrorState error={detail.error} onRetry={detail.retry} />}
      {detail.loading && !a.synopsis && <div style={{ padding: '0 14px' }}><Skeleton style={{ height: 60 }} /></div>}

      <div className="detail-actions">
        <Button icon="play" disabled={!target} onClick={() => target && play(target)}>
          {cont ? `Lanjutkan Eps ${cont.number}` : 'Tonton'}
        </Button>
        <Button variant={isFav ? 'primary' : 'secondary'} icon="heart" onClick={toggleFav} className="fav-btn">
          {isFav ? 'Favorit' : 'Tambah'}
        </Button>
      </div>

      {a.genres?.length > 0 && (
        <div className="chips">
          {a.genres.map((g) => <Chip key={g} onClick={() => nav.push('search', { genre: { id: g, name: g } })}>{g}</Chip>)}
        </div>
      )}

      {a.synopsis && (
        <div className="synopsis">
          <h3>Sinopsis</h3>
          <p className={more ? '' : 'clamp'}>{a.synopsis}</p>
          <button className="link" onClick={() => setMore(!more)}>{more ? 'Tutup' : 'Selengkapnya'}</button>
        </div>
      )}

      {rel.data && rel.data.length > 0 && (
        <div className="synopsis">
          <h3>Related Anime</h3>
          <div className="hrow" style={{ padding: '8px 0 4px' }}>
            {rel.data.map((r) => <AnimeCard key={r.id} anime={r} onClick={() => nav.push('detail', { id: r.id, preview: r })} />)}
          </div>
        </div>
      )}

      <div className="eps-head">
        <h2>Episodes ({episodes.length})</h2>
        <button className="eps-pill" onClick={() => setGrid(!grid)}>
          <Icon name={grid ? 'library' : 'library'} size={18} /> {grid ? 'List' : 'Grid'}
        </button>
        <button className="eps-pill" onClick={() => setDesc(!desc)}>
          Sort: {desc ? `${episodes.length} \u25BC 1` : `1 \u25B2 ${episodes.length}`}
        </button>
      </div>
      {eps.loading && episodes.length === 0 && (grid ? (
        <div className="ep-grid">{Array.from({ length: 15 }, (_, i) => <Skeleton key={i} className="ep-skel-sq" />)}</div>
      ) : (
        <div className="ep-list">{Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="ep-item"><Skeleton className="ep-skel-row" /><Skeleton className="ep-skel-btn" /></div>
        ))}</div>
      ))}
      {eps.error && <ErrorState error={eps.error} onRetry={eps.retry} />}
      {!eps.loading && !eps.error && episodes.length === 0 && <EmptyState title="Episode tidak ditemukan" />}
      {grid ? (
        <div className="ep-grid">
          {shown.map((e) => (
            <button
              key={e.id}
              className={`ep-btn ${seen.has(String(e.id)) || (watched && String(watched.episode_id) === String(e.id)) ? 'seen' : ''}`}
              onClick={() => play(e)}
            >
              {e.number}
            </button>
          ))}
        </div>
      ) : (
        <div className="ep-list">
          {shown.map((e) => {
            const ago = fmtAgo(e.date)
            const isLast = watched && String(watched.episode_id) === String(e.id)
            return (
              <div key={e.id} className="ep-item">
                <button className={`ep-row ${isLast || seen.has(String(e.id)) ? 'seen' : ''}`} onClick={() => play(e)}>
                  <span className="ep-row-main">
                    <b>Episode {e.number}</b>
                    {e.id != null && (
                      <span className="ep-row-views"><Icon name="eye" size={15} /> <EpisodeViewsText id={e.id} /></span>
                    )}
                  </span>
                  <span className="ep-row-side">
                    {ago && <span className="ep-row-ago">{ago}</span>}
                    <Icon name="play" size={20} />
                  </span>
                </button>
                <button className="ep-open" onClick={() => play(e)}>Tonton</button>
              </div>
            )
          })}
        </div>
      )}
      {eps.loading && episodes.length > 0 && <p className="ep-more">Memuat episode lainnya…</p>}
      <div style={{ height: 28 }} />
    </div>
  )
}
