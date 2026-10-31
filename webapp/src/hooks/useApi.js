import { useEffect, useState } from 'react'

export function useApi(fn, deps = [], enabled = true, peek = null) {
  const [state, setState] = useState(() => {
    const c = enabled && peek ? peek() : null
    return { data: c, error: null, loading: enabled && !c }
  })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) { setState({ data: null, error: null, loading: false }); return }
    let alive = true
    const ctrl = new AbortController()
    const cached = peek ? peek() : null
    if (cached) setState({ data: cached, error: null, loading: false })
    else setState((s) => ({ ...s, loading: true, error: null }))
    Promise.resolve(fn(ctrl.signal))
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (!alive || error?.name === 'AbortError') return
        if (cached) return
        setState({ data: null, error, loading: false })
      })
    return () => { alive = false; ctrl.abort() }
  }, [...deps, tick, enabled])
  return { ...state, retry: () => setTick((t) => t + 1) }
}

export function useDebounce(value, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
