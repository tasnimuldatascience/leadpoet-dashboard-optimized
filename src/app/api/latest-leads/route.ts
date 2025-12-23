import { NextResponse } from 'next/server'
import { fetchLatestLeads } from '@/lib/db-aggregation'
import { fetchMetagraph } from '@/lib/metagraph'

export async function GET() {
  try {
    console.log('[Latest Leads API] Fetching data...')

    // Fetch metagraph first (needed for UID mapping and filtering)
    const metagraph = await fetchMetagraph()

    // Fetch latest 100 leads (cached)
    const leads = await fetchLatestLeads(metagraph)

    const response = NextResponse.json({
      leads,
      count: leads.length,
      fetchedAt: Date.now(),
    })

    // Short HTTP cache
    response.headers.set(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=30'
    )

    return response
  } catch (error) {
    console.error('[Latest Leads API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch latest leads' },
      { status: 500 }
    )
  }
}
