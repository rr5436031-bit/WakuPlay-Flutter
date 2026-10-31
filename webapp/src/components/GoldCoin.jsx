export default function GoldCoin({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="12" cy="12" r="10" fill="#f5b50a" stroke="#b97a00" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6.8" fill="none" stroke="#ffe08a" strokeWidth="1.5" />
      <path d="M8.6 9.2 10.3 15l1.7-4.2 1.7 4.2 1.7-5.8" fill="none" stroke="#9a6200" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
