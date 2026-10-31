import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { useApi } from '../hooks/useApi'
import { listHistory, deleteHistory } from '../services/db'
import { Poster, Skeleton, ErrorState, EmptyState, Button } from '../components/ui'
import { fmtDur, fmtDateId, fmtClock } from '../lib/format'

export default function History({ focusKey }) {
  const { user, nav } = useApp()
  const h = useApi(() => listHistory(user.id), [user.id, focusKey])
  const [rows, setRows] = useState(null)
  const [sel, setSel] = useState(new Set())
  const press = useRef(null)
  const longDone = useRef(false)

  useEffect(() => { if (h.data) setRows(h.data) }, [h.data])
  useEffect(() => {
    nav.setGuard(() => { if (sel.size) { setSel(new Set()); return true } return false })
    return () => nav.setGuard(null)
  }, [sel.size])

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function remove() {
    const ids = [...sel]
    try { await deleteHistory(user.id, ids); setRows((r) => r.filter((x) => !sel.has(x.episode_id))); setSel(new Set()) } catch { }
  }

  const groups = []
  ;(rows || []).forEach((r) => {
    const label = fmtDateId(r.updated_at)
    const g = groups[groups.length - 1]
    if (g && g.label === label) g.items.push(r); else groups.push({ label, items: [r] })
  })

  return (
    <div className="page-scroll">
      <div className="page-head">
        <h1>Riwayat Menonton</h1>
        <p>Tap tahan untuk memilih &amp; hapus</p>
      </div>

      {h.loading && !rows && <div style={{ padding: '0 14px' }}>{[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 92, borderRadius: 14, marginBottom: 12 }} />)}</div>}
      {h.error && <ErrorState error={h.error} onRetry={h.retry} />}
      {rows && rows.length === 0 && <EmptyState title="Belum ada riwayat" text="Anime yang kamu tonton akan muncul di sini." />}

      <div className="hist">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="date-pill">{g.label}</div>
            {g.items.map((r) => {
              const pct = r.duration ? Math.min(100, (r.progress / r.duration) * 100) : 0
              const on = sel.has(r.episode_id)
              return (
                <button
                  key={r.episode_id}
                  className={`hist-card ${on ? 'sel' : ''}`}
                  onTouchStart={() => { longDone.current = false; press.current = setTimeout(() => { longDone.current = true; toggle(r.episode_id) }, 500) }}
                  onTouchEnd={() => clearTimeout(press.current)}
                  onTouchMove={() => clearTimeout(press.current)}
                  onClick={() => {
                    if (longDone.current) { longDone.current = false; return }
                    if (sel.size) return toggle(r.episode_id)
                    nav.push('player', {
                      animeId: r.anime_id, episodeId: r.episode_id, episodeNumber: r.episode_number,
                      anime: { id: r.anime_id, title: r.anime_title, poster: r.anime_poster },
                    })
                  }}
                >
                  <div className="hist-poster"><Poster src={r.anime_poster} alt={r.anime_title} /></div>
                  <div className="hist-info">
                    <div className="hist-top"><strong>{r.anime_title}</strong><span>{fmtClock(r.updated_at)}</span></div>
                    <div className="muted small">Episode {r.episode_number}</div>
                    <div className="hist-bar"><i style={{ width: pct + '%' }} /></div>
                    {r.duration > 0 && <div className="hist-time">{fmtDur(r.progress)} / {fmtDur(r.duration)}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {sel.size > 0 && (
        <div className="selbar">
          <span>{sel.size} dipilih</span>
          <Button variant="danger" icon="trash" onClick={remove}>Hapus</Button>
        </div>
      )}
      <div style={{ height: 24 }} />
    </div>
  )
}
