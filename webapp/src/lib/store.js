const NAME = 'wakuplay-cache'
let dbp = null

function db() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null)
        const r = indexedDB.open(NAME, 1)
        r.onupgradeneeded = () => {
          const d = r.result
          if (!d.objectStoreNames.contains('api')) d.createObjectStore('api')
          if (!d.objectStoreNames.contains('img')) d.createObjectStore('img')
        }
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => resolve(null)
        r.onblocked = () => resolve(null)
      } catch { resolve(null) }
    })
  }
  return dbp
}

const wrap = (req) => new Promise((resolve) => { req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(undefined) })

export async function idbGet(store, key) {
  try { const d = await db(); return d ? await wrap(d.transaction(store).objectStore(store).get(key)) : undefined } catch { return undefined }
}
export async function idbSet(store, key, val) {
  try { const d = await db(); if (d) d.transaction(store, 'readwrite').objectStore(store).put(val, key) } catch { }
}
export async function idbKeys(store) {
  try { const d = await db(); return d ? (await wrap(d.transaction(store).objectStore(store).getAllKeys())) || [] : [] } catch { return [] }
}

export async function idbPrune(store, max) {
  try {
    const d = await db()
    if (!d) return
    const rows = await new Promise((resolve) => {
      const out = []
      const r = d.transaction(store).objectStore(store).openCursor()
      r.onsuccess = () => { const c = r.result; if (c) { out.push([c.key, (c.value && c.value.t) || 0]); c.continue() } else resolve(out) }
      r.onerror = () => resolve(out)
    })
    if (rows.length <= max) return
    rows.sort((a, b) => a[1] - b[1])
    const os = d.transaction(store, 'readwrite').objectStore(store)
    rows.slice(0, rows.length - max).forEach(([k]) => os.delete(k))
  } catch { }
}

export async function idbAll(store) {
  try {
    const d = await db()
    if (!d) return []
    return await new Promise((resolve) => {
      const out = []
      const r = d.transaction(store).objectStore(store).openCursor()
      r.onsuccess = () => { const c = r.result; if (c) { out.push([c.key, c.value]); c.continue() } else resolve(out) }
      r.onerror = () => resolve(out)
    })
  } catch { return [] }
}
