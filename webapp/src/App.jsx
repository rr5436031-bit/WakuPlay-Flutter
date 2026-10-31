import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { supabase } from './lib/supabase'
import { AppCtx } from './context'
import BottomNav from './components/BottomNav'
import ErrorBoundary from './components/ErrorBoundary'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import Home from './pages/Home'
import { prewarmCosmic } from './components/CosmicBg'
import { applyFx, fxLow } from './lib/perf'
import { useSettings } from './lib/settings'
import NotifPrompt from './components/NotifPrompt'
import NotifToast from './components/NotifToast'
import { startNotifs } from './lib/notif'
import MiniPlayer from './components/MiniPlayer'
import { media } from './lib/media'
import BannerPopup from './components/BannerPopup'
import BanPopup from './components/BanPopup'
import UpdatePopup from './components/UpdatePopup'
import { fetchMyBan, checkDeviceBan, registerDevice } from './lib/ban'
import { signOut, autoSyncAvatar } from './lib/auth'
import { useXpTicker } from './lib/xp'
import { usePip, useImmersive } from './lib/pip'

const lazyPage = (loader) => { const L = lazy(loader); L.preload = loader; return L }
const Schedule = lazyPage(() => import('./pages/Schedule'))
const History = lazyPage(() => import('./pages/History'))
const Favorites = lazyPage(() => import('./pages/Favorites'))
const Account = lazyPage(() => import('./pages/Account'))
const Search = lazyPage(() => import('./pages/Search'))
const Detail = lazyPage(() => import('./pages/Detail'))
const Player = lazyPage(() => import('./pages/Player'))
const AvatarBorders = lazyPage(() => import('./pages/AvatarBorders'))
const GameInfo = lazyPage(() => import('./pages/GameInfo'))
const Settings = lazyPage(() => import('./pages/Settings'))
const Chat = lazyPage(() => import('./pages/Chat'))
const Feedback = lazyPage(() => import('./pages/Feedback'))
const DevPanel = lazyPage(() => import('./pages/DevPanel'))
const Leaderboard = lazyPage(() => import('./pages/Leaderboard'))
const TopGiver = lazyPage(() => import('./pages/TopGiver'))
const TopLevel = lazyPage(() => import('./pages/TopLevel'))
const UserProfile = lazyPage(() => import('./pages/UserProfile'))
const WakuGames = lazyPage(() => import('./pages/WakuGames'))
const Clans = lazyPage(() => import('./pages/Clans'))
const Premium = lazyPage(() => import('./pages/Premium'))
const Gacha = lazyPage(() => import('./pages/Gacha'))
const Pet = lazyPage(() => import('./pages/Pet'))
const Farm = lazyPage(() => import('./pages/Farm'))
const BannerPick = lazyPage(() => import('./pages/BannerPick'))
const ClanDetail = lazyPage(() => import('./pages/ClanDetail'))
const ClanGacha = lazyPage(() => import('./pages/ClanGacha'))
const ClanEmblemGacha = lazyPage(() => import('./pages/ClanEmblemGacha'))
const Notifications = lazyPage(() => import('./pages/Notifications'))
const Connections = lazyPage(() => import('./pages/Connections'))
const FindFriend = lazyPage(() => import('./pages/FindFriend'))
const DirectChat = lazyPage(() => import('./pages/DirectChat'))

const TAB_PAGES = { home: Home, schedule: Schedule, history: History, favorites: Favorites, account: Account }
const KEEP = new Set(['home', 'schedule'])
const TAB_ORDER = ['home', 'history', 'schedule', 'favorites', 'account']
const COSMIC = new Set(['avatarborder', 'wakugames', 'clans', 'clandetail', 'clangacha', 'clanemblem', 'pet', 'gacha', 'bannerpick', 'gameinfo'])
const SCREENS = { search: Search, detail: Detail, player: Player, settings: Settings, chat: Chat, feedback: Feedback, devpanel: DevPanel, leaderboard: Leaderboard, topgiver: TopGiver, toplevel: TopLevel, userprofile: UserProfile, wakugames: WakuGames, clans: Clans, clandetail: ClanDetail, clangacha: ClanGacha, clanemblem: ClanEmblemGacha, pet: Pet, notifications: Notifications, connections: Connections, findfriend: FindFriend, dm: DirectChat, premium: Premium, gacha: Gacha, bannerpick: BannerPick, farm: Farm, avatarborder: AvatarBorders, gameinfo: GameInfo }

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [fromLogin, setFromLogin] = useState(false)
  const [accepted, setAccepted] = useState(() => {
    try { return localStorage.getItem('wp_disclaimer') === '1' } catch { return false }
  })
  const [tab, setTab] = useState('home')
  const [visited, setVisited] = useState({ home: true })
  const [stack, setStack] = useState([])
  const [mini, setMini] = useState(null)
  const [ban, setBan] = useState(null)
  const [banChecked, setBanChecked] = useState(false)
  const [focusKey, setFocusKey] = useState(0)
  const [dir, setDir] = useState(null)
  const [leaving, setLeaving] = useState(null)
  const busyBack = useRef(false)
  const guard = useRef(null)
  const live = useRef({})
  const entered = useRef(new Set())
  live.current = { tab, stack }

  const nav = useMemo(() => ({
    push: (name, params = {}) => {
      if (name === 'player') setMini(null)
      setDir(null)
      const key = Math.random().toString(36).slice(2)
      setStack((s) => [...s, { name, params, key }])
    },
    back: () => {
      const st = live.current.stack
      if (!st.length || busyBack.current) return
      setDir(null)
      const key = st[st.length - 1].key
      if (fxLow()) { setStack((s) => s.filter((x) => x.key !== key)); setFocusKey((k) => k + 1); return }
      busyBack.current = true
      setLeaving(key)
      setTimeout(() => { setStack((s) => s.filter((x) => x.key !== key)); setLeaving(null); setFocusKey((k) => k + 1); busyBack.current = false }, 200)
    },
    tab: (t) => {
      const from = TAB_ORDER.indexOf(live.current.tab), to = TAB_ORDER.indexOf(t)
      setDir(from === to ? null : to > from ? 'right' : 'left')
      setLeaving(null); busyBack.current = false
      setStack([]); setTab(t); setVisited((v) => ({ ...v, [t]: true })); setFocusKey((k) => k + 1) },
    setGuard: (fn) => { guard.current = fn },
    minimize: (m) => setMini(m),
    closeMini: () => setMini(null),
  }), [])

  useXpTicker(session?.user?.id)
  usePip()
  useEffect(() => {
    const list = [Search, Detail, Schedule, History, Favorites, Account, Player, Chat, UserProfile, Notifications, Leaderboard, Settings, DirectChat]
    const timers = []
    const run = () => list.forEach((C, i) => timers.push(setTimeout(() => { try { C.preload() } catch { } }, i * 1200)))
    const id = 'requestIdleCallback' in window ? window.requestIdleCallback(run, { timeout: 12000 }) : setTimeout(run, 8000)
    return () => { timers.forEach(clearTimeout); if ('cancelIdleCallback' in window) window.cancelIdleCallback(id); else clearTimeout(id) }
  }, [])
  useImmersive()

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) { setBan(null); setBanChecked(false); return }
    let alive = true
    let registered = false
    const check = async () => {
      if (!registered) { registered = true; registerDevice() }
      const b = (await fetchMyBan()) || (await checkDeviceBan())
      if (!alive) return
      setBan(b); setBanChecked(true)
      if (b) media.release()
    }
    check()
    const t = setInterval(check, 60000)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [uid])

  const overlayOpen = stack.length > 0
  useEffect(() => { document.documentElement.classList.toggle('has-overlay', overlayOpen); return () => document.documentElement.classList.remove('has-overlay') }, [overlayOpen])

  const fxMode = useSettings().fxMode
  useEffect(() => { applyFx(fxMode) }, [fxMode])

  useEffect(() => { if (uid) prewarmCosmic() }, [uid])

  useEffect(() => {
    if (!uid) return
    return startNotifs(uid, nav)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    autoSyncAvatar()
    const onVis = () => { if (document.visibilityState === 'visible') autoSyncAvatar() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [uid])

  useEffect(() => {
    let handle
    CapApp.addListener('backButton', () => {
      if (guard.current && guard.current()) return
      const { tab: t, stack: st } = live.current
      if (st.length) nav.back()
      else if (t !== 'home') nav.tab('home')
      else CapApp.exitApp()
    }).then((h) => { handle = h }).catch(() => {})
    return () => { handle && handle.remove() }
  }, [nav])

  useEffect(() => {
    if (!session) { setStack([]); setTab('home'); setVisited({ home: true }); setMini(null); media.release() }
  }, [session])

  if (!ready) return <div className="splash" />
  if (!session) {
    return accepted
      ? <Login onBack={() => { try { localStorage.removeItem('wp_disclaimer') } catch { } setAccepted(false); setFromLogin(true) }} />
      : <Welcome fromLogin={fromLogin} onDone={() => { try { localStorage.setItem('wp_disclaimer', '1') } catch { } setAccepted(true); setFromLogin(false) }} />
  }

  if (!banChecked) return <div className="splash" />
  if (ban) return <BanPopup ban={ban} onClose={async () => { await signOut(); setBan(null) }} />

  const hasOverlay = stack.length > 0
  const trans = !!leaving
  const topIdx = stack.length - 1
  return (
    <AppCtx.Provider value={{ user: session.user, nav, focusKey }}>
      <div className="app">
        <div className="pages" style={{ display: 'flex', contentVisibility: hasOverlay && !(trans && stack.length === 1) ? 'hidden' : 'visible' }}>
          {Object.entries(TAB_PAGES).map(([id, Page]) => {
            const mounted = id === tab || (KEEP.has(id) && visited[id])
            if (!mounted) return null
            return (
              <div key={id} className={`tabpage ${id === tab && dir ? 'slide-' + dir : ''}`} style={{ display: id === tab ? 'flex' : 'none' }}>
                <ErrorBoundary><Suspense fallback={null}><Page focusKey={focusKey} /></Suspense></ErrorBoundary>
              </div>
            )
          })}
        </div>

        {stack.map((s, i) => {
          const Screen = SCREENS[s.name]
          const isUnder = trans && i === topIdx - 1
          if (i < topIdx - 3) return null
          return (
            <div key={s.key} className={`overlay-page${COSMIC.has(s.name) ? ' cs-screen' : ''}${s.key === leaving ? ' leaving' : ''}${isUnder ? ' under' : ''}${entered.current.has(s.key) ? ' entered' : ''}`} style={{ display: i === topIdx || isUnder ? 'flex' : 'none' }} onAnimationEnd={(e) => { if (e.target === e.currentTarget && !e.currentTarget.classList.contains('leaving')) entered.current.add(s.key) }}>
              <ErrorBoundary onBack={nav.back}><Suspense fallback={null}><Screen {...s.params} /></Suspense></ErrorBoundary>
            </div>
          )
        })}

        {mini && (
          <MiniPlayer
            key={mini.episodeId}
            mini={mini}
            onClose={() => setMini(null)}
            onExpand={(m) => nav.push('player', { animeId: m.animeId, episodeId: m.episodeId, episodeNumber: m.episodeNumber, anime: m.anime, startAt: m.time })}
          />
        )}

        <BannerPopup userId={session.user.id} />
        <UpdatePopup userId={session.user.id} />
        <NotifPrompt />
        <NotifToast />
        {(!hasOverlay || (trans && stack.length === 1)) && <BottomNav tab={tab} onTab={nav.tab} user={session.user} />}
      </div>
    </AppCtx.Provider>
  )
}
