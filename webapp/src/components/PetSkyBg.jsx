import { memo, useId } from 'react'

// Latar halaman Pet: langit pagi di atas awan, sewarna dengan SkyIsland supaya pulau terasa "melayang" di tempat yang sama.
// Murni SVG statis + animasi drift CSS yang sudah ada (sk-da/db/dc/dd), jadi otomatis ikut mati di mode hemat (.lite/.lowfx).

function Cloud({ x, y, s = 1, o = 1, f = '#fff', sh = '#cddcf8' }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
      <ellipse cx="0" cy="3.6" rx="15" ry="2.6" fill={sh} opacity=".6" />
      <g fill={f}>
        <ellipse cx="0" cy="2" rx="16" ry="3.8" />
        <circle cx="-8" cy="-1" r="5.2" />
        <circle cx="0" cy="-4" r="7" />
        <circle cx="8" cy="-.6" r="5.6" />
        <circle cx="13" cy="1" r="3.6" />
      </g>
    </g>
  )
}

function MiniIsland({ x, y, s = 1, o = 0.8, cls }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
      <g className={`${cls} keep`}>
        <path d="M-12 0 C-11 -2.6 11 -2.6 12 0 C12 3 7 6 4 12 C2 16 0 19 -1 21 C-3 17 -6 13 -9 8 C-11 5 -12 3 -12 0 Z" fill="#a79fd6" />
        <path d="M12 0 C12 3 7 6 4 12 C2 16 0 19 -1 21 C2 14 8 7 12 0 Z" fill="#6f65a8" opacity=".7" />
        <path d="M-12 0 C-11 -2.6 11 -2.6 12 0 C8 1.6 -8 1.6 -12 0 Z" fill="#83dcae" />
        <path d="M-12 0 C-8 1.8 8 1.8 12 0 C8 3.4 -8 3.4 -12 0 Z" fill="#4ea683" opacity=".8" />
        <path d="M-6 -2 L-6 -5 M3 -2.3 L3 -5.6" stroke="#4b8a6e" strokeWidth=".8" strokeLinecap="round" />
        <circle cx="-6" cy="-5.6" r="2.2" fill="#5bbf94" />
        <circle cx="3" cy="-6.2" r="2.6" fill="#6fd09f" />
      </g>
    </g>
  )
}

function PetSkyBg() {
  const u = useId().replace(/[^a-zA-Z0-9]/g, '')
  const g = (n) => `${u}${n}`
  const ref = (n) => `url(#${g(n)})`
  return (
    <svg className="sky pet-sky" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f8fe3" />
          <stop offset=".22" stopColor="#6db8f1" />
          <stop offset=".46" stopColor="#a9dbf8" />
          <stop offset=".7" stopColor="#d6e6fa" />
          <stop offset=".88" stopColor="#e6d9f7" />
          <stop offset="1" stopColor="#c9b2ee" />
        </linearGradient>
        <radialGradient id={g('sun')} cx="82" cy="22" r="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffbe0" stopOpacity=".95" />
          <stop offset=".2" stopColor="#ffeaa0" stopOpacity=".5" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="100" height="200" fill={ref('sky')} />
      <rect width="100" height="200" fill={ref('sun')} />
      <circle cx="82" cy="22" r="5.5" fill="#fffbe6" opacity=".9" />

      {/* awan tipis jauh */}
      <g className="sk-da keep">
        <Cloud x={18} y={24} s={1.1} o={0.55} sh="#b7d3f5" />
        <Cloud x={62} y={44} s={0.8} o={0.5} sh="#b7d3f5" />
        <Cloud x={90} y={62} s={1} o={0.5} sh="#b7d3f5" />
      </g>

      {/* pulau-pulau kecil di kejauhan */}
      <MiniIsland x={12} y={50} s={0.9} o={0.7} cls="sk-b1" />
      <MiniIsland x={90} y={96} s={0.75} o={0.65} cls="sk-b2" />
      <MiniIsland x={6} y={132} s={0.6} o={0.6} cls="sk-b3" />

      {/* awan tengah */}
      <g className="sk-db keep">
        <Cloud x={8} y={84} s={1.5} o={0.9} />
        <Cloud x={84} y={118} s={1.7} o={0.92} />
        <Cloud x={30} y={150} s={1.3} o={0.85} />
      </g>

      {/* lautan awan di bawah (di belakang dock) */}
      <g className="sk-dc keep">
        <Cloud x={92} y={160} s={2.2} o={0.96} sh="#c8d6f6" />
        <Cloud x={2} y={172} s={2.6} o={0.98} sh="#c8d6f6" />
      </g>
      <g className="sk-dd keep">
        <Cloud x={50} y={186} s={3.4} o={1} sh="#c6d3f4" />
        <Cloud x={8} y={196} s={3} o={1} sh="#c6d3f4" />
        <Cloud x={94} y={194} s={3.2} o={1} sh="#c6d3f4" />
      </g>
    </svg>
  )
}

export default memo(PetSkyBg)
