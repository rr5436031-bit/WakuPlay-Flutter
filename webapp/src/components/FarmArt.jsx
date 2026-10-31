
const Trunk = ({ d = 'M52 150 C54 125 54 105 50 88 L70 88 C66 105 66 125 68 150Z' }) => (
  <>
    <path d={d} fill="#7a4d2b" />
    <path d="M58 150 C59 125 59 105 57 88 L62 88 C62 105 62 125 63 150Z" fill="#9a6338" opacity=".7" />
    <path d="M55 142 q2 -6 0 -12 M64 134 q-2 -6 0 -12 M57 118 q1 -5 0 -9 M62 104 q1 -4 0 -8" stroke="#5a3519" strokeWidth="1.2" fill="none" opacity=".55" strokeLinecap="round" />
    <path d="M49 150 q4 -5 9 -3 M62 147 q6 -2 11 3" stroke="#7a4d2b" strokeWidth="3.2" fill="none" strokeLinecap="round" />
  </>
)
const Ball = ({ c, x, y, r, o = 1 }) => <circle cx={x} cy={y} r={r} fill={c} opacity={o} />
const Sparkle = ({ x, y, d = 0, c = '#fff' }) => <path className="fa-twinkle" style={{ animationDelay: `${d}s` }} d={`M${x} ${y - 5} l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z`} fill={c} />
const Leaf = ({ x, y, d = 0, c = '#52cf6e' }) => <ellipse className="fa-leaf" style={{ animationDelay: `${d}s` }} cx={x} cy={y} rx="3.4" ry="1.8" fill={c} />

export function TreeArt({ id }) {
  let trunk, crown
  if (id === 'tree_pine') {
    trunk = <rect x="54" y="116" width="12" height="34" rx="2" fill="#6b4426" />
    crown = (
      <>
        <path d="M60 8 L88 50 H32Z" fill="#1f7a4a" /><path d="M60 8 L72 50 H60Z" fill="#2a935c" opacity=".7" />
        <path d="M60 30 L94 80 H26Z" fill="#23885a" /><path d="M60 30 L76 80 H60Z" fill="#2fa36a" opacity=".6" />
        <path d="M60 56 L102 118 H18Z" fill="#2a9a63" /><path d="M60 56 L80 118 H60Z" fill="#38b576" opacity=".55" />
        <path d="M30 80 q8 4 16 0 M74 80 q8 4 16 0 M22 118 q10 5 20 0 M78 118 q10 5 20 0" stroke="#e9fff2" strokeWidth="2" fill="none" opacity=".35" strokeLinecap="round" />
        <path d="M60 0 l3 7 7 .5 -5.5 4.5 2 7 -6.5 -4 -6.5 4 2 -7 -5.5 -4.5 7 -.5z" fill="#ffd54a" className="fa-pulse" />
        <Ball c="#ff5a67" x={44} y={72} r={3} /><Ball c="#ffd54a" x={74} y={92} r={3} /><Ball c="#5ac8ff" x={36} y={104} r={3} /><Ball c="#ff5a67" x={80} y={64} r={3} />
        <Sparkle x={50} y={46} d={0} c="#fff3a0" /><Sparkle x={70} y={74} d={0.6} c="#fff3a0" /><Sparkle x={46} y={98} d={1.1} c="#fff3a0" /><Sparkle x={86} y={106} d={1.6} c="#fff3a0" />
      </>
    )
  } else if (id === 'tree_sakura') {
    trunk = (
      <>
        <Trunk d="M54 150 C58 128 52 108 46 92 L66 86 C66 106 66 128 68 150Z" />
        <path d="M58 104 L36 84M62 98 L88 78" stroke="#7a4d2b" strokeWidth="5" strokeLinecap="round" />
      </>
    )
    crown = (
      <>
        <Ball c="#ff95bd" x={60} y={70} r={30} /><Ball c="#ffa6c9" x={60} y={46} r={34} /><Ball c="#ffb8d3" x={34} y={64} r={26} /><Ball c="#ffb8d3" x={88} y={64} r={26} />
        <Ball c="#ffd0e2" x={46} y={36} r={19} /><Ball c="#ffd0e2" x={78} y={34} r={19} /><Ball c="#fff0f6" x={58} y={26} r={11} o={0.8} />
        {[[38, 56], [76, 48], [58, 74], [90, 70], [48, 84], [70, 30], [24, 74], [100, 60]].map(([x, y], i) => <Ball key={i} c="#fff" x={x} y={y} r={2.6} o={0.85} />)}
        {[[30, 20], [70, 6], [96, 30], [50, 10], [20, 50]].map(([x, y], i) => <ellipse key={i} className="fa-petal" style={{ animationDelay: `${i * 0.9}s` }} cx={x} cy={y} rx="3.2" ry="1.8" fill="#ffc2da" />)}
      </>
    )
  } else if (id === 'tree_palm') {
    const fr = [
      'M64 66 C40 40 20 46 6 68 C26 58 44 58 64 66Z', 'M64 66 C88 40 108 46 122 68 C102 58 84 58 64 66Z',
      'M64 66 C56 38 64 14 82 6 C78 28 72 46 64 66Z', 'M64 66 C74 38 62 16 44 8 C48 30 54 46 64 66Z',
      'M64 66 C50 74 36 94 38 112 C48 94 56 82 64 66Z', 'M64 66 C78 74 92 94 90 112 C80 94 72 82 64 66Z',
    ]
    trunk = (
      <>
        <path d="M56 150 C62 124 66 98 60 68 L69 66 C77 98 73 126 67 150Z" fill="#a8703a" />
        {[80, 92, 104, 116, 128, 140].map((y) => <path key={y} d={`M${58 + (y - 80) * -0.03} ${y} h${14 + (y - 80) * 0.03}`} stroke="#7d4f22" strokeWidth="2" />)}
      </>
    )
    crown = (
      <>
        {fr.map((d, i) => <path key={i} className="fa-frond" style={{ transformBox: 'view-box', transformOrigin: '64px 66px', animationDelay: `${-i * 0.55}s` }} d={d} fill={i % 2 ? '#2f9d49' : '#3fb85a'} stroke="#23783a" strokeWidth="1" />)}
        <Ball c="#6b4426" x={60} y={72} r={5} /><Ball c="#7a4d2b" x={69} y={74} r={5} />
      </>
    )
  } else if (id === 'tree_rainbow') {
    trunk = <Trunk />
    crown = (
      <>
        {['#ff4d6d', '#ff9f1c', '#ffd60a', '#52cf6e', '#3a86ff', '#9b5de5'].map((c, i) => <path key={c} d={`M${6 + i * 5} 70 A ${54 - i * 5} ${54 - i * 5} 0 0 1 ${114 - i * 5} 70`} fill="none" stroke={c} strokeWidth="5.5" opacity=".9" />)}
        <Ball c="#2c8f46" x={60} y={56} r={30} /><Ball c="#36ab52" x={38} y={72} r={22} /><Ball c="#36ab52" x={82} y={72} r={22} /><Ball c="#52cf6e" x={60} y={44} r={20} /><Ball c="#7be88f" x={52} y={38} r={10} o={0.7} />
        {[[42, 56], [78, 52], [60, 76], [92, 74]].map(([x, y], i) => <Sparkle key={i} x={x} y={y} d={i * 0.5} />)}
      </>
    )
  } else {
    trunk = (
      <>
        <Trunk />
        <path d="M60 104 L38 80M60 98 L84 74M58 112 L46 100" stroke="#7a4d2b" strokeWidth="5" strokeLinecap="round" />
      </>
    )
    crown = (
      <>
        <Ball c="#1f6f37" x={60} y={78} r={30} />
        <Ball c="#2c8f46" x={60} y={50} r={34} /><Ball c="#2f9d49" x={32} y={68} r={26} /><Ball c="#2f9d49" x={88} y={68} r={26} />
        <Ball c="#36ab52" x={60} y={68} r={27} /><Ball c="#3fb85a" x={44} y={42} r={20} /><Ball c="#3fb85a" x={78} y={40} r={20} /><Ball c="#52cf6e" x={60} y={30} r={17} />
        {[[24, 62], [44, 24], [74, 22], [98, 60], [64, 58], [34, 80], [86, 82]].map(([x, y], i) => <Ball key={i} c="#7be88f" x={x} y={y} r={6} o={0.35} />)}
        <Ball c="#9bf0a8" x={50} y={32} r={8} o={0.45} />
        {[[40, 60], [74, 54], [58, 80], [88, 72], [46, 84], [64, 46], [26, 74]].map(([x, y], i) => <g key={i}><Ball c="#e63946" x={x} y={y} r={4} /><Ball c="#ff8a92" x={x - 1.3} y={y - 1.3} r={1.2} /></g>)}
        <Leaf x={34} y={96} d={0} /><Leaf x={60} y={102} d={1.8} c="#7be88f" /><Leaf x={86} y={98} d={3.4} />
      </>
    )
  }
  return (
    <svg className="fa-tree" viewBox="0 0 120 150" aria-hidden="true">
      <g className="fa-sway">{trunk}<g className="fa-canopy">{crown}</g></g>
    </svg>
  )
}

export function LampArt({ id }) {
  let body
  if (id === 'lamp_torch') {
    body = (
      <>
        <ellipse cx="30" cy="95" rx="30" ry="6" fill="#000" opacity=".18" />
        <ellipse cx="9" cy="90" rx="8" ry="6" fill="#6c717b" /><ellipse cx="9" cy="88.500" rx="7" ry="4.500" fill="#9aa0aa" />
        <ellipse cx="51" cy="90" rx="8" ry="6" fill="#6c717b" /><ellipse cx="51" cy="88.500" rx="7" ry="4.500" fill="#9aa0aa" />
        <ellipse cx="20" cy="96" rx="8" ry="5.500" fill="#6c717b" /><ellipse cx="20" cy="94.500" rx="7" ry="4" fill="#9aa0aa" />
        <ellipse cx="40" cy="96" rx="8" ry="5.500" fill="#6c717b" /><ellipse cx="40" cy="94.500" rx="7" ry="4" fill="#9aa0aa" />
        <rect x="10" y="82" width="42" height="9" rx="4.500" transform="rotate(-14 31 86)" fill="#5a3519" /><rect x="10" y="82" width="42" height="9" rx="4.500" transform="rotate(14 31 86)" fill="#6b4426" />
        <path className="fa-fl f1" d="M30 24 C42 44 50 58 47 74 C44 88 16 88 13 74 C10 58 22 48 30 24Z" fill="#ff6a1a" />
        <path className="fa-fl f2" d="M30 40 C38 54 42 64 40 76 C38 86 22 86 20 76 C18 64 26 56 30 40Z" fill="#ffa62b" />
        <path className="fa-fl f3" d="M30 56 C35 64 37 70 35 78 C33 85 27 85 25 78 C23 70 27 64 30 56Z" fill="#fff0a0" />
        {[[22, 40, 0], [38, 34, 0.7], [30, 26, 1.300]].map(([x, y, d], i) => <circle key={i} className="fa-spark" style={{ animationDelay: `${d}s` }} cx={x} cy={y} r="1.500" fill="#ffd27a" />)}
      </>
    )
  } else if (id === 'lamp_bulb') {
    body = (
      <>
        <ellipse cx="30" cy="97" rx="14" ry="3.500" fill="#000" opacity=".2" />
        <rect x="28" y="44" width="4" height="52" fill="#2b3447" /><rect x="22" y="92" width="16" height="6" rx="2" fill="#1f2738" />
        <circle cx="30" cy="30" r="22" fill="#ffe58a" opacity=".25" className="fa-pulse" />
        <path d="M18 36 C14 14 46 14 42 36 L38 46 H22Z" fill="#ffe58a" stroke="#c9a53a" strokeWidth="1.500" />
        <ellipse cx="30" cy="30" rx="8" ry="11" fill="#fff6c9" /><path d="M23 22 C24 17 28 15 31 15" stroke="#fff" strokeWidth="2.500" strokeLinecap="round" fill="none" opacity=".8" />
        <rect x="21" y="44" width="18" height="5" rx="2" fill="#2b3447" /><path d="M20 14 L30 6 L40 14Z" fill="#2b3447" />
      </>
    )
  } else if (id === 'lamp_crystal') {
    body = (
      <>
        <ellipse cx="30" cy="95" rx="16" ry="4" fill="#000" opacity=".2" />
        <circle cx="30" cy="46" r="30" fill="#6ea8ff" opacity=".2" className="fa-pulse" />
        <g className="fa-float">
          <polygon points="30,8 48,38 30,78 12,38" fill="#6ea8ff" stroke="#bcd7ff" strokeWidth="1.500" strokeLinejoin="round" />
          <polygon points="30,8 48,38 30,40" fill="#a9ccff" /><polygon points="30,8 12,38 30,40" fill="#8bb9ff" /><polygon points="30,78 48,38 30,40" fill="#4d84e6" /><polygon points="30,78 12,38 30,40" fill="#6a9cf5" />
          <path d="M22 28 L28 16" stroke="#fff" strokeWidth="2.500" strokeLinecap="round" opacity=".8" />
        </g>
        {[[10, 26], [52, 52], [48, 18]].map(([x, y], i) => <path key={i} className="fa-twinkle" style={{ animationDelay: `${i * 0.6}s` }} d={`M${x} ${y - 5} l1.500 3.500 3.500 1.500 -3.500 1.500 -1.500 3.500 -1.500 -3.500 -3.500 -1.500 3.500 -1.500z`} fill="#fff" />)}
        <path d="M16 90 h28 l-4 6 h-20z" fill="#7d8594" />
      </>
    )
  } else {
    body = (
      <>
        <ellipse cx="30" cy="97" rx="12" ry="3.500" fill="#000" opacity=".2" />
        <rect x="28" y="30" width="4" height="68" fill="#3a2a1a" /><path d="M30 32 H46 V42" fill="none" stroke="#3a2a1a" strokeWidth="3.500" strokeLinecap="round" />
        <circle cx="46" cy="56" r="20" fill="#ffb347" opacity=".28" className="fa-pulse" />
        <path d="M38 40 H54 L52 44 H40Z" fill="#7a2f12" /><rect x="39" y="44" width="14" height="22" rx="3" fill="#d9531e" /><rect x="42" y="47" width="8" height="16" rx="2" fill="#ffd36b" className="fa-pulse" />
        <path d="M39 66 H53 L51 70 H41Z" fill="#7a2f12" />
      </>
    )
  }
  return <svg className="fa-lamp" viewBox="0 0 60 100" aria-hidden="true">{body}</svg>
}

export function PetArt({ id }) {
  let body
  if (id === 'pet_cat') {
    body = (
      <>
        <path className="pa-tail" d="M44 52 C58 50 60 34 52 30" fill="none" stroke="#f29a3d" strokeWidth="6" strokeLinecap="round" />
        <ellipse cx="32" cy="46" rx="14" ry="13" fill="#f29a3d" /><ellipse cx="32" cy="50" rx="8" ry="8" fill="#ffe3c2" />
        <g className="pa-bob"><circle cx="32" cy="24" r="12" fill="#f29a3d" /><path d="M21 16 L22 4 L31 12Z M43 16 L42 4 L33 12Z" fill="#f29a3d" /><path d="M23 13 L24 8 L28 12Z M41 13 L40 8 L36 12Z" fill="#ffb3b3" />
          <path d="M26 14 v4 M32 12 v5 M38 14 v4" stroke="#c9741a" strokeWidth="1.800" strokeLinecap="round" />
          <ellipse cx="27" cy="25" rx="2.200" ry="2.800" fill="#fff" /><ellipse cx="37" cy="25" rx="2.200" ry="2.800" fill="#fff" /><ellipse cx="27" cy="25.500" rx="1.100" ry="2" fill="#222" className="pa-blink" /><ellipse cx="37" cy="25.500" rx="1.100" ry="2" fill="#222" className="pa-blink" />
          <path d="M30.500 30 h3 l-1.500 2z" fill="#ff7a8a" /><path d="M32 32 q-3 3 -5 1 M32 32 q3 3 5 1" stroke="#7a3d08" strokeWidth="1.200" fill="none" strokeLinecap="round" />
          <path d="M22 29 h-7 M22 32 h-6 M42 29 h7 M42 32 h6" stroke="#fff" strokeWidth=".9" strokeLinecap="round" opacity=".8" /></g>
        <ellipse cx="26" cy="57" rx="4.500" ry="3" fill="#fff" /><ellipse cx="38" cy="57" rx="4.500" ry="3" fill="#fff" />
      </>
    )
  } else if (id === 'pet_rabbit') {
    body = (
      <>
        <circle cx="48" cy="48" r="6" fill="#fff" /><ellipse cx="30" cy="46" rx="15" ry="14" fill="#f4f4f8" /><ellipse cx="30" cy="50" rx="8" ry="8" fill="#fff" />
        <g className="pa-bob"><ellipse cx="25" cy="10" rx="4.500" ry="12" fill="#f4f4f8" transform="rotate(-8 25 10)" /><ellipse cx="25" cy="11" rx="2.300" ry="8.500" fill="#ffc2d1" transform="rotate(-8 25 10)" />
          <ellipse cx="38" cy="10" rx="4.500" ry="12" fill="#f4f4f8" transform="rotate(8 38 10)" /><ellipse cx="38" cy="11" rx="2.300" ry="8.500" fill="#ffc2d1" transform="rotate(8 38 10)" />
          <circle cx="31" cy="28" r="12" fill="#f4f4f8" /><circle cx="26" cy="28" r="2" fill="#222" className="pa-blink" /><circle cx="36" cy="28" r="2" fill="#222" className="pa-blink" /><circle cx="26.600" cy="27.300" r=".6" fill="#fff" /><circle cx="36.600" cy="27.300" r=".6" fill="#fff" />
          <ellipse cx="31" cy="33" rx="2" ry="1.500" fill="#ff8fa6" /><path d="M31 34.500 q-2.500 3 -4.500 1 M31 34.500 q2.500 3 4.500 1" stroke="#b07080" strokeWidth="1" fill="none" strokeLinecap="round" />
          <circle cx="23" cy="33" r="2.500" fill="#ffc2d1" opacity=".7" /><circle cx="39" cy="33" r="2.500" fill="#ffc2d1" opacity=".7" /></g>
        <ellipse cx="24" cy="58" rx="5" ry="3" fill="#fff" /><ellipse cx="36" cy="58" rx="5" ry="3" fill="#fff" />
      </>
    )
  } else if (id === 'pet_dog') {
    body = (
      <>
        <path className="pa-tail" d="M44 52 C54 50 58 40 54 34" fill="none" stroke="#b9732f" strokeWidth="6" strokeLinecap="round" />
        <ellipse cx="31" cy="46" rx="14" ry="13" fill="#c98240" /><ellipse cx="31" cy="50" rx="8" ry="8" fill="#f6dfc0" />
        <g className="pa-bob"><ellipse cx="17" cy="24" rx="6" ry="11" fill="#7a4a1d" transform="rotate(12 17 24)" /><ellipse cx="46" cy="24" rx="6" ry="11" fill="#7a4a1d" transform="rotate(-12 46 24)" />
          <circle cx="31.500" cy="24" r="12.500" fill="#c98240" /><ellipse cx="31.500" cy="30" rx="8" ry="6.500" fill="#f6dfc0" /><circle cx="26" cy="21" r="2.200" fill="#222" className="pa-blink" /><circle cx="37" cy="21" r="2.200" fill="#222" className="pa-blink" />
          <circle cx="26.700" cy="20.300" r=".7" fill="#fff" /><circle cx="37.700" cy="20.300" r=".7" fill="#fff" /><ellipse cx="31.500" cy="27" rx="3.500" ry="2.600" fill="#222" /><path d="M31.500 29.500 v3 M28 33 q3.500 3 7 0" stroke="#222" strokeWidth="1.200" fill="none" strokeLinecap="round" /><path d="M29.500 33.500 q2 5 4 0z" fill="#ff7a8a" /></g>
        <ellipse cx="25" cy="57" rx="4.500" ry="3" fill="#f6dfc0" /><ellipse cx="37" cy="57" rx="4.500" ry="3" fill="#f6dfc0" />
      </>
    )
  } else if (id === 'pet_dragon') {
    body = (
      <>
        <path className="pa-tail" d="M46 52 C60 54 62 40 56 36 L52 42" fill="none" stroke="#3fae6e" strokeWidth="6" strokeLinecap="round" />
        <path className="pa-wing" d="M20 38 L4 22 L8 44 L16 46Z" fill="#7be0a4" stroke="#2f9d5e" strokeWidth="1.200" strokeLinejoin="round" /><path className="pa-wing" d="M42 38 L58 22 L54 44 L46 46Z" fill="#7be0a4" stroke="#2f9d5e" strokeWidth="1.200" strokeLinejoin="round" />
        <ellipse cx="31" cy="46" rx="14" ry="13" fill="#3fae6e" /><ellipse cx="31" cy="50" rx="8" ry="9" fill="#ffe28a" />
        <path d="M24 44 h14 M24 48 h14 M25 52 h12" stroke="#e0c25f" strokeWidth="1" opacity=".8" />
        <g className="pa-bob"><path d="M22 14 L19 3 L27 11Z M40 14 L43 3 L35 11Z" fill="#ffd54a" /><circle cx="31" cy="24" r="12.500" fill="#3fae6e" /><ellipse cx="31" cy="30" rx="8" ry="6" fill="#52c785" />
          <circle cx="25.500" cy="21" r="3" fill="#fff" /><circle cx="36.500" cy="21" r="3" fill="#fff" /><circle cx="26" cy="21.300" r="1.600" fill="#222" className="pa-blink" /><circle cx="37" cy="21.300" r="1.600" fill="#222" className="pa-blink" />
          <circle cx="28.500" cy="29" r="1" fill="#1f7a4a" /><circle cx="33.500" cy="29" r="1" fill="#1f7a4a" />
          <path className="pa-puff" d="M31 33 c3 2 4 5 1 6 c-3 1 -5 -2 -1 -6z" fill="#ff8a1f" /></g>
        <ellipse cx="25" cy="58" rx="4.500" ry="3" fill="#2f9d5e" /><ellipse cx="37" cy="58" rx="4.500" ry="3" fill="#2f9d5e" />
      </>
    )
  } else {
    body = (
      <g className="pa-bob">
        <path className="pa-tail" d="M22 38 q-10 -2 -13 8 q10 1 15 -6z" fill="#2f6fe0" />
        <ellipse cx="32" cy="40" rx="15" ry="13" fill="#4a8cff" /><ellipse cx="34" cy="45" rx="9" ry="7" fill="#d6e6ff" />
        <circle cx="40" cy="27" r="10.500" fill="#4a8cff" /><path d="M49 26 l9 3.500 -9 3.500z" fill="#ffb02e" />
        <circle cx="43" cy="25" r="3" fill="#fff" /><circle cx="43.700" cy="25.200" r="1.500" fill="#222" className="pa-blink" />
        <path d="M30 17 q4 -8 10 -4 q-6 0 -10 4z" fill="#ff6b6b" />
        <path className="pa-wing" d="M25 38 q9 -7 16 2 q-7 9 -16 -2z" fill="#2f6fe0" />
        <path d="M28 52v7M36 52v7M25 59h6M33 59h6" stroke="#ffb02e" strokeWidth="2.300" strokeLinecap="round" />
      </g>
    )
  }
  return <svg className="fa-pet" viewBox="0 0 64 64" aria-hidden="true">{body}</svg>
}

const SK = '#f0b98a', SKD = '#dc9b6d'
const PAL_M = { sh: '#c9453a', shd: '#8e2a22', ov: '#3d6fb4', ovd: '#2f5894', hair: '#5a3a1e', hat: '#f1d27a', hatd: '#c9a23f', band: '#b5472f' }
const PAL_F = { sh: '#f5b0c8', shd: '#d4799c', ov: '#4f8f6b', ovd: '#3b6f52', hair: '#33200f', hat: '#f4dc8e', hatd: '#cfa84a', band: '#e5557f' }

function Fork({ pole = '#8b5a2b', hand = SK, rr = 3.8, children }) {
  return (
    <g className="pr-fork">
      <rect x="61.4" y="26" width="3.2" height="101" rx="1.5" fill={pole} /><rect x="62.4" y="26" width="1" height="101" fill="#b07a40" opacity=".7" />
      <rect x="56" y="24" width="14" height="4" rx="1.8" fill="#9aa3ad" />
      {[56.6, 61.9, 67.2].map((x) => <path key={x} d={`M${x} 26 V10 L${x + 1.2} 6 L${x + 2.4} 10 V26Z`} fill="#c3cbd4" />)}
      <path d="M57.8 25 V12 M63.1 25 V12 M68.4 25 V12" stroke="#fff" strokeWidth=".6" opacity=".6" />
      {children}
      <circle cx="63" cy="77" r={rr} fill={hand} /><path d="M60.6 75.4 h4.8 M60.6 78 h4.8" stroke="rgba(0,0,0,.18)" strokeWidth=".7" />
    </g>
  )
}

function Farmer({ p, female }) {
  return (
    <>
      <ellipse cx="40" cy="127" rx="24" ry="3.6" fill="#000" opacity=".25" />
      <rect x="25" y="108" width="15" height="17" rx="4" fill="#4e3219" /><ellipse cx="30.5" cy="124" rx="9" ry="3.6" fill="#3a2410" />
      <rect x="40" y="108" width="15" height="17" rx="4" fill="#4e3219" /><ellipse cx="49.5" cy="124" rx="9" ry="3.6" fill="#3a2410" />
      <rect x="26" y="76" width="13.5" height="35" rx="3" fill={p.ov} /><rect x="40.5" y="76" width="13.5" height="35" rx="3" fill={p.ov} />
      <rect x="36" y="78" width="3.5" height="32" fill={p.ovd} opacity=".5" /><rect x="40.5" y="78" width="3.5" height="32" fill={p.ovd} opacity=".5" />
      <rect x="25" y="105" width="15.5" height="4.5" rx="2" fill={p.ovd} /><rect x="39.5" y="105" width="15.5" height="4.5" rx="2" fill={p.ovd} />
      <rect x="28" y="90" width="6" height="6" rx="1" fill="#6a9be0" opacity=".8" stroke={p.ovd} strokeWidth=".7" strokeDasharray="1.4 1" />
      <g className="pr-breathe">
        <path d="M23 52 Q40 45 57 52 L59 82 H21Z" fill={p.sh} />
        <path d="M28 52 V82 M35 50 V82 M45 50 V82 M52 52 V82 M22 58 H58 M21.5 68 H58.5" stroke={p.shd} strokeWidth="1.1" opacity=".4" />
        <path d="M29 62 H51 V82 H29Z" fill={p.ov} /><path d="M29 62 L27 50 h5.5 l3 12z M51 62 L53 50 h-5.5 l-3 12z" fill={p.ov} />
        <circle cx="30.5" cy="57" r="1.5" fill="#f4c542" /><circle cx="49.5" cy="57" r="1.5" fill="#f4c542" />
        <rect x="34" y="69" width="12" height="8" rx="1.5" fill={p.ovd} opacity=".7" /><path d="M34 71 H46" stroke="#6a9be0" strokeWidth=".7" opacity=".6" />
        <rect x="35" y="42" width="10" height="11" fill={SKD} /><path d="M33 49 L40 58 L47 49 L44.5 46 H35.5Z" fill={p.shd} />
        <path d="M25 54 Q18 66 20 74" stroke={p.sh} strokeWidth="8" strokeLinecap="round" fill="none" />
        <path d="M20 74 Q19.5 80 21 84" stroke={SK} strokeWidth="5.4" strokeLinecap="round" fill="none" /><circle cx="21.4" cy="86" r="3.6" fill={SK} />
        <path d="M15.8 70 q3.5 -2 7.5 -.5" stroke={p.shd} strokeWidth="1" opacity=".5" fill="none" />
        <path d="M55 54 Q62 58 61 70" stroke={p.sh} strokeWidth="8" strokeLinecap="round" fill="none" />
        <Fork hand={SK}><path d="M61 68 L63 76" stroke={SK} strokeWidth="5.4" strokeLinecap="round" /></Fork>
        <g className="pr-head">
          {female && <path d="M29 30 Q25 44 29 54 L34 46Z M51 30 Q55 44 51 54 L46 46Z" fill={p.hair} />}
          <ellipse cx="29.5" cy="35" rx="2.4" ry="3.2" fill={SKD} /><ellipse cx="50.5" cy="35" rx="2.4" ry="3.2" fill={SKD} />
          <ellipse cx="40" cy="34" rx="11" ry="12.5" fill={SK} /><ellipse cx="40" cy="40" rx="8" ry="6" fill="#fff" opacity=".08" />
          <path d="M29.5 31 Q29 25 40 23.5 Q51 25 50.5 31 Q47 28 40 28 Q33 28 29.5 31Z" fill={p.hair} />
          <path d="M29.8 31 q-.6 5 .6 8 M50.2 31 q.6 5 -.6 8" stroke={p.hair} strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M32.2 30.2 q3 -2 6 -.4 M41.8 29.8 q3 -1.6 6 .4" stroke={p.hair} strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <g className="pa-blink"><ellipse cx="35.4" cy="34.5" rx="1.7" ry="2.2" fill="#2a1c12" /><ellipse cx="44.6" cy="34.5" rx="1.7" ry="2.2" fill="#2a1c12" /><circle cx="36" cy="33.6" r=".6" fill="#fff" /><circle cx="45.2" cy="33.6" r=".6" fill="#fff" /></g>
          {female && <path d="M33.4 32.8 l-1.5 -1 M46.6 32.8 l1.5 -1" stroke="#2a1c12" strokeWidth="1" strokeLinecap="round" />}
          <path d="M40 35.5 q-1.6 4 .6 5" stroke="#c98a5e" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          {!female && <path d="M35 39 q5 -2.4 10 0 q-5 1.4 -10 0z" fill={p.hair} />}
          <path d="M36.2 42.2 q3.8 2.8 7.6 0" stroke={female ? '#c2506a' : '#9a4a3a'} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx="32.6" cy="39.6" r="2.4" fill="#ff9a8a" opacity={female ? 0.45 : 0.25} /><circle cx="47.4" cy="39.6" r="2.4" fill="#ff9a8a" opacity={female ? 0.45 : 0.25} />
          <ellipse cx="40" cy="25" rx="23" ry="5.8" fill={p.hatd} /><ellipse cx="40" cy="23.6" rx="23" ry="5" fill={p.hat} />
          <path d="M28.5 24 Q28 7.5 40 7.5 Q52 7.5 51.5 24 Q40 28 28.5 24Z" fill={p.hat} />
          <path d="M33 11 V19 M37 9 V20 M41 8.5 V21 M45 9 V20 M49 11 V19" stroke={p.hatd} strokeWidth=".6" opacity=".35" />
          <path d="M28.6 20 Q40 24.4 51.4 20 L51.6 24 Q40 28 28.4 24Z" fill={p.band} />
          <path d="M20.5 24.5 q19.5 5 39 0 M24 21.8 q16 3.8 32 0" stroke={p.hatd} strokeWidth=".8" opacity=".6" fill="none" />
          <path d="M32 12 Q35 9 40 8.8" stroke="#fff7d2" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".7" />
        </g>
      </g>
      {female && <path className="pr-braid" d="M51 42 Q58 50 56 62 Q54 70 57 77" stroke={p.hair} strokeWidth="5" strokeLinecap="round" fill="none" />}
      {female && <circle cx="57" cy="78" r="2.2" fill={p.band} />}
    </>
  )
}

function Wizard() {
  return (
    <>
      <ellipse cx="40" cy="127" rx="26" ry="3.6" fill="#000" opacity=".25" />
      <path d="M24 50 Q40 43 56 50 L66 124 Q40 131 14 124Z" fill="#5b3fb0" />
      <path d="M30 70 L22 124 M40 66 V128 M50 70 L58 124" stroke="#43308a" strokeWidth="1.6" opacity=".7" />
      <path d="M14 124 Q40 131 66 124 L65 119 Q40 126 15 119Z" fill="#ffd54a" />
      <rect x="25" y="76" width="30" height="4" rx="1.5" fill="#3a2a1a" /><rect x="36.5" y="75" width="7" height="6" rx="1.2" fill="#ffd54a" />
      <g className="pr-breathe">
        <path d="M24 50 Q40 43 56 50 L55 60 Q40 56 25 60Z" fill="#43308a" />
        <path d="M24 52 Q13 66 17 83 L27 83 Q26 68 31 58Z" fill="#5b3fb0" /><circle cx="22" cy="86" r="3.6" fill={SK} />
        <path d="M55 54 Q64 58 62 70 L58 72 Q58 62 52 58Z" fill="#5b3fb0" />
        <g className="pr-fork">
          <rect x="61.4" y="20" width="3.2" height="107" rx="1.5" fill="#7a4d2b" /><path d="M58 16 q5 -9 10 0" stroke="#7a4d2b" strokeWidth="2" fill="none" />
          <circle cx="63" cy="12" r="11" fill="#7fd0ff" opacity=".28" className="fa-pulse" /><circle cx="63" cy="13" r="5.5" fill="#9be1ff" /><circle cx="61.4" cy="11.2" r="1.8" fill="#fff" opacity=".85" />
          <circle cx="63" cy="77" r="3.8" fill={SK} />
        </g>
        <g className="pr-head">
          <ellipse cx="40" cy="34" rx="10" ry="11.5" fill={SK} />
          <path d="M29.5 36 Q30 62 40 68 Q50 62 50.5 36 Q46 46 40 45 Q34 46 29.5 36Z" fill="#f1f1f4" /><path d="M35 40 q5 -3 10 0 q-5 3 -10 0z" fill="#fff" />
          <circle cx="40" cy="37.5" r="2.4" fill="#e9a27c" />
          <path d="M32 30.4 q3.5 -2.4 6.5 -.4 M41.5 30 q3 -2 6.5 .4" stroke="#f1f1f4" strokeWidth="2" strokeLinecap="round" fill="none" />
          <g className="pa-blink"><ellipse cx="35.6" cy="34" rx="1.5" ry="2" fill="#2a1c12" /><ellipse cx="44.4" cy="34" rx="1.5" ry="2" fill="#2a1c12" /></g>
          <path d="M20 31 Q40 22 60 31 Q40 36 20 31Z" fill="#43308a" />
          <path d="M27 30 L40 4 Q43 -1 48 4 L53 30 Q40 34 27 30Z" fill="#5b3fb0" /><path d="M27.6 27.5 Q40 32 52.4 27.5 L53 30 Q40 34 27 30Z" fill="#ffd54a" />
          <Sparkle x={38} y={16} d={0} c="#ffe27a" /><Sparkle x={46} y={22} d={0.9} c="#ffe27a" />
        </g>
      </g>
    </>
  )
}

function Robot() {
  return (
    <>
      <ellipse cx="40" cy="127" rx="24" ry="3.6" fill="#000" opacity=".25" />
      <rect x="24" y="114" width="16" height="11" rx="4" fill="#5f6b7d" /><rect x="40" y="114" width="16" height="11" rx="4" fill="#5f6b7d" />
      <rect x="29" y="92" width="8" height="24" rx="3" fill="#8793a6" /><rect x="43" y="92" width="8" height="24" rx="3" fill="#8793a6" />
      <g className="pr-breathe">
        <rect x="22" y="50" width="36" height="46" rx="8" fill="#9fb0c6" /><rect x="22" y="50" width="12" height="46" rx="6" fill="#fff" opacity=".12" />
        <rect x="29" y="60" width="22" height="22" rx="4" fill="#2a3447" />
        <circle cx="35" cy="67" r="2.4" fill="#6df0a0" className="fa-pulse" /><circle cx="40" cy="67" r="2.4" fill="#ffd25a" className="fa-pulse" style={{ animationDelay: '.5s' }} /><circle cx="45" cy="67" r="2.4" fill="#ff6a6a" className="fa-pulse" style={{ animationDelay: '1s' }} />
        <path d="M32 75 h16 M32 78.5 h10" stroke="#5ee6ff" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
        <circle cx="26" cy="54" r="1.4" fill="#6c7a8f" /><circle cx="54" cy="54" r="1.4" fill="#6c7a8f" />
        <rect x="11" y="54" width="10" height="30" rx="4.5" fill="#8793a6" /><circle cx="16" cy="87" r="4.4" fill="#6c7a8f" />
        <path d="M55 56 Q63 60 62 72" stroke="#8793a6" strokeWidth="9" strokeLinecap="round" fill="none" />
        <Fork pole="#7a8699" hand="#6c7a8f" rr={4.4} />
        <g className="pr-head">
          <path d="M40 24 V12" stroke="#6c7a8f" strokeWidth="2" /><circle cx="40" cy="10" r="3.2" fill="#ff5a67" className="fa-pulse" />
          <rect x="26" y="22" width="28" height="24" rx="7" fill="#b8c6da" /><rect x="26" y="22" width="9" height="24" rx="5" fill="#fff" opacity=".18" />
          <rect x="30" y="28" width="20" height="11" rx="4.5" fill="#1b2438" />
          <g className="pa-blink"><ellipse cx="36" cy="33.5" rx="2.5" ry="3" fill="#5ee6ff" /><ellipse cx="44" cy="33.5" rx="2.5" ry="3" fill="#5ee6ff" /></g>
          <path d="M35 42 h10" stroke="#6c7a8f" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="23" y="30" width="3.4" height="9" rx="1.6" fill="#6c7a8f" /><rect x="53.6" y="30" width="3.4" height="9" rx="1.6" fill="#6c7a8f" />
          <path d="M28 22 Q40 14 52 22Z" fill="#f1d27a" /><ellipse cx="40" cy="22" rx="17" ry="3.2" fill="#e8c565" />
        </g>
      </g>
    </>
  )
}

export function PersonArt({ id }) {
  let body
  if (id === 'man_wizard') body = <Wizard />
  else if (id === 'man_robot') body = <Robot />
  else if (id === 'man_farmerw') body = <Farmer p={PAL_F} female />
  else body = <Farmer p={PAL_M} />
  return <svg className="fa-person" viewBox="0 0 80 130" aria-hidden="true">{body}</svg>
}

export function ItemArt({ it }) {
  if (it.cat === 'tree') return <TreeArt id={it.id} />
  if (it.cat === 'lamp') return <LampArt id={it.id} />
  if (it.cat === 'pet') return <PetArt id={it.id} />
  if (it.cat === 'person') return <PersonArt id={it.id} />
  return it.emoji
}
