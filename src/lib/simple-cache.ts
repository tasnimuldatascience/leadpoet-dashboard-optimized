// Simple in-memory cache with stale-while-revalidate
// Returns stale data immediately while refreshing in background
// Uses global to persist across Next.js module reloads

interface CacheEntry<T> {
  data: T
  timestamp: number
  hours: number
}

interface GlobalCache {
  entries: Map<string, CacheEntry<unknown>>
  refreshing: Set<string> // Track which entries are being refreshed
}

// Use global to persist cache in development
const globalForCache = globalThis as unknown as { dashboardCache?: GlobalCache }

if (!globalForCache.dashboardCache) {
  globalForCache.dashboardCache = {
    entries: new Map(),
    refreshing: new Set(),
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
}
