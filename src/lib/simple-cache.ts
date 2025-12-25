// Simple in-memory cache with stale-while-revalidate
// Returns stale data immediately while refreshing in background
// Uses global to persist across Next.js module reloads
// Includes request queuing to prevent concurrent fetches (memory optimization)

interface CacheEntry<T> {
  data: T
  timestamp: number
  hours: number
}

interface GlobalCache {
  entries: Map<string, CacheEntry<unknown>>
  refreshing: Set<string> // Track which entries are being refreshed
  pendingFetches: Map<string, Promise<unknown>> // Queue concurrent requests
}

// Use global to persist cache in development
const globalForCache = globalThis as unknown as { dashboardCache?: GlobalCache }

if (!globalForCache.dashboardCache) {
  globalForCache.dashboardCache = {
    entries: new Map(),
    refreshing: new Set(),
    pendingFetches: new Map(),
  }
}

const cache = globalForCache.dashboardCache
const TTL = 5 * 60 * 1000 // 5 minutes - after this, data is "stale" but still usable
const MAX_STALE = 60 * 60 * 1000 // 1 hour - after this, data is too old to use

export const simpleCache = {
  // Get fresh data only (not expired)
  get<T>(key: string, hours: number): T | null {
    const entry = cache.entries.get(`${key}_${hours}`) as CacheEntry<T> | undefined
    if (!entry) return null

    const age = Date.now() - entry.timestamp
    if (age > TTL) {
      return null // Expired, need fresh data
    }

    console.log(`[Cache] HIT for ${key} (hours=${hours})`)
    return entry.data
  },

  // Get data even if stale (for stale-while-revalidate)
  getStale<T>(key: string, hours: number): { data: T; isStale: boolean } | null {
    const entry = cache.entries.get(`${key}_${hours}`) as CacheEntry<T> | undefined
    if (!entry) return null

    const age = Date.now() - entry.timestamp

    // Too old to use at all
    if (age > MAX_STALE) {
      cache.entries.delete(`${key}_${hours}`)
      return null
    }

    const isStale = age > TTL
    if (isStale) {
      console.log(`[Cache] STALE HIT for ${key} (hours=${hours}) - age: ${Math.round(age / 1000)}s`)
    } else {
      console.log(`[Cache] HIT for ${key} (hours=${hours})`)
    }

    return { data: entry.data, isStale }
  },

  // Check if a refresh is already in progress
  isRefreshing(key: string, hours: number): boolean {
    return cache.refreshing.has(`${key}_${hours}`)
  },

  // Mark as refreshing
  setRefreshing(key: string, hours: number, value: boolean): void {
    const cacheKey = `${key}_${hours}`
    if (value) {
      cache.refreshing.add(cacheKey)
    } else {
      cache.refreshing.delete(cacheKey)
    }
  },

  set<T>(key: string, data: T, hours: number): void {
    cache.entries.set(`${key}_${hours}`, {
      data,
      timestamp: Date.now(),
      hours,
    })
    // Clear refreshing flag
    cache.refreshing.delete(`${key}_${hours}`)

    // Log cache size
    const jsonStr = JSON.stringify(data)
    const sizeBytes = Buffer.byteLength(jsonStr, 'utf8')
    const sizeKB = (sizeBytes / 1024).toFixed(2)
    console.log(`[Cache] SET ${key} (hours=${hours}) - Size: ${sizeKB} KB`)
  },

  clear(): void {
    cache.entries.clear()
    cache.refreshing.clear()
  },

  delete(key: string, hours: number): void {
    cache.entries.delete(`${key}_${hours}`)
    cache.refreshing.delete(`${key}_${hours}`)
    console.log(`[Cache] DELETED ${key} (hours=${hours})`)
  },

  // Check if there's a pending fetch for this key
  getPendingFetch<T>(key: string, hours: number): Promise<T> | null {
    const cacheKey = `${key}_${hours}`
    return (cache.pendingFetches.get(cacheKey) as Promise<T>) || null
  },

  // Set a pending fetch promise (other requests will wait on this)
  setPendingFetch<T>(key: string, hours: number, promise: Promise<T>): void {
    const cacheKey = `${key}_${hours}`
    cache.pendingFetches.set(cacheKey, promise)
    console.log(`[Cache] QUEUED fetch for ${key} (hours=${hours})`)
  },

  // Clear pending fetch when done
  clearPendingFetch(key: string, hours: number): void {
    const cacheKey = `${key}_${hours}`
    cache.pendingFetches.delete(cacheKey)
  },

  // Execute a fetch with queuing - ensures only one fetch runs at a time
  async fetchWithQueue<T>(
    key: string,
    hours: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const cacheKey = `${key}_${hours}`

    // Check if there's already a pending fetch - wait for it instead of starting new one
    const pending = cache.pendingFetches.get(cacheKey) as Promise<T> | undefined
    if (pending) {
      console.log(`[Cache] WAITING for existing fetch: ${key} (hours=${hours})`)
      return pending
    }

    // Start new fetch and store the promise
    const fetchPromise = (async () => {
      try {
        const result = await fetchFn()
        return result
      } finally {
        cache.pendingFetches.delete(cacheKey)
      }
    })()

    cache.pendingFetches.set(cacheKey, fetchPromise)
    console.log(`[Cache] STARTED fetch for ${key} (hours=${hours})`)

    return fetchPromise
  },
}
