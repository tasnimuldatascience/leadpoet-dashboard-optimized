import { NextRequest, NextResponse } from 'next/server'
import { fetchLatestLeads } from '@/lib/db-aggregation'
import { fetchMetagraph } from '@/lib/metagraph'
import { cleanRejectionReason } from '@/lib/db-aggregation'

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now()
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)

    console.log(`[Lead Search Latest API] Fetching latest ${limit} leads...`)

    // Fetch metagraph for hotkey->uid mapping
    const metagraph = await fetchMetagraph()

    // Use the existing fetchLatestLeads function
    const latestLeads = await fetchLatestLeads(metagraph)

    // Transform to match SearchResult format and limit
    const results = latestLeads.slice(0, limit).map(lead => ({
      emailHash: lead.emailHash,
      minerHotkey: lead.minerHotkey,
      leadId: lead.leadId,
      uid: lead.uid,
      epochId: lead.epochId,
      decision: lead.decision,
      repScore: lead.repScore,
      rejectionReason: lead.rejectionReason ? cleanRejectionReason(lead.rejectionReason) : null,
      timestamp: lead.timestamp,
    }))

    const elapsed = Date.now() - startTime
    console.log(`[Lead Search Latest API] Returned ${results.length} leads in ${elapsed}ms`)

    return NextResponse.json({
      results,
      total: results.length,
      returned: results.length,
    })
  } catch (error) {
    console.error('[Lead Search Latest API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch latest leads' },
      { status: 500 }
    )
  }
}
