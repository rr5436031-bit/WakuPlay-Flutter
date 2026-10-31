export default function TopLbBadge({ rank }) {
  if (!rank) return null
  return (
    <div className="toplb" role="img" aria-label={`Peringkat ${rank} leaderboard bulanan`}>
      <span className="toplb-t">TOP <b>{rank}</b></span>
      <span className="toplb-s">LB BULANAN</span>
    </div>
  )
}
