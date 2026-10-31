const I = {
  home: [false, <path key="a" d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />],
  calendar: [false, <g key="a"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></g>],
  clock: [false, <g key="a"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></g>],
  library: [false, <g key="a"><rect x="3" y="9" width="18" height="12" rx="2.5" /><path d="M6 6h12M8.5 3h7" /><path d="m10.5 12.5 4 2.5-4 2.5z" /></g>],
  search: [false, <g key="a"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4.5 4.5" /></g>],
  eye: [false, <g key="a"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></g>],
  pin: [false, <g key="a"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /><path d="M12 14v7" /></g>],
  star: [true, <path key="a" d="m12 2.5 2.9 6.2 6.6.8-4.9 4.6 1.3 6.7L12 17.5l-5.9 3.3 1.3-6.7L2.5 9.5l6.6-.8z" />],
  gear: [false, <g key="a"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></g>],
  back: [false, <path key="a" d="m15 18-6-6 6-6" />],
  chevron: [false, <path key="a" d="m9 6 6 6-6 6" />],
  play: [true, <path key="a" d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />],
  pause: [true, <g key="a"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" /></g>],
  next: [true, <g key="a"><path d="M5 5.2v13.6a.8.8 0 0 0 1.2.7l9.6-6.8a.8.8 0 0 0 0-1.4L6.2 4.5A.8.8 0 0 0 5 5.2z" /><rect x="17" y="4.5" width="2.5" height="15" rx="1" /></g>],
  prev: [true, <g key="a"><path d="M19 5.2v13.6a.8.8 0 0 1-1.2.7L8.2 12.7a.8.8 0 0 1 0-1.4l9.6-6.8A.8.8 0 0 1 19 5.2z" /><rect x="4.5" y="4.5" width="2.5" height="15" rx="1" /></g>],
  fullscreen: [false, <path key="a" d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />],
  exitfs: [false, <path key="a" d="M3 8h3a2 2 0 0 0 2-2V3M16 3v3a2 2 0 0 0 2 2h3M21 16h-3a2 2 0 0 0-2 2v3M8 21v-3a2 2 0 0 0-2-2H3" />],
  heart: [false, <path key="a" d="M12 20.5s-8.5-5.3-8.5-11.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.3c0 5.9-8.5 11.2-8.5 11.2z" />],
  check: [false, <path key="a" d="m5 12.5 4.5 4.5L19 7.5" />],
  close: [false, <path key="a" d="M6 6l12 12M18 6 6 18" />],
  replay10: [false, <g key="a"><path d="M4 4v5h5" /><path d="M4.6 9A9 9 0 1 1 3.2 13.5" /><text x="12" y="15.6" fontSize="8.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">10</text></g>],
  forward10: [false, <g key="a"><path d="M20 4v5h-5" /><path d="M19.4 9A9 9 0 1 0 20.8 13.5" /><text x="12" y="15.6" fontSize="8.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">10</text></g>],
  fill: [false, <g key="a"><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M7 12V9h3M17 12v3h-3" /></g>],
  download: [false, <path key="a" d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />],
  info: [false, <g key="a"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></g>],
  sliders: [false, <g key="a"><path d="M4 7h9M19 7h1M4 17h1M11 17h9" /><circle cx="16" cy="7" r="2.2" /><circle cx="8" cy="17" r="2.2" /></g>],
  chevup: [false, <path key="a" d="m6 15 6-6 6 6" />],
  chevdown: [false, <path key="a" d="m6 9 6 6 6-6" />],
  send: [false, <path key="a" d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />],
  more: [true, <g key="a"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></g>],
  flag: [false, <path key="a" d="M5 21V4m0 0h11l-2 4 2 4H5" />],
  chat: [false, <path key="a" d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z" />],
  image: [false, <g key="a"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.600" /><path d="M21 16l-5-5-8 9" /></g>],
  repeat: [false, <g key="a"><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></g>],
  lock: [false, <g key="a"><rect x="5" y="11" width="14" height="10" rx="2.500" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></g>],
  shield: [false, <path key="a" d="M12 3l8 3v6c0 5-3.400 8-8 9-4.600-1-8-4-8-9V6z" />],
  basket: [false, <g key="a"><path d="M3 10h18l-2 10H5z" /><path d="M8 10l3-6M16 10l-3-6" /><path d="M10 14v3M14 14v3" /></g>],
  store: [false, <g key="a"><path d="M4 9l1.500-5h13L20 9" /><path d="M4 9a2.500 2.500 0 0 0 5 0 2.500 2.500 0 0 0 6 0 2.500 2.500 0 0 0 5 0" /><path d="M5 12v8h14v-8" /><path d="M10 20v-5h4v5" /></g>],
  "chevron-up": [false, <path key="a" d="M6 15l6-6 6 6M6 20l6-6 6 6" />],
  gift: [false, <g key="a"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" /><path d="M12 8c-1-3-2.2-4.5-4-4.5a2 2 0 0 0 0 4zM12 8c1-3 2.2-4.5 4-4.5a2 2 0 0 1 0 4z" /></g>],
  crown: [true, <path key="a" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />],
  bolt: [true, <path key="a" d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />],
  people: [true, <g key="a"><circle cx="9" cy="8" r="3.4" /><path d="M2.5 19.5c0-3.3 2.9-5.6 6.5-5.6s6.5 2.3 6.5 5.6z" /><circle cx="17" cy="9" r="2.7" /><path d="M16.6 14.2c3.2.1 5.4 2 5.4 5.3h-4.3c0-2-.4-3.7-1.1-5.3z" /></g>],
  adduser: [false, <g key="a"><circle cx="9.5" cy="8" r="3.6" /><path d="M2.5 20c0-3.6 3.1-6 7-6s7 2.4 7 6M19 7v6M16 10h6" /></g>],
  trend: [false, <path key="a" d="m3 17 6-6 4 4 8-8" />],
  bell: [false, <path key="a" d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9zM10 20a2 2 0 0 0 4 0" />],
  copy: [false, <g key="a"><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" /></g>],
  reply: [false, <path key="a" d="M9 7 4 12l5 5M4 12h9a7 7 0 0 1 7 7v1" />],
  ban: [false, <g key="a"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></g>],
  trash: [false, <g key="a"><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" /></g>],
}

export default function Icon({ name, size = 24, solid, className, strokeWidth = 2 }) {
  const [isSolid, el] = I[name] || [false, null]
  const fill = solid || isSolid ? 'currentColor' : 'none'
  const stroke = isSolid && solid !== false ? 'none' : 'currentColor'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {el}
    </svg>
  )
}
