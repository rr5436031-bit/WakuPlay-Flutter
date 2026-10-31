import { useApp } from '../context'
import { useApi } from '../hooks/useApi'
import { listFavorites } from '../services/db'
import AnimeCard from '../components/AnimeCard'
import { GridSkeleton, ErrorState, EmptyState } from '../components/ui'

export default function Favorites({ focusKey }) {
  const { user, nav } = useApp()
  const f = useApi(() => listFavorites(user.id), [user.id, focusKey])
  const rows = f.data || []

  return (
    <div className="page-scroll">
      <h1 className="page-title">Anime Favorit</h1>
      <div className="fav-total">Total ({rows.length})</div>
      {f.loading && !f.data && <GridSkeleton />}
      {f.error && <ErrorState error={f.error} onRetry={f.retry} />}
      {f.data && rows.length === 0 && (
        <EmptyState title="Anime yang kamu favoritkan akan muncul di sini" text="Tambahkan dulu dari halaman detail anime." />
      )}
      <div className="grid3">
        {rows.map((r) => {
          const a = { id: r.anime_id, title: r.title, poster: r.poster }
          return <AnimeCard key={r.anime_id} anime={a} onClick={() => nav.push('detail', { id: a.id, preview: a })} />
        })}
      </div>
      <div style={{ height: 24 }} />
    </div>
  )
}
