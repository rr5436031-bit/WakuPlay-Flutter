export default function TopLevelBadge({ rank }) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 10) return null
  return (
    <div className="toplb tlb" role="img" aria-label={`Peringkat ${rank} Top Level`}>
      <span className="toplb-t">TOP <b>{rank}</b></span>
      <span className="toplb-s">LEVEL TERTINGGI</span>
    </div>
  )
}
