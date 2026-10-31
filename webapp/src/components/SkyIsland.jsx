import { memo, useId } from 'react'

const TOP = 'M50 60 C72 58 92 66 97 86 C99 100 90 116 66 120 C56 122 44 122 34 120 C10 116 1 100 3 86 C8 66 28 58 50 60 Z'
const CLIFF = 'M3 86 C3 100 8 113 20 123 L25 130 L30 127 L35 137 L42 132 L47 147 L52 138 L58 142 L64 131 L70 134 L76 125 C90 118 98 104 97.5 86 C99 100 90 116 66 120 C56 122 44 122 34 120 C10 116 1 100 3 86 Z'
const PILLAR = 'M30 63 C28 50 33 42 36 36 C38 30 41 26 46 24 C50 21 56 22 60 25 C65 28 68 36 70 44 C72 52 72 58 70 63 Z'

const rng = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 } }

function Cloud({ x, y, s = 1, o = 1, f, sh }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
      <ellipse cx="0" cy="3.4" rx="14" ry="2.4" fill={sh} opacity=".6" />
      <g fill={f}>
        <ellipse cx="0" cy="2" rx="15" ry="3.6" />
        <circle cx="-7" cy="-1" r="5" />
        <circle cx="0" cy="-3.5" r="6.6" />
        <circle cx="7.5" cy="-0.5" r="5.2" />
        <circle cx="12" cy="1" r="3.4" />
      </g>
    </g>
  )
}

function Fall({ x, y1, y2, w, g }) {
  const d = w * 0.12
  return (
    <g>
      <path d={`M${x - w / 2} ${y1} L${x + w / 2} ${y1} L${x + w / 2 + d} ${y2} L${x - w / 2 - d} ${y2} Z`} fill={`url(#${g})`} />
      {[-0.28, 0.06, 0.3].map((k, i) => (
        <line key={i} className="sk-flow keep" pathLength="100" x1={x + w * k} y1={y1} x2={x + w * k * 1.12} y2={y2}
          stroke="#fff" strokeOpacity=".75" strokeWidth={Math.max(w * 0.09, 0.32)} strokeDasharray="12 20" strokeLinecap="round"
          style={{ animationDuration: `${1.2 + i * 0.4}s`, animationDelay: `${-i * 0.37}s` }} />
      ))}
      <ellipse cx={x} cy={y1 + 0.3} rx={w * 0.62} ry={w * 0.15} fill="#fff" opacity=".9" />
    </g>
  )
}

function Tree({ x, y, s = 1, a = '#47ad84', b = '#78d99f' }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0.3" rx="3.4" ry="0.9" fill="#1d3a45" opacity=".28" />
      <rect x="-0.45" y="-4" width="0.9" height="4.2" rx=".3" fill="#6d4f45" />
      <circle cx="0" cy="-6.4" r="3.6" fill={a} />
      <circle cx="-2" cy="-5" r="2.5" fill={a} />
      <circle cx="2.1" cy="-5.2" r="2.4" fill={a} />
      <circle cx="-0.8" cy="-7.6" r="2" fill={b} opacity=".85" />
    </g>
  )
}

function Bush({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0.2" rx="4" ry="1" fill="#1d3a45" opacity=".25" />
      <circle cx="-1.8" cy="-1.2" r="2.2" fill="#3f9f7b" />
      <circle cx="1.6" cy="-1.3" r="2.4" fill="#4fb98b" />
      <circle cx="0" cy="-2.4" r="2" fill="#78d99f" />
      <circle cx="2.4" cy="-2.6" r=".45" fill="#fff" />
      <circle cx="-2.2" cy="-2.2" r=".4" fill="#d8b8ff" />
    </g>
  )
}

function Crystal({ x, y, s = 1, r = 0, a = '#e3c9ff', b = '#7ee0ff' }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M-2.4 0 L-1.6 -3.6 L-0.2 -6.4 L0.8 -3.2 L0.4 0 Z" fill={b} />
      <path d="M-0.2 -6.4 L0.8 -3.2 L0.4 0 L-0.8 0 L-1.6 -3.6 Z" fill={a} opacity=".75" />
      <path d="M0.6 0 L1.4 -2.8 L2.6 -4.6 L3.2 -2 L2.8 0 Z" fill={a} />
      <path d="M-0.2 -6.4 L0.2 -4 L-0.7 -3.4 Z" fill="#fff" opacity=".85" />
    </g>
  )
}

function Rock({ x, y, s = 1, cls, moss = true, crystal = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={`${cls} sk-b`}>
        <path d="M-6 0 L-3.5 -3.6 L1.5 -4.4 L6.2 -1 L3.6 1.2 L-3 1.6 Z" fill="#c1b8e6" />
        <path d="M-6 0 L-3 1.6 L3.6 1.2 L6.2 -1 L4.4 4.4 L1 8.2 L-1.6 5.8 L-4.4 3.6 Z" fill="#7d71b3" />
        <path d="M1 8.2 L4.4 4.4 L6.2 -1 L3.6 1.2 L1.2 4 Z" fill="#4f4488" opacity=".7" />
        {moss && <path d="M-5.6 -0.2 L-3.5 -3.6 L1.5 -4.4 L5.4 -1.4 C3 -1.6 2 -0.4 0.6 -1 C-1 -1.8 -2 0.2 -3.2 -0.2 C-4 -0.4 -4.8 0.4 -5.6 -0.2 Z" fill="#6fcf8f" />}
        {moss && <path d="M-2.4 -3.4 L-1.8 -5.2 L-1 -3.6 M0 -4 L0.5 -5.8 L1.2 -4" stroke="#8fe3a5" strokeWidth=".35" fill="none" strokeLinecap="round" />}
        {crystal && <Crystal x={3.4} y={-0.6} s={0.55} r={12} />}
        <path d="M-4.4 3 L-1 6.2 M-2 0.8 L2 3.4" stroke="#3d3470" strokeOpacity=".3" strokeWidth=".4" fill="none" />
      </g>
    </g>
  )
}

function Island({ x, y, s = 1, fall, cls, tint = 0.86, g }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={tint}>
      <g className={`${cls} sk-b`}>
        <path d="M-12 0 C-11 -2.6 11 -2.6 12 0 C12 3 7 6 4 12 C2 16 0 19 -1 21 C-3 17 -6 13 -9 8 C-11 5 -12 3 -12 0 Z" fill="#a79fd6" />
        <path d="M12 0 C12 3 7 6 4 12 C2 16 0 19 -1 21 C2 14 8 7 12 0 Z" fill="#6f65a8" opacity=".7" />
        <path d="M-12 0 C-11 -2.6 11 -2.6 12 0 C8 1.6 -8 1.6 -12 0 Z" fill="#83dcae" />
        <path d="M-12 0 C-8 1.8 8 1.8 12 0 C8 3.4 -8 3.4 -12 0 Z" fill="#4ea683" opacity=".8" />
        <path d="M-7 -2 L-7 -5.4 M-4 -2.3 L-4 -6 M5 -2.3 L5 -5.2" stroke="#4b8a6e" strokeWidth=".8" strokeLinecap="round" />
        <circle cx="-7" cy="-6" r="2.2" fill="#5bbf94" />
        <circle cx="-4" cy="-6.6" r="2.6" fill="#6fd09f" />
        <circle cx="5" cy="-5.8" r="2.1" fill="#5bbf94" />
        {fall && <Fall x={-9.4} y1={1.6} y2={90} w={2.6} g={g} />}
      </g>
    </g>
  )
}

function Bird({ y, dur, delay, s = 1, k = 1 }) {
  return (
    <g transform={`translate(0 ${y}) scale(${s})`}>
      <g className="sk-bird" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s`, '--k': k }}>
        <path className="sk-wing" d="M-2.4 0 Q-1.2 -1.7 0 0 Q1.2 -1.7 2.4 0" stroke="#5a4e92" strokeWidth=".5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ animationDuration: `${0.5 + (delay % 3) * 0.08}s` }} />
      </g>
    </g>
  )
}

function Butterfly({ x, y, c, dur, delay }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="sk-fly" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <g className="sk-wf" style={{ animationDelay: `${delay}s` }}>
          <ellipse cx="-0.9" cy="-0.4" rx="1" ry="0.7" fill={c} />
          <ellipse cx="0.9" cy="-0.4" rx="1" ry="0.7" fill={c} />
          <ellipse cx="-0.6" cy="0.6" rx="0.6" ry="0.5" fill="#fff" opacity=".8" />
          <ellipse cx="0.6" cy="0.6" rx="0.6" ry="0.5" fill="#fff" opacity=".8" />
        </g>
        <rect x="-0.12" y="-0.9" width="0.24" height="2" rx=".1" fill="#3d3470" />
      </g>
    </g>
  )
}

function Root({ x, y, len, k, d }) {
  const dx = k * 2.4
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="sk-sway keep" style={{ animationDelay: `${d}s`, animationDuration: `${4 + (d % 2)}s` }}>
        <path d={`M0 0 C${dx} ${len * 0.3} ${-dx} ${len * 0.6} ${dx * 0.5} ${len}`} stroke="#7a5c4a" strokeWidth=".7" fill="none" strokeLinecap="round" />
        <path d={`M${dx * 0.3} ${len * 0.35} l${k * 1.8} .9 M${-dx * 0.2} ${len * 0.62} l${-k * 1.6} 1`} stroke="#6aa86b" strokeWidth=".5" fill="none" strokeLinecap="round" />
        <circle cx={dx * 0.5} cy={len} r=".6" fill="#78d99f" />
      </g>
    </g>
  )
}

function SkyIsland() {
  const u = useId().replace(/[^a-zA-Z0-9]/g, '')
  const i = (n) => `${u}${n}`
  const ref = (n) => `url(#${i(n)})`
  const r = rng(77)
  const sparks = Array.from({ length: 18 }, (_, n) => ({ x: 6 + r() * 88, y: 40 + r() * 92, s: 0.28 + r() * 0.4, d: 5 + r() * 6, l: -r() * 10, c: n % 3 === 0 ? '#ffe9a0' : '#ffffff' }))
  const tufts = Array.from({ length: 26 }, () => ({ x: 9 + r() * 82, y: 68 + r() * 46, s: 0.7 + r() * 0.7 }))
  const flock = [[0, 16, 26, 0.9], [2.4, 19, 26, 1], [-2, 21, 26, 0.85], [4.6, 24, 26, 0.8], [1, 27, 26, 0.9]]
  return (
    <svg className="sky" viewBox="0 0 100 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={i('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#62b0ee" />
          <stop offset=".34" stopColor="#97d5f6" />
          <stop offset=".6" stopColor="#c9e6fb" />
          <stop offset=".8" stopColor="#d8cdf6" />
          <stop offset="1" stopColor="#a88fe0" />
        </linearGradient>
        <radialGradient id={i('sun')} cx="68" cy="32" r="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffbe0" stopOpacity="1" />
          <stop offset=".18" stopColor="#ffeaa0" stopOpacity=".75" />
          <stop offset=".5" stopColor="#ffd98a" stopOpacity=".22" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={i('ray')} x1="0" y1="32" x2="0" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff3c2" stopOpacity=".34" />
          <stop offset="1" stopColor="#fff3c2" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={i('rock')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b3abdc" />
          <stop offset=".5" stopColor="#8379b9" />
          <stop offset="1" stopColor="#5c4f94" />
        </linearGradient>
        <linearGradient id={i('shade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c2362" stopOpacity=".5" />
          <stop offset=".35" stopColor="#2c2362" stopOpacity=".12" />
          <stop offset="1" stopColor="#6b4fb0" stopOpacity=".34" />
        </linearGradient>
        <radialGradient id={i('grass')} cx="50" cy="92" r="52" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 92) scale(1 .62) translate(-50 -92)">
          <stop offset="0" stopColor="#c6f3b4" />
          <stop offset=".55" stopColor="#8edda2" />
          <stop offset="1" stopColor="#4fb893" />
        </radialGradient>
        <linearGradient id={i('fall')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".96" />
          <stop offset=".5" stopColor="#d3f0ff" stopOpacity=".86" />
          <stop offset="1" stopColor="#9fdcff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={i('pond')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c8f4ff" />
          <stop offset="1" stopColor="#62c4ea" />
        </linearGradient>
        <radialGradient id={i('mist')}>
          <stop offset="0" stopColor="#fff" stopOpacity=".8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={i('moss')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8be0a6" />
          <stop offset="1" stopColor="#47a883" />
        </linearGradient>
        <pattern id={i('blade')} width="7" height="6" patternUnits="userSpaceOnUse">
          <path d="M1 5 L1.6 2.4 M3.4 5.4 L3.9 1.8 M5.6 4.6 L5.2 2.6" stroke="#2f8f74" strokeOpacity=".28" strokeWidth=".4" strokeLinecap="round" fill="none" />
          <circle cx="2.4" cy="1" r=".28" fill="#fff" opacity=".35" />
        </pattern>
      </defs>

      <rect width="100" height="150" fill={ref('sky')} />
      <rect width="100" height="150" fill={ref('sun')} />
      <circle cx="68" cy="32" r="6.2" fill="#fffbe6" />
      <circle cx="68" cy="32" r="9" fill="#fff3b8" opacity=".4" />

      <g className="sk-ray keep">
        <polygon points="68,32 -6,150 14,150" fill={ref('ray')} />
        <polygon points="68,32 22,150 40,150" fill={ref('ray')} />
        <polygon points="68,32 50,150 66,150" fill={ref('ray')} />
        <polygon points="68,32 78,150 96,150" fill={ref('ray')} />
        <polygon points="68,32 104,150 124,150" fill={ref('ray')} />
      </g>

      <g className="sk-da keep">
        <Cloud x={14} y={14} s={0.9} o={0.7} f="#f4f8ff" sh="#c9daf5" />
        <Cloud x={88} y={10} s={0.7} o={0.65} f="#f4f8ff" sh="#c9daf5" />
        <Cloud x={34} y={34} s={0.6} o={0.6} f="#f4f8ff" sh="#c9daf5" />
      </g>

      <Island x={14} y={44} s={0.95} cls="sk-b1" fall g={i('fall')} />
      <Island x={88} y={30} s={0.8} cls="sk-b2" fall g={i('fall')} />
      <Island x={30} y={20} s={0.5} cls="sk-b3" tint={0.78} />
      <Island x={74} y={9} s={0.42} cls="sk-b4" tint={0.74} />

      <g className="sk-db keep">
        <Cloud x={6} y={66} s={1.1} o={0.92} f="#fff" sh="#cddcf8" />
        <Cloud x={95} y={60} s={1.2} o={0.92} f="#fff" sh="#cddcf8" />
        <Cloud x={50} y={72} s={0.9} o={0.7} f="#fff" sh="#cddcf8" />
      </g>

      <path d={PILLAR} fill={ref('rock')} />
      <path d="M33 52 C42 49 56 50 68 53 M31 44 C40 41 55 41 66 44 M35 36 C44 35 54 35 62 36" stroke="#fff" strokeOpacity=".12" strokeWidth=".7" fill="none" />
      <path d="M32 58 C42 56 56 57 69 59 M34 48 C43 46 55 47 67 49" stroke="#2d2560" strokeOpacity=".18" strokeWidth=".6" fill="none" />
      <path d={PILLAR} fill={ref('shade')} opacity=".45" />
      <path d="M60 25 C65 28 68 36 70 44 C72 52 72 58 70 63" stroke="#ffe9a0" strokeOpacity=".8" strokeWidth=".7" fill="none" strokeLinecap="round" />
      <path d="M36 36 C38 30 41 26 46 24 C50 21 56 22 60 25 C64 28 66 33 67 38 C60 34 52 33 46 34 C42 35 39 37 36 36 Z" fill={ref('moss')} />
      <path d="M47 24.6 L53 24.2 L52.6 27 L47.6 27.4 Z" fill="#4f4a8c" />
      <Tree x={40} y={31} s={0.8} />
      <Tree x={62} y={32.5} s={0.7} a="#3f9f7b" />
      <Bush x={56} y={27.4} s={0.7} />
      <Root x={33.6} y={50} len={9} k={1} d={0.4} />
      <Root x={36} y={46} len={7} k={-1} d={1.2} />
      <Root x={66} y={52} len={8} k={1} d={2} />
      <Crystal x={32.4} y={61} s={1.1} r={-10} />
      <Crystal x={34.6} y={61.6} s={0.75} r={8} a="#cfe4ff" b="#9d8bff" />
      <Crystal x={68.4} y={61} s={1} r={10} />
      <Fall x={50} y1={26.4} y2={62} w={6.6} g={i('fall')} />
      <ellipse cx="50" cy="61" rx="8.5" ry="2.1" fill="#fff" opacity=".85" />
      <ellipse className="sk-mist keep" cx="50" cy="58" rx="13" ry="5" fill={ref('mist')} />

      <g className="sk-dc keep">
        <Cloud x={10} y={122} s={1.5} o={0.96} f="#fff" sh="#c8d6f6" />
        <Cloud x={92} y={126} s={1.6} o={0.96} f="#fff" sh="#c8d6f6" />
      </g>

      <Fall x={4.6} y1={90} y2={150} w={3.2} g={i('fall')} />
      <Fall x={95.6} y1={92} y2={150} w={2.4} g={i('fall')} />

      <path d={CLIFF} fill={ref('rock')} />
      <path d="M10 112 C22 118 36 119 52 119 M14 120 C28 126 44 127 60 126 M22 128 C34 133 50 134 66 131 M40 138 C48 141 56 141 62 138" stroke="#fff" strokeOpacity=".13" strokeWidth=".7" fill="none" strokeLinecap="round" />
      <path d="M8 108 C18 115 30 117 46 118 M12 124 C24 130 40 131 56 129 M30 134 C40 138 52 138 60 135" stroke="#2d2560" strokeOpacity=".2" strokeWidth=".7" fill="none" strokeLinecap="round" />
      <path d={CLIFF} fill={ref('shade')} />
      <path d="M97.5 86 C98 104 90 118 76 125 L70 134 L64 131 L58 142 L52 138 L47 147" stroke="#ffe9a0" strokeOpacity=".5" strokeWidth=".6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Crystal x={28} y={125} s={1.2} r={-8} />
      <Crystal x={31} y={125.6} s={0.8} r={10} a="#cfe4ff" b="#9d8bff" />
      <Crystal x={70} y={129} s={1.1} r={12} />
      <Crystal x={14} y={112} s={0.9} r={-14} a="#cfe4ff" b="#9d8bff" />
      <Crystal x={52} y={140} s={0.8} r={4} />
      <Root x={14} y={108} len={13} k={1} d={0.2} />
      <Root x={24} y={118} len={14} k={-1} d={1} />
      <Root x={38} y={123} len={12} k={1} d={1.8} />
      <Root x={58} y={125} len={13} k={-1} d={0.6} />
      <Root x={74} y={122} len={12} k={1} d={1.4} />
      <Root x={88} y={108} len={11} k={-1} d={2.2} />

      <path d={TOP} fill={ref('grass')} />
      <path d={TOP} fill={ref('blade')} />
      <path d="M50 60 C72 58 92 66 97 86 C99 100 90 116 66 120 C56 122 44 122 34 120 C10 116 1 100 3 86 C8 66 28 58 50 60 Z" fill="none" stroke="#45a583" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 74 C20 62 40 58 52 59.4 C70 58 86 64 93 76" stroke="#fff4c0" strokeOpacity=".75" strokeWidth=".8" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="92" rx="30" ry="12" fill="#e8ffd0" opacity=".16" />
      <path d="M34 119 C24 118 12 114 6 104 M66 119.4 C78 118 90 112 95 100" stroke="#8be0a6" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeDasharray="1.6 1.4" />
      {tufts.map((t, n) => (
        <path key={n} d={`M${t.x} ${t.y} l-.7 -1.8 M${t.x} ${t.y} l.1 -2.2 M${t.x} ${t.y} l.8 -1.7`} transform={`translate(0 0) scale(${t.s})`} style={{ transformOrigin: `${t.x}px ${t.y}px` }} stroke="#2f9a78" strokeOpacity=".5" strokeWidth=".4" fill="none" strokeLinecap="round" />
      ))}

      <path d="M38 64 C28 65 20 71 13 82" stroke="#bdeeff" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".85" />
      <path d="M62 64 C72 65 80 71 87 82" stroke="#bdeeff" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity=".75" />
      <ellipse cx="50" cy="64.4" rx="13.5" ry="3.9" fill="#4fae8f" />
      <ellipse cx="50" cy="64.1" rx="12.4" ry="3.3" fill={ref('pond')} />
      <path d="M42 63.6 C46 62.6 54 62.6 58 63.6" stroke="#fff" strokeOpacity=".8" strokeWidth=".5" fill="none" strokeLinecap="round" />
      <ellipse className="sk-rip keep" cx="50" cy="64.4" rx="5" ry="1.3" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth=".35" />
      <ellipse cx="50" cy="63" rx="6" ry="1.4" fill="#fff" opacity=".5" />
      <ellipse className="sk-mist keep" cx="50" cy="62" rx="15" ry="4.4" fill={ref('mist')} style={{ animationDelay: '-2s' }} />

      <Bush x={22} y={65} s={1.2} />
      <Bush x={80} y={66} s={1.1} />
      <Tree x={31} y={63} s={1.1} />
      <Tree x={70} y={63.4} s={1} a="#3f9f7b" />
      <Tree x={8.5} y={84} s={1.3} />
      <Tree x={91.5} y={86} s={1.2} a="#3f9f7b" />
      <Bush x={6} y={96} s={1} />
      <Bush x={94} y={98} s={1} />
      <Rock x={15} y={72} s={1.1} cls="sk-b2" crystal />
      <Rock x={86} y={73} s={1.2} cls="sk-b3" />
      <Crystal x={12} y={98} s={1} r={-10} />
      <Crystal x={14.4} y={98.6} s={0.7} r={8} a="#cfe4ff" b="#9d8bff" />
      <Crystal x={89} y={102} s={0.9} r={12} />
      {[[19, 70], [24, 72], [76, 71], [82, 69], [11, 90], [90, 92], [27, 66], [73, 66]].map(([x, y], n) => (
        <g key={n}>
          <path d={`M${x} ${y} l0 -1.6`} stroke="#3f9f7b" strokeWidth=".3" />
          <circle cx={x} cy={y - 1.9} r=".62" fill={n % 2 ? '#e3c9ff' : '#fff7c8'} />
        </g>
      ))}

      <Rock x={9} y={52} s={1.3} cls="sk-b1" crystal />
      <Rock x={92} y={50} s={1} cls="sk-b4" />
      <Rock x={18} y={140} s={1.1} cls="sk-b3" />
      <Rock x={84} y={142} s={1.3} cls="sk-b1" crystal />
      <Rock x={4} y={116} s={0.7} cls="sk-b4" />
      <Rock x={97} y={116} s={0.8} cls="sk-b2" />
      <Rock x={37} y={20} s={0.5} cls="sk-b2" />

      <g className="sk-dd keep">
        <Cloud x={6} y={142} s={1.9} o={1} f="#fff" sh="#c6d3f4" />
        <Cloud x={50} y={148} s={2.4} o={1} f="#fff" sh="#c6d3f4" />
        <Cloud x={94} y={143} s={1.9} o={1} f="#fff" sh="#c6d3f4" />
      </g>
      <ellipse className="sk-mist keep" cx="5" cy="140" rx="9" ry="4" fill={ref('mist')} style={{ animationDelay: '-1s' }} />
      <ellipse className="sk-mist keep" cx="96" cy="141" rx="8" ry="3.6" fill={ref('mist')} style={{ animationDelay: '-3s' }} />
      <ellipse className="sk-mist keep" cx="50" cy="124" rx="34" ry="5" fill={ref('mist')} opacity=".5" style={{ animationDelay: '-2.4s' }} />

      <Bird y={14} dur={38} delay={-6} s={1} />
      <Bird y={22} dur={46} delay={-24} s={0.8} />
      <Bird y={8} dur={54} delay={-40} s={0.7} />
      {flock.map(([dx, dy, , sc], n) => (
        <g key={n} transform={`translate(${dx} ${dy - 4})`}>
          <Bird y={0} dur={28} delay={-9 - n * 0.35} s={sc} />
        </g>
      ))}

      <Butterfly x={22} y={78} c="#ffd1ec" dur={7} delay={-1} />
      <Butterfly x={78} y={80} c="#ffe9a0" dur={8.5} delay={-3} />
      <Butterfly x={48} y={100} c="#cfe4ff" dur={9} delay={-5} />

      <g className="sk-leaf" style={{ animationDelay: '-3s' }}><path d="M0 0 Q1.4 -1.6 3 0 Q1.4 1.6 0 0 Z" fill="#7fd99a" /></g>
      <g className="sk-leaf l2" style={{ animationDelay: '-11s' }}><path d="M0 0 Q1.4 -1.6 3 0 Q1.4 1.6 0 0 Z" fill="#a6e8a8" /></g>
      <g className="sk-leaf l3" style={{ animationDelay: '-7s' }}><path d="M0 0 Q1.2 -1.4 2.6 0 Q1.2 1.4 0 0 Z" fill="#c9b0ff" /></g>

      {sparks.map((p, n) => (
        <circle key={n} className="sk-spark" cx={p.x} cy={p.y} r={p.s} fill={p.c} style={{ animationDuration: `${p.d}s`, animationDelay: `${p.l}s` }} />
      ))}

      <polygon points="64,34 40,150 62,150" fill="#fff6cf" opacity=".07" />
      <polygon points="72,34 70,150 92,150" fill="#fff6cf" opacity=".06" />
      <rect width="100" height="150" fill={ref('sun')} opacity=".35" />
    </svg>
  )
}

export default memo(SkyIsland)
