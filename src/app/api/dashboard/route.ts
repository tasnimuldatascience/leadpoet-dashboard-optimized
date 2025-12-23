import { NextRequest, NextResponse } from 'next/server'
import { fetchAllDashboardData } from '@/lib/db-aggregation'
import { fetchMetagraph } from '@/lib/metagraph'

// Valid preset hours (no custom option)
const VALID_HOURS = [0, 1, 6, 12, 24, 48, 72, 168] // 0 = all, 168 = 7 days

export async function GET(request: NextRequest) {
  try {
    // Parse hours from query param (default: 0 = all time)
    const searchParams = request.nextUrl.searchParams
    const hoursParam = searchParams.get('hours')
    let hours = hoursParam ? parseInt(hoursParam, 10) : 0

    // Validate hours is a preset value
    if (!VALID_HOURS.includes(hours)) {
      hours = 0
    }

    console.log(`[Dashboard API] Fetching data (hours=${hours})...`)

    // Fetch metagraph first (needed for filtering)
    const metagraph = await fetchMetagraph()

    // Fetch all dashboard data in one call
    const data = await fetchAllDashboardData(hours, metagraph)

    const response = NextResponse.json({
      ...data,
      hours,
      fetchedAt: Date.now(),
    })

    // Short HTTP cache
    response.headers.set(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=30'
    )

    return response
  } catch (error) {
    console.error('[Dashboard API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
