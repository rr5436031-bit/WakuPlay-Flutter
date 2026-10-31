import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { useDebounce } from '../hooks/useApi'
import { api, peekApi } from '../services/animeApi'
import Icon from '../components/Icon'
import AnimeCard from '../components/AnimeCard'
import { SearchBar, Chip, GridSkeleton, ErrorState, EmptyState, Button } from '../components/ui'
import { useApi } from '../hooks/useApi'

export default function Search({ genre: initGenre }) {
  const { nav } = useApp()
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState(initGenre || null)
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const dq = useDebounce(q, 450)
  const genres = useApi((s) => api.genres(s), [], true, peekApi.genres)
  const reqId = useRef(0)

  const active = dq.trim() !== '' || genre

  async function load(p, reset) {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const r = await api.search({ q: dq.trim(), page: p, genre_in: genre?.id })
      if (id !== reqId.current) return
      setItems((prev) => (reset ? r.items : [...prev, ...r.items]))
      setHasNext(r.hasNext && r.items.length > 0)
      setPage(p)
    } catch (e) {
      if (id === reqId.current) setError(e)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!active) { reqId.current++; setItems([]); setHasNext(false); setLoading(false); setError(null); return }
    load(1, true)
  }, [dq, genre?.id])

  return (
    <div className="page-scroll">
      <div className="topbar">
        <button className="iconbtn" onClick={nav.back}><Icon name="back" /></button>
        <div style={{ flex: 1 }}><SearchBar value={q} onChange={setQ} autoFocus /></div>
      </div>

      {genre && (
        <div className="chips" style={{ paddingTop: 0 }}>
          <Chip active onClick={() => setGenre(null)}>{genre.name} ✕</Chip>
        </div>
      )}

      {!active && genres.data && (
        <>
          <div className="section-header"><h2><b>Genres</b></h2></div>
          <div className="chips">
            {genres.data.map((g) => <Chip key={g.id} onClick={() => setGenre(g)}>{g.name}</Chip>)}
          </div>
        </>
      )}

      {active && (
        <div>
          {items.length > 0 && (
            <div className="grid3">
              {items.map((a) => (
                <AnimeCard key={a.id} anime={a} onClick={() => nav.push('detail', { id: a.id, preview: a })} />
              ))}
            </div>
          )}
          {loading && <GridSkeleton count={items.length ? 3 : 6} />}
          {error && <ErrorState error={error} onRetry={() => load(page === 1 && !items.length ? 1 : page + (items.length ? 1 : 0), !items.length)} />}
          {!loading && !error && items.length === 0 && (
            <EmptyState title="Anime tidak ditemukan" text="Coba kata kunci atau genre lain." />
          )}
          {!loading && hasNext && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Button variant="ghost" onClick={() => load(page + 1, false)}>Show More</Button>
            </div>
          )}
        </div>
      )}
      <div style={{ height: 24 }} />
    </div>
  )
}
