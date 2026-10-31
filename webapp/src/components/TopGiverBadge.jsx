export default function TopGiverBadge({ rank }) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) return null
  return (
    <div className="toplb tgb" role="img" aria-label={`Peringkat ${rank} Top Giver bulanan`}>
      <span className="toplb-t">TOP <b>{rank}</b></span>
      <span className="toplb-s">GIVER BULANAN</span>
    </div>
  )
}
