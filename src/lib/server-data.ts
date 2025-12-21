// Server-side data fetching for Server Components
// No caching of raw data - fetches and aggregates in one call

import { fetchAllDashboardData, type AllDashboardData } from './db-aggregation'
import { fetchMetagraph } from './metagraph'
import type { MetagraphData } from './types'

export interface InitialPageData {
  dashboardData: AllDashboardData & { hours: number; fetchedAt: number }
  metagraph: MetagraphData | null
}

// Fetch initial page data (all time, no time filter)
export async function getInitialPageData(): Promise<InitialPageData> {
  console.log('[Server] Fetching initial page data...')
  const startTime = Date.now()

  // Fetch metagraph first (needed for filtering active miners)
  const metagraph = await fetchMetagraph()

  // Fetch all dashboard data in one call
  const dashboardData = await fetchAllDashboardData(0, metagraph)

  const fetchTime = Date.now() - startTime
  console.log(`[Server] Initial data fetched in ${fetchTime}ms`)

  return {
    dashboardData: {
      ...dashboardData,
      hours: 0,
      fetchedAt: Date.now(),
    },
    metagraph,
  }
}
