export function ClanEmblem() {
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="wgsh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe9a0" /><stop offset=".55" stopColor="#f5b50a" /><stop offset="1" stopColor="#b8730a" /></linearGradient>
        <linearGradient id="wgin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b3a8f" /><stop offset="1" stopColor="#141a45" /></linearGradient>
      </defs>
      <path d="M24 5 40 10v13c0 10-6.500 16.500-16 20C14.500 39.500 8 33 8 23V10z" fill="url(#wgin)" stroke="url(#wgsh)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M24 12 34 15.500v7c0 6.500-4 11-10 13.500-6-2.500-10-7-10-13.500v-7z" fill="none" stroke="url(#wgsh)" strokeWidth="1" opacity=".6" />
      <path d="M16 24 24 16l8 8-8 8z" fill="url(#wgsh)" />
      <path d="M17.500 8.500 19 4l5 3 5-3 1.500 4.500" fill="none" stroke="url(#wgsh)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function WallIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
      <defs><linearGradient id="wgwl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7cc4ff" /><stop offset="1" stopColor="#3a63ff" /></linearGradient></defs>
      <rect x="6" y="9" width="36" height="28" rx="5" fill="#141a45" stroke="url(#wgwl)" strokeWidth="2.600" />
      <circle cx="17" cy="19" r="3.200" fill="url(#wgwl)" />
      <path d="M8 34l10-9 7 6 6-5 9 8" fill="none" stroke="url(#wgwl)" strokeWidth="2.400" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M38 4l1.600 3.400L43 9l-3.400 1.600L38 14l-1.600-3.400L33 9l3.400-1.600z" fill="#ffe9a0" />
    </svg>
  )
}

export function CarrotIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 12c-3-5-1-8 1-9 1 3 3 4 4 8-2-1-3-1-5 1z" fill="#5fe08a" />
      <path d="M21 12c-5-3-8-1-9 1 3 1 4 3 8 4-1-2-1-3 1-5z" fill="#3fc46c" />
      <path d="M16 18c3-5 13-5 16 0 3 5-1 13-8 27C17 31 13 23 16 18z" fill="#ff8a1f" stroke="#c75d00" strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 22l5 1M19 28l6 1M22 34l4 1" stroke="#c75d00" strokeWidth="1.800" strokeLinecap="round" />
    </svg>
  )
}

export function BorderIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
      <defs><linearGradient id="wgab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe9a0" /><stop offset=".55" stopColor="#f5b50a" /><stop offset="1" stopColor="#b8730a" /></linearGradient></defs>
      <circle cx="24" cy="26" r="15" fill="#141a45" stroke="url(#wgab)" strokeWidth="2.6" />
      <circle cx="24" cy="22" r="5" fill="#d9b6ff" /><path d="M14.500 36c1-6 5-8 9.500-8s8.500 2 9.500 8" fill="#d9b6ff" />
      <path d="M12 14 8 5l8 5M36 14l4-9-8 5" fill="none" stroke="url(#wgab)" strokeWidth="2.200" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M40 30l1.400 3L44.500 34.500 41.400 36 40 39l-1.400-3L35.500 34.500 38.600 33z" fill="#ffe9a0" />
    </svg>
  )
}

export function InfoIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
      <defs><linearGradient id="wgif" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4a2a00" /><stop offset="1" stopColor="#1f1100" /></linearGradient></defs>
      <circle cx="24" cy="24" r="18" fill="url(#wgif)" stroke="#fff3c4" strokeWidth="2.600" />
      <circle cx="24" cy="15.500" r="2.800" fill="#ffe08a" />
      <path d="M24 22v13" stroke="#ffe08a" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

export function BadgeIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
      <defs><linearGradient id="wgbd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe9a0" /><stop offset=".55" stopColor="#f5b50a" /><stop offset="1" stopColor="#b8730a" /></linearGradient></defs>
      <path d="M15 28 11 43l8-4 5 5 3-9z" fill="#7c8cff" />
      <path d="M33 28l4 15-8-4-5 5-3-9z" fill="#5a67d8" />
      <circle cx="24" cy="19" r="13" fill="#141a45" stroke="url(#wgbd)" strokeWidth="2.600" />
      <path d="M24 10.500l2.600 5.400 5.900.8-4.300 4.100 1.100 5.800L24 23.800l-5.300 2.800 1.100-5.800-4.300-4.100 5.900-.8z" fill="url(#wgbd)" />
    </svg>
  )
}

export function PetIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="wgpe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff2a8" /><stop offset=".55" stopColor="#ffb81f" /><stop offset="1" stopColor="#c97a00" /></linearGradient>
        <linearGradient id="wgpp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8ff0d0" /><stop offset="1" stopColor="#2fb98f" /></linearGradient>
      </defs>
      <path d="M24 5c8 0 14 10 14 19 0 8-6 14-14 14S10 32 10 24C10 15 16 5 24 5z" fill="url(#wgpe)" stroke="#8a5200" strokeWidth="1.8" />
      <ellipse cx="18" cy="15" rx="3.600" ry="5.200" fill="#fff" opacity=".45" transform="rotate(-18 18 15)" />
      <ellipse cx="24" cy="29.500" rx="4.800" ry="3.800" fill="url(#wgpp)" />
      <circle cx="18" cy="24.500" r="1.900" fill="url(#wgpp)" /><circle cx="24" cy="22.800" r="1.900" fill="url(#wgpp)" /><circle cx="30" cy="24.500" r="1.900" fill="url(#wgpp)" />
    </svg>
  )
}
