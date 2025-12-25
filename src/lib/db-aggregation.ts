// Database aggregation queries - fetch once, aggregate all stats
// Filter by active miners (metagraph)
// Results cached for 5 minutes for smooth user experience

import { supabase } from './supabase'
import type { MetagraphData } from './types'
import { simpleCache } from './simple-cache'

// Normalize decision values
function normalizeDecision(decision: string | undefined): 'ACCEPTED' | 'REJECTED' | 'PENDING' {
  if (!decision) return 'PENDING'
  const lower = decision.toLowerCase()
  if (['deny', 'denied', 'reject', 'rejected'].includes(lower)) return 'REJECTED'
  if (['allow', 'allowed', 'accept', 'accepted', 'approve', 'approved'].includes(lower)) return 'ACCEPTED'
  return 'PENDING'
}

// Get ISO timestamp for hours ago (0 = no filter / all time)
function getTimeCutoff(hours: number): string | null {
  if (hours <= 0) return null
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

// Clean up rejection reason - exported for use in UI components
export function cleanRejectionReason(reason: string | null | undefined): string {
  if (!reason || reason === 'N/A') return 'N/A'

  try {
    if (reason.startsWith('{')) {
      const parsed = JSON.parse(reason)
      const failedFields: string[] = parsed.failed_fields || []
      if (failedFields.length > 0) {
        const fieldMap: Record<string, string> = {
          email: 'Invalid Email', website: 'Invalid Website', site: 'Invalid Website',
          source_url: 'Invalid Source URL', linkedin: 'Invalid LinkedIn', region: 'Invalid Region',
          role: 'Invalid Role', industry: 'Invalid Industry', phone: 'Invalid Phone',
          name: 'Invalid Name', first_name: 'Invalid Name', last_name: 'Invalid Name',
          company: 'Invalid Company', title: 'Invalid Title', address: 'Invalid Address',
          exception: 'Validation Error', llm_error: 'LLM Error', source_type: 'Invalid Source Type',
        }
        for (const field of failedFields) {
          const mapped = fieldMap[field.toLowerCase()]
          if (mapped) return mapped
        }
        return `Invalid ${failedFields[0].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`
      }

      const checkName = parsed.check_name || ''
      const message = parsed.message || ''
      const checkNameMap: Record<string, string> = {
        check_truelist_email: 'Invalid Email', check_myemailverifier_email: 'Invalid Email',
        check_email_regex: 'Invalid Email', check_mx_record: 'Invalid Email',
        check_linkedin_gse: 'Invalid LinkedIn', check_head_request: 'Invalid Website',
        check_source_provenance: 'Invalid Source URL', check_domain_age: 'Invalid Website',
        check_dnsbl: 'Invalid Website', check_name_email_match: 'Name/Email Mismatch',
        check_free_email_domain: 'Free Email Domain', validation_error: 'Validation Error',
        deep_verification: 'Deep Verification Failed',
      }
      if (checkName === 'check_stage5_unified') {
        const msgLower = message.toLowerCase()
        if (msgLower.includes('region') && msgLower.includes('failed')) return 'Invalid Region'
        if (msgLower.includes('role') && msgLower.includes('failed')) return 'Invalid Role'
        if (msgLower.includes('industry') && msgLower.includes('failed')) return 'Invalid Industry'
        return 'Role/Region/Industry Failed'
      }
      if (checkNameMap[checkName]) return checkNameMap[checkName]

      const stage = parsed.stage || ''
      if (stage.includes('Email') || stage.includes('TrueList')) return 'Invalid Email'
      if (stage.includes('LinkedIn') || stage.includes('GSE')) return 'Invalid LinkedIn'
      if (stage.includes('DNS') || stage.includes('Domain')) return 'Invalid Website'
      if (stage.includes('Source Provenance')) return 'Invalid Source URL'

      if (parsed.failed_field) {
        const fm: Record<string, string> = {
          site: 'Invalid Website', website: 'Invalid Website', email: 'Invalid Email',
          phone: 'Invalid Phone', name: 'Invalid Name', company: 'Invalid Company',
          title: 'Invalid Title', linkedin: 'Invalid LinkedIn', address: 'Invalid Address',
        }
        return fm[parsed.failed_field.toLowerCase()] || `Invalid ${parsed.failed_field}`
      }
      if (parsed.reason) return parsed.reason.substring(0, 50)
      if (parsed.error) return parsed.error.substring(0, 50)
    }
  } catch { /* Not JSON */ }

  const reasonLower = reason.toLowerCase()
  if (reasonLower.includes('duplicate')) return 'Duplicate Lead'
  if (reasonLower.includes('spam')) return 'Spam Detected'
  if (reasonLower.includes('disposable')) return 'Disposable Email'
  if (reasonLower.includes('catchall') || reasonLower.includes('catch-all')) return 'Catch-all Email'
  if (reasonLower.includes('bounced') || reasonLower.includes('bounce')) return 'Email Bounced'

  const clean = reason.replace(/[{}\[\]"':]/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > 40 ? clean.substring(0, 40) + '...' : clean
}

// Types
export interface MergedLead {
  timestamp: string
  minerHotkey: string
  emailHash: string
  leadId: string | null
  epochId: number | null
  decision: 'ACCEPTED' | 'REJECTED' | 'PENDING'
  repScore: number | null
  rejectionReason: string
}

export interface DashboardSummary {
  total_submissions: number
  total_accepted: number
  total_rejected: number
  total_pending: number
  acceptance_rate: number
  avg_rep_score: number
  unique_miners: number
  unique_epochs: number
  latest_epoch: number
}

export interface MinerEpochPerformance {
  epoch_id: number
  accepted: number
  rejected: number
  acceptance_rate: number
}

export interface MinerRejectionReason {
  reason: string
  count: number
  percentage: number
}

export interface MinerStats {
  miner_hotkey: string
  total_submissions: number
  accepted: number
  rejected: number
  pending: number
  acceptance_rate: number
  avg_rep_score: number
  // Epoch-specific stats for leaderboard
  last20_accepted: number
  last20_rejected: number
  current_accepted: number
  current_rejected: number
  // Per-miner detailed stats for MinerTracker
  epoch_performance: MinerEpochPerformance[]
  rejection_reasons: MinerRejectionReason[]
}

export interface EpochMinerStats {
  miner_hotkey: string
  total: number
  accepted: number
  rejected: number
  acceptance_rate: number
  avg_rep_score: number
}

export interface EpochStats {
  epoch_id: number
  total_leads: number
  accepted: number
  rejected: number
  acceptance_rate: number
  avg_rep_score: number
  miners: EpochMinerStats[] // Per-epoch miner breakdown
}

export interface DailyLeadInventory {
  date: string
  new_leads: number
  cumulative_leads: number
}

export interface RejectionReasonAggregated {
  reason: string
  count: number
  percentage: number
}

export interface IncentiveDataAggregated {
  miner_hotkey: string
  accepted_leads: number
  lead_share_pct: number
}

// Lead journey entry for submissions tab (last 72 hours only)
export interface LeadJourneyEntry {
  emailHash: string
  emailHashShort: string
  minerHotkey: string
  minerShort: string
  timestamp: string
  epochId: number | null
  decision: 'ACCEPTED' | 'REJECTED' | 'PENDING'
  repScore: number | null
  rejectionReason: string
  leadId: string | null
}

// Consensus data for direct epoch stats calculation
export interface ConsensusData {
  email_hash: string
  decision: string
  epoch_id?: number
  rep_score?: number
  rejection_reason?: string
}

// Raw consensus with timestamps for inventory calculations
export interface RawConsensusEntry {
  ts: string
  lead_id?: string
  decision: string
}

// Result type including original submission count
export interface MergedLeadsResult {
  leads: MergedLead[]
  totalSubmissions: number  // Count before email_hash deduplication
  consensusData: ConsensusData[]  // Raw consensus data for epoch stats
  rawConsensusWithTimestamps: RawConsensusEntry[]  // For inventory calculations (not filtered)
  totalAllSubmissions: number  // Total submissions count (not filtered by active miners)
}

// Fetch and merge submissions with consensus - SINGLE fetch, used by all aggregations
export async function fetchMergedLeads(hours: number, metagraph: MetagraphData | null): Promise<MergedLeadsResult> {
  console.log(`[DB] Fetching merged leads (hours=${hours})...`)
  const startTime = Date.now()
  const cutoff = getTimeCutoff(hours)

  // Get active miner hotkeys from metagraph (only if metagraph has data)
  // If metagraph is empty/failed, skip filtering to show all data
  const metagraphHotkeys = metagraph ? Object.keys(metagraph.hotkeyToUid) : []
  const activeMiners = metagraphHotkeys.length > 0 ? new Set(metagraphHotkeys) : null

  // Fetch submissions (primary source) - include payload for lead_id
  const allSubmissions: Array<{ ts: string; actor_hotkey: string; email_hash: string; payload: { lead_id?: string } | null }> = []
  let offset = 0
  const batchSize = 1000

  while (true) {
    let query = supabase
      .from('transparency_log')
      .select('ts,actor_hotkey,email_hash,payload')
      .eq('event_type', 'SUBMISSION')
      .not('actor_hotkey', 'is', null)
      .not('email_hash', 'is', null)

    if (cutoff) query = query.gte('ts', cutoff)

    const { data, error } = await query.range(offset, offset + batchSize - 1)
    if (error) { console.error('[DB] Error fetching submissions:', error); break }
    if (!data || data.length === 0) break
    allSubmissions.push(...data)
    if (data.length < batchSize) break
    offset += batchSize
  }

  console.log(`[DB] Fetched ${allSubmissions.length} submissions`)

  // Filter by active miners (only show data from miners currently in metagraph)
  const filteredSubmissions = activeMiners
    ? allSubmissions.filter(s => activeMiners.has(s.actor_hotkey))
    : allSubmissions

  console.log(`[DB] Filtered to ${filteredSubmissions.length} submissions from active miners`)

  // Fetch consensus results (include ts for inventory calculations)
  const consensusMap = new Map<string, { decision: string; epoch_id?: number; rep_score?: number; rejection_reason?: string }>()
  const allConsensusData: ConsensusData[] = []  // Store all consensus data for epoch stats
  const rawConsensusWithTimestamps: RawConsensusEntry[] = []  // For inventory calculations
  offset = 0

  while (true) {
    let query = supabase
      .from('transparency_log')
      .select('ts,email_hash,payload')
      .eq('event_type', 'CONSENSUS_RESULT')
      .not('email_hash', 'is', null)

    if (cutoff) query = query.gte('ts', cutoff)

    const { data, error } = await query.range(offset, offset + batchSize - 1)
    if (error) { console.error('[DB] Error fetching consensus:', error); break }
    if (!data || data.length === 0) break

    for (const row of data) {
      const p = row.payload as { lead_id?: string; final_decision?: string; epoch_id?: number; final_rep_score?: number; primary_rejection_reason?: string }

      // Store raw consensus with timestamps for inventory (not filtered)
      rawConsensusWithTimestamps.push({
        ts: row.ts,
        lead_id: p?.lead_id,
        decision: p?.final_decision || '',
      })

      // Store all consensus data for epoch stats (one entry per consensus result)
      allConsensusData.push({
        email_hash: row.email_hash,
        decision: p?.final_decision || '',
        epoch_id: p?.epoch_id,
        rep_score: p?.final_rep_score,
        rejection_reason: p?.primary_rejection_reason,
      })

      // Also build map for merging (deduplicated by email_hash)
      if (!consensusMap.has(row.email_hash)) {
        consensusMap.set(row.email_hash, {
          decision: p?.final_decision || '',
          epoch_id: p?.epoch_id,
          rep_score: p?.final_rep_score,
          rejection_reason: p?.primary_rejection_reason,
        })
      }
    }

    if (data.length < batchSize) break
    offset += batchSize
  }

  console.log(`[DB] Fetched ${allConsensusData.length} consensus results (${consensusMap.size} unique)`)

  // Merge: Use submissions as primary, join with consensus
  const seenEmailHashes = new Set<string>()
  const merged: MergedLead[] = []

  for (const sub of filteredSubmissions) {
    if (seenEmailHashes.has(sub.email_hash)) continue
    seenEmailHashes.add(sub.email_hash)

    const cons = consensusMap.get(sub.email_hash)
    merged.push({
      timestamp: sub.ts,
      minerHotkey: sub.actor_hotkey,
      emailHash: sub.email_hash,
      leadId: sub.payload?.lead_id ?? null,
      epochId: cons?.epoch_id ?? null,
      decision: cons ? normalizeDecision(cons.decision) : 'PENDING',
      repScore: cons?.rep_score ?? null,
      rejectionReason: cleanRejectionReason(cons?.rejection_reason),
    })
  }

  const fetchTime = Date.now() - startTime
  console.log(`[DB] Merged ${merged.length} leads from ${filteredSubmissions.length} submissions in ${fetchTime}ms`)

  return {
    leads: merged,
    totalSubmissions: filteredSubmissions.length,
    consensusData: allConsensusData,
    rawConsensusWithTimestamps,
    totalAllSubmissions: allSubmissions.length,  // Total before filtering
  }
}

// Main function: Fetch all dashboard data in ONE call
export interface AllDashboardData {
  summary: DashboardSummary
  minerStats: MinerStats[]
  epochStats: EpochStats[]
  leadInventory: DailyLeadInventory[]
  rejectionReasons: RejectionReasonAggregated[]
  incentiveData: IncentiveDataAggregated[]
  leadInventoryCount: LeadInventoryCount
  totalSubmissionCount: number  // All submissions (not filtered by active miners)
}

export async function fetchAllDashboardData(hours: number, metagraph: MetagraphData | null): Promise<AllDashboardData> {
  // Check cache first (stale-while-revalidate pattern)
  const staleResult = simpleCache.getStale<AllDashboardData>('dashboard', 0)

  if (staleResult) {
    if (!staleResult.isStale) {
      // Fresh cached data - return immediately
      console.log('[Cache] HIT for dashboard data')
      return staleResult.data
    }

    // Data is stale - return it immediately but refresh in background
    if (!simpleCache.isRefreshing('dashboard', 0)) {
      console.log('[Cache] Returning stale data, refreshing in background...')
      refreshDataInBackground(metagraph)
    }
    return staleResult.data
  }

  // No cached data - use queue to ensure only one fetch runs at a time
  // This prevents memory exhaustion from concurrent fetches
  return simpleCache.fetchWithQueue<AllDashboardData>('dashboard', 0, async () => {
    // Double-check cache inside queue (another request might have just finished)
    const freshCheck = simpleCache.get<AllDashboardData>('dashboard', 0)
    if (freshCheck) {
      console.log('[Cache] HIT after queue wait')
      return freshCheck
    }

    console.log(`[DB] Fetching all dashboard data (no cache)...`)
    const startTime = Date.now()

    // Single fetch of merged data (always all time, hours=0)
    const { leads, totalSubmissions, consensusData, rawConsensusWithTimestamps, totalAllSubmissions } = await fetchMergedLeads(0, metagraph)

    // Calculate all aggregations from the same data
    const summary = calculateSummary(leads, totalSubmissions)
    const minerStats = calculateMinerStats(leads)
    const epochStats = calculateEpochStats(consensusData, leads)
    const rejectionReasons = calculateRejectionReasons(leads)
    const incentiveData = calculateIncentiveData(leads)

    // Calculate lead inventory from already-fetched consensus data (not filtered by active miners)
    // Leads remain in inventory even after miner leaves
    const leadInventory = calculateLeadInventoryFromConsensusData(consensusData, rawConsensusWithTimestamps)

    // Calculate lead inventory count from already-fetched data
    const leadInventoryCount = calculateLeadInventoryCountFromData(rawConsensusWithTimestamps)

    // Use total submission count from already-fetched data
    const totalSubmissionCount = totalAllSubmissions

    const result = { summary, minerStats, epochStats, leadInventory, rejectionReasons, incentiveData, leadInventoryCount, totalSubmissionCount }

    // Cache the result
    simpleCache.set('dashboard', result, 0)

    // Also populate latest leads cache on server start
    fetchLatestLeads(metagraph).then(latestLeads => {
      simpleCache.set('latestLeads', latestLeads, 0)
      console.log(`[Cache] Latest leads cache initialized (${latestLeads.length} leads)`)
    }).catch(err => {
      console.error('[Cache] Failed to initialize latest leads cache:', err)
    })

    const totalTime = Date.now() - startTime
    console.log(`[DB] All dashboard data calculated in ${totalTime}ms`)

    return result
  })
}

// Refresh data in background without blocking the response
// Uses queue to prevent concurrent background refreshes from exhausting memory
async function refreshDataInBackground(metagraph: MetagraphData | null) {
  simpleCache.setRefreshing('dashboard', 0, true)

  try {
    // Use queue to ensure only one fetch runs at a time (even for background refreshes)
    await simpleCache.fetchWithQueue('dashboard_refresh', 0, async () => {
      console.log('[Cache] Background refresh started...')
      const startTime = Date.now()

      const { leads, totalSubmissions, consensusData, rawConsensusWithTimestamps, totalAllSubmissions } = await fetchMergedLeads(0, metagraph)
      const summary = calculateSummary(leads, totalSubmissions)
      const minerStats = calculateMinerStats(leads)
      const epochStats = calculateEpochStats(consensusData, leads)
      const rejectionReasons = calculateRejectionReasons(leads)
      const incentiveData = calculateIncentiveData(leads)
      const leadInventory = calculateLeadInventoryFromConsensusData(consensusData, rawConsensusWithTimestamps)
      const leadInventoryCount = calculateLeadInventoryCountFromData(rawConsensusWithTimestamps)
      const totalSubmissionCount = totalAllSubmissions

      const result = { summary, minerStats, epochStats, leadInventory, rejectionReasons, incentiveData, leadInventoryCount, totalSubmissionCount }
      simpleCache.set('dashboard', result, 0)

      // Also refresh latest leads cache
      const latestLeads = await fetchLatestLeads(metagraph)
      simpleCache.set('latestLeads', latestLeads, 0)
      console.log(`[Cache] Latest leads cache refreshed (${latestLeads.length} leads)`)

      const totalTime = Date.now() - startTime
      console.log(`[Cache] Background refresh completed in ${totalTime}ms`)

      return result
    })
  } catch (err) {
    console.error('[Cache] Background refresh failed:', err)
  } finally {
    simpleCache.setRefreshing('dashboard', 0, false)
  }
}

// Get cached latest leads (for "All" filters - no DB query needed)
export async function getCachedLatestLeads(metagraph: MetagraphData | null): Promise<LatestLead[]> {
  // Check cache first
  const cached = simpleCache.getStale<LatestLead[]>('latestLeads', 0)

  if (cached && !cached.isStale) {
    console.log('[Cache] HIT for latestLeads')
    return cached.data
  }

  if (cached) {
    console.log('[Cache] STALE HIT for latestLeads - returning cached data')
    // Background refresh will update this with the dashboard refresh
    return cached.data
  }

  // No cache - fetch fresh and cache it
  console.log('[Cache] MISS for latestLeads - fetching fresh')
  const leads = await fetchLatestLeads(metagraph)
  simpleCache.set('latestLeads', leads, 0)
  return leads
}

// Aggregation functions (work on already-fetched data)
function calculateSummary(leads: MergedLead[], totalSubmissions: number): DashboardSummary {
  const accepted = leads.filter(l => l.decision === 'ACCEPTED').length
  const rejected = leads.filter(l => l.decision === 'REJECTED').length
  const pending = leads.filter(l => l.decision === 'PENDING').length
  const total = totalSubmissions  // Use original submission count, not deduplicated leads
  const decided = accepted + rejected

  // Only calculate avg rep score for ACCEPTED leads
  const acceptedLeads = leads.filter(l => l.decision === 'ACCEPTED')
  const repScores = acceptedLeads.filter(l => l.repScore != null).map(l => l.repScore!)
  const avgRepScore = repScores.length > 0 ? repScores.reduce((a, b) => a + b, 0) / repScores.length : 0

  const miners = new Set(leads.map(l => l.minerHotkey))
  const epochs = new Set(leads.filter(l => l.epochId != null).map(l => l.epochId!))

  return {
    total_submissions: total,
    total_accepted: accepted,
    total_rejected: rejected,
    total_pending: pending,
    acceptance_rate: decided > 0 ? (accepted / decided) * 100 : 0,
    avg_rep_score: Math.round(avgRepScore * 10000) / 10000,
    unique_miners: miners.size,
    unique_epochs: epochs.size,
    latest_epoch: epochs.size > 0 ? Math.max(...epochs) : 0,
  }
}

function calculateMinerStats(leads: MergedLead[]): MinerStats[] {
  // First, determine epoch IDs for last20 and current epoch calculations
  const epochIds = new Set<number>()
  for (const lead of leads) {
    if (lead.epochId != null) epochIds.add(lead.epochId)
  }
  const sortedEpochs = Array.from(epochIds).sort((a, b) => b - a)
  const currentEpochId = sortedEpochs[0] ?? null
  const last20EpochIds = new Set(sortedEpochs.slice(0, 20))

  // Group leads by miner
  const minerMap = new Map<string, MergedLead[]>()
  for (const lead of leads) {
    if (!minerMap.has(lead.minerHotkey)) minerMap.set(lead.minerHotkey, [])
    minerMap.get(lead.minerHotkey)!.push(lead)
  }

  return Array.from(minerMap.entries()).map(([hotkey, minerLeads]) => {
    const accepted = minerLeads.filter(l => l.decision === 'ACCEPTED').length
    const rejected = minerLeads.filter(l => l.decision === 'REJECTED').length
    const pending = minerLeads.filter(l => l.decision === 'PENDING').length
    const decided = accepted + rejected

    // Only calculate avg rep score for ACCEPTED leads
    const acceptedMinerLeads = minerLeads.filter(l => l.decision === 'ACCEPTED')
    const repScores = acceptedMinerLeads.filter(l => l.repScore != null).map(l => l.repScore!)
    const avgRepScore = repScores.length > 0 ? repScores.reduce((a, b) => a + b, 0) / repScores.length : 0

    // Last 20 epochs stats
    const last20Leads = minerLeads.filter(l => l.epochId != null && last20EpochIds.has(l.epochId))
    const last20Accepted = last20Leads.filter(l => l.decision === 'ACCEPTED').length
    const last20Rejected = last20Leads.filter(l => l.decision === 'REJECTED').length

    // Current epoch stats
    const currentLeads = currentEpochId != null
      ? minerLeads.filter(l => l.epochId === currentEpochId)
      : []
    const currentAccepted = currentLeads.filter(l => l.decision === 'ACCEPTED').length
    const currentRejected = currentLeads.filter(l => l.decision === 'REJECTED').length

    // Per-epoch performance for this miner (for MinerTracker chart)
    const epochMap = new Map<number, { accepted: number; rejected: number }>()
    for (const lead of minerLeads) {
      if (lead.epochId == null) continue
      if (!epochMap.has(lead.epochId)) epochMap.set(lead.epochId, { accepted: 0, rejected: 0 })
      const stats = epochMap.get(lead.epochId)!
      if (lead.decision === 'ACCEPTED') stats.accepted++
      else if (lead.decision === 'REJECTED') stats.rejected++
    }
    const epochPerformance: MinerEpochPerformance[] = Array.from(epochMap.entries())
      .map(([epochId, stats]) => ({
        epoch_id: epochId,
        accepted: stats.accepted,
        rejected: stats.rejected,
        acceptance_rate: (stats.accepted + stats.rejected) > 0
          ? Math.round((stats.accepted / (stats.accepted + stats.rejected)) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.epoch_id - a.epoch_id)

    // Rejection reasons for this miner (for MinerTracker chart)
    // Excludes LLM errors, validation errors, etc.
    const rejectedLeads = minerLeads.filter(l => l.decision === 'REJECTED')
    const reasonMap = new Map<string, number>()
    const excludedReasons = ['llm error', 'llm_error', 'no_validation', 'no validation', 'validation error', 'validation_error', 'unknown']
    for (const lead of rejectedLeads) {
      const reason = lead.rejectionReason || 'Unknown'
      const lowerReason = reason.toLowerCase().trim()
      // Skip excluded reasons
      if (excludedReasons.some(ex => lowerReason.includes(ex))) continue
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1)
    }
    const totalFiltered = Array.from(reasonMap.values()).reduce((a, b) => a + b, 0)
    const rejectionReasons: MinerRejectionReason[] = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: totalFiltered > 0 ? Math.round((count / totalFiltered) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count)

    return {
      miner_hotkey: hotkey,
      total_submissions: minerLeads.length,
      accepted,
      rejected,
      pending,
      acceptance_rate: decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : 0,
      avg_rep_score: Math.round(avgRepScore * 1000) / 1000,
      last20_accepted: last20Accepted,
      last20_rejected: last20Rejected,
      current_accepted: currentAccepted,
      current_rejected: currentRejected,
      epoch_performance: epochPerformance,
      rejection_reasons: rejectionReasons,
    }
  }).sort((a, b) => b.acceptance_rate - a.acceptance_rate)
}

function calculateEpochStats(consensusData: ConsensusData[], leads?: MergedLead[]): EpochStats[] {
  // Group consensus data by epoch_id for accurate epoch totals
  const epochMap = new Map<number, ConsensusData[]>()

  for (const cons of consensusData) {
    if (cons.epoch_id == null) continue
    if (!epochMap.has(cons.epoch_id)) epochMap.set(cons.epoch_id, [])
    epochMap.get(cons.epoch_id)!.push(cons)
  }

  // Group leads by epoch for per-miner breakdown (only for active miners)
  const leadsByEpoch = new Map<number, MergedLead[]>()
  if (leads) {
    for (const lead of leads) {
      if (lead.epochId == null) continue
      if (!leadsByEpoch.has(lead.epochId)) leadsByEpoch.set(lead.epochId, [])
      leadsByEpoch.get(lead.epochId)!.push(lead)
    }
  }

  return Array.from(epochMap.entries()).map(([epochId, epochConsensus]) => {
    // Count directly from consensus results (accurate total)
    let accepted = 0
    let rejected = 0

    for (const cons of epochConsensus) {
      const decision = normalizeDecision(cons.decision)
      if (decision === 'ACCEPTED') accepted++
      else if (decision === 'REJECTED') rejected++
    }

    const decided = accepted + rejected

    // Calculate avg rep score for ACCEPTED leads
    const acceptedConsensus = epochConsensus.filter(c => normalizeDecision(c.decision) === 'ACCEPTED')
    const repScores = acceptedConsensus.filter(c => c.rep_score != null).map(c => c.rep_score!)
    const avgRepScore = repScores.length > 0 ? repScores.reduce((a, b) => a + b, 0) / repScores.length : 0

    // Calculate per-miner stats from merged leads (only active miners)
    const epochLeads = leadsByEpoch.get(epochId) || []
    const minerMap = new Map<string, MergedLead[]>()
    for (const lead of epochLeads) {
      if (!minerMap.has(lead.minerHotkey)) minerMap.set(lead.minerHotkey, [])
      minerMap.get(lead.minerHotkey)!.push(lead)
    }

    const miners: EpochMinerStats[] = Array.from(minerMap.entries()).map(([hotkey, minerLeads]) => {
      const mAccepted = minerLeads.filter(l => l.decision === 'ACCEPTED').length
      const mRejected = minerLeads.filter(l => l.decision === 'REJECTED').length
      const mDecided = mAccepted + mRejected
      const mAcceptedLeads = minerLeads.filter(l => l.decision === 'ACCEPTED')
      const mRepScores = mAcceptedLeads.filter(l => l.repScore != null).map(l => l.repScore!)
      const mAvgRepScore = mRepScores.length > 0 ? mRepScores.reduce((a, b) => a + b, 0) / mRepScores.length : 0

      return {
        miner_hotkey: hotkey,
        total: minerLeads.length,
        accepted: mAccepted,
        rejected: mRejected,
        acceptance_rate: mDecided > 0 ? Math.round((mAccepted / mDecided) * 1000) / 10 : 0,
        avg_rep_score: Math.round(mAvgRepScore * 1000) / 1000,
      }
    }).sort((a, b) => b.acceptance_rate - a.acceptance_rate)

    return {
      epoch_id: epochId,
      total_leads: decided,  // Total consensus = accepted + rejected
      accepted,
      rejected,
      acceptance_rate: decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : 0,
      avg_rep_score: Math.round(avgRepScore * 1000) / 1000,
      miners,
    }
  }).sort((a, b) => b.epoch_id - a.epoch_id)
}

// Calculate lead inventory from consensus data (reuses already-fetched data)
// Not filtered by active miners - leads remain in inventory even after miner leaves
function calculateLeadInventoryFromConsensusData(
  consensusData: ConsensusData[],
  rawConsensusWithTimestamps: Array<{ ts: string; lead_id?: string; decision: string }>
): DailyLeadInventory[] {
  console.log('[DB] Calculating lead inventory from consensus data...')
  const startTime = Date.now()

  // Track unique lead_ids and their earliest accepted timestamp
  const acceptedLeadDates = new Map<string, string>() // lead_id -> date

  for (const cons of rawConsensusWithTimestamps) {
    const leadId = cons.lead_id
    const decision = cons.decision?.toUpperCase()

    if (!leadId) continue

    // Only count accepted leads
    if (decision === 'ALLOW' || decision === 'ALLOWED' || decision === 'ACCEPT' || decision === 'ACCEPTED' || decision === 'APPROVE' || decision === 'APPROVED') {
      const date = cons.ts.split('T')[0]
      // Use earliest date for this lead_id
      if (!acceptedLeadDates.has(leadId) || date < acceptedLeadDates.get(leadId)!) {
        acceptedLeadDates.set(leadId, date)
      }
    }
  }

  // Count unique leads by date
  const dateMap = new Map<string, number>()
  for (const date of acceptedLeadDates.values()) {
    dateMap.set(date, (dateMap.get(date) || 0) + 1)
  }

  const dates = Array.from(dateMap.keys()).sort()
  let cumulative = 0

  const result = dates.map(date => {
    const newLeads = dateMap.get(date) || 0
    cumulative += newLeads
    return { date, new_leads: newLeads, cumulative_leads: cumulative }
  })

  const calcTime = Date.now() - startTime
  console.log(`[DB] Lead inventory calculated: ${acceptedLeadDates.size} unique accepted leads (${calcTime}ms)`)

  return result
}

// Calculate lead inventory count from consensus data (reuses already-fetched data)
function calculateLeadInventoryCountFromData(
  rawConsensusWithTimestamps: Array<{ ts: string; lead_id?: string; decision: string }>
): LeadInventoryCount {
  console.log('[DB] Calculating lead inventory count from consensus data...')
  const startTime = Date.now()

  const leadIdsByDecision = new Map<string, Set<string>>()

  for (const cons of rawConsensusWithTimestamps) {
    const leadId = cons.lead_id
    const decision = cons.decision?.toUpperCase()

    if (!leadId) continue

    let normalizedDecision: string
    if (decision === 'ALLOW' || decision === 'ALLOWED' || decision === 'ACCEPT' || decision === 'ACCEPTED' || decision === 'APPROVE' || decision === 'APPROVED') {
      normalizedDecision = 'accepted'
    } else if (decision === 'DENY' || decision === 'DENIED' || decision === 'REJECT' || decision === 'REJECTED') {
      normalizedDecision = 'rejected'
    } else {
      normalizedDecision = 'pending'
    }

    if (!leadIdsByDecision.has(normalizedDecision)) {
      leadIdsByDecision.set(normalizedDecision, new Set())
    }
    leadIdsByDecision.get(normalizedDecision)!.add(leadId)
  }

  const result: LeadInventoryCount = {
    accepted: leadIdsByDecision.get('accepted')?.size || 0,
    rejected: leadIdsByDecision.get('rejected')?.size || 0,
    pending: leadIdsByDecision.get('pending')?.size || 0,
  }

  const calcTime = Date.now() - startTime
  console.log(`[DB] Inventory count: ${result.accepted} accepted, ${result.rejected} rejected, ${result.pending} pending (${calcTime}ms)`)

  return result
}

// Rejection reasons to exclude from charts (internal/technical errors)
const EXCLUDED_REJECTION_REASONS = [
  'llm error',
  'llm_error',
  'no_validation',
  'no validation',
  'validation error',
  'validation_error',
  'unknown',
]

function isExcludedReason(reason: string): boolean {
  const lowerReason = reason.toLowerCase().trim()
  return EXCLUDED_REJECTION_REASONS.some(excluded => lowerReason.includes(excluded))
}

function calculateRejectionReasons(leads: MergedLead[]): RejectionReasonAggregated[] {
  const rejected = leads.filter(l => l.decision === 'REJECTED')
  const reasonMap = new Map<string, number>()

  for (const lead of rejected) {
    const reason = lead.rejectionReason || 'Unknown'
    // Skip excluded reasons
    if (isExcludedReason(reason)) continue
    reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1)
  }

  const total = Array.from(reasonMap.values()).reduce((a, b) => a + b, 0)
  return Array.from(reasonMap.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
}

function calculateIncentiveData(leads: MergedLead[]): IncentiveDataAggregated[] {
  const accepted = leads.filter(l => l.decision === 'ACCEPTED')
  const minerMap = new Map<string, number>()

  for (const lead of accepted) {
    minerMap.set(lead.minerHotkey, (minerMap.get(lead.minerHotkey) || 0) + 1)
  }

  const total = accepted.length
  return Array.from(minerMap.entries())
    .map(([hotkey, count]) => ({
      miner_hotkey: hotkey,
      accepted_leads: count,
      lead_share_pct: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.lead_share_pct - a.lead_share_pct)
}

// Fetch lead journey entries on-demand (for submissions tab)
// Only includes last 72 hours - called directly, not cached
export async function fetchLeadJourneyData(metagraph: MetagraphData | null): Promise<LeadJourneyEntry[]> {
  console.log('[DB] Fetching lead journey data (last 72 hours)...')
  const startTime = Date.now()

  // Always use 72 hour cutoff for lead journey
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

  // Get active miner hotkeys from metagraph (only if metagraph has data)
  // If metagraph is empty/failed, skip filtering to show all data
  const metagraphHotkeys = metagraph ? Object.keys(metagraph.hotkeyToUid) : []
  const activeMiners = metagraphHotkeys.length > 0 ? new Set(metagraphHotkeys) : null

  // Fetch submissions with more details
  const allSubmissions: Array<{
    ts: string
    actor_hotkey: string
    email_hash: string
    payload: { lead_id?: string } | null
  }> = []

  let offset = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('transparency_log')
      .select('ts,actor_hotkey,email_hash,payload')
      .eq('event_type', 'SUBMISSION')
      .not('actor_hotkey', 'is', null)
      .not('email_hash', 'is', null)
      .gte('ts', cutoff)
      .order('ts', { ascending: false })
      .range(offset, offset + batchSize - 1)

    if (error) { console.error('[DB] Error fetching submissions for journey:', error); break }
    if (!data || data.length === 0) break
    allSubmissions.push(...data)
    if (data.length < batchSize) break
    offset += batchSize
  }

  console.log(`[DB] Fetched ${allSubmissions.length} submissions for lead journey`)

  // Filter by active miners (only show data from miners currently in metagraph)
  const filteredSubmissions = activeMiners
    ? allSubmissions.filter(s => activeMiners.has(s.actor_hotkey))
    : allSubmissions

  // Fetch consensus results for these email hashes
  const emailHashes = new Set(filteredSubmissions.map(s => s.email_hash))
  const consensusMap = new Map<string, {
    decision: string
    epoch_id?: number
    rep_score?: number
    rejection_reason?: string
  }>()

  offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('transparency_log')
      .select('email_hash,payload')
      .eq('event_type', 'CONSENSUS_RESULT')
      .not('email_hash', 'is', null)
      .gte('ts', cutoff)
      .range(offset, offset + batchSize - 1)

    if (error) { console.error('[DB] Error fetching consensus for journey:', error); break }
    if (!data || data.length === 0) break

    for (const row of data) {
      if (!row.email_hash || !emailHashes.has(row.email_hash)) continue
      if (consensusMap.has(row.email_hash)) continue
      const p = row.payload as { final_decision?: string; epoch_id?: number; final_rep_score?: number; primary_rejection_reason?: string }
      consensusMap.set(row.email_hash, {
        decision: p?.final_decision || '',
        epoch_id: p?.epoch_id,
        rep_score: p?.final_rep_score,
        rejection_reason: p?.primary_rejection_reason,
      })
    }

    if (data.length < batchSize) break
    offset += batchSize
  }

  // Build lead journey entries
  const seenEmailHashes = new Set<string>()
  const entries: LeadJourneyEntry[] = []

  for (const sub of filteredSubmissions) {
    if (seenEmailHashes.has(sub.email_hash)) continue
    seenEmailHashes.add(sub.email_hash)

    const cons = consensusMap.get(sub.email_hash)
    const payload = sub.payload as { lead_id?: string } | null

    entries.push({
      emailHash: sub.email_hash,
      emailHashShort: sub.email_hash.substring(0, 16) + '...',
      minerHotkey: sub.actor_hotkey,
      minerShort: sub.actor_hotkey,
      timestamp: sub.ts,
      epochId: cons?.epoch_id ?? null,
      decision: cons ? normalizeDecision(cons.decision) : 'PENDING',
      repScore: cons?.rep_score ?? null,
      rejectionReason: cleanRejectionReason(cons?.rejection_reason),
      leadId: payload?.lead_id ?? null,
    })
  }

  const fetchTime = Date.now() - startTime
  console.log(`[DB] Lead journey: ${entries.length} entries in ${fetchTime}ms`)

  return entries
}

// ============================================
// Lead Inventory Count (unique lead_ids from CONSENSUS_RESULT)
// ============================================

export interface LeadInventoryCount {
  accepted: number
  rejected: number
  pending: number
}

// Fetch total submission count (ALL submissions, not filtered by active miners)
export async function fetchTotalSubmissionCount(): Promise<number> {
  console.log('[DB] Fetching total submission count...')
  const startTime = Date.now()

  const { count, error } = await supabase
    .from('transparency_log')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'SUBMISSION')

  if (error) {
    console.error('[DB] Error fetching submission count:', error)
    return 0
  }

  const fetchTime = Date.now() - startTime
  console.log(`[DB] Total submissions: ${count} (${fetchTime}ms)`)

  return count || 0
}

export async function fetchLeadInventoryCount(): Promise<LeadInventoryCount> {
  console.log('[DB] Fetching lead inventory count (unique lead_ids)...')
  const startTime = Date.now()

  const result: LeadInventoryCount = { accepted: 0, rejected: 0, pending: 0 }
  const leadIdsByDecision = new Map<string, Set<string>>()

  let offset = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('transparency_log')
      .select('payload')
      .eq('event_type', 'CONSENSUS_RESULT')
      .range(offset, offset + batchSize - 1)

    if (error) {
      console.error('[DB] Error fetching inventory count:', error)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      const payload = row.payload as { lead_id?: string; final_decision?: string } | null
      const leadId = payload?.lead_id
      const decision = payload?.final_decision?.toUpperCase()

      if (!leadId) continue

      // Normalize decision
      let normalizedDecision: string
      if (decision === 'ALLOW' || decision === 'ALLOWED' || decision === 'ACCEPT' || decision === 'ACCEPTED' || decision === 'APPROVE' || decision === 'APPROVED') {
        normalizedDecision = 'accepted'
      } else if (decision === 'DENY' || decision === 'DENIED' || decision === 'REJECT' || decision === 'REJECTED') {
        normalizedDecision = 'rejected'
      } else {
        normalizedDecision = 'pending'
      }

      if (!leadIdsByDecision.has(normalizedDecision)) {
        leadIdsByDecision.set(normalizedDecision, new Set())
      }
      leadIdsByDecision.get(normalizedDecision)!.add(leadId)
    }

    if (data.length < batchSize) break
    offset += batchSize
  }

  result.accepted = leadIdsByDecision.get('accepted')?.size || 0
  result.rejected = leadIdsByDecision.get('rejected')?.size || 0
  result.pending = leadIdsByDecision.get('pending')?.size || 0

  const fetchTime = Date.now() - startTime
  console.log(`[DB] Inventory count: ${result.accepted} accepted, ${result.rejected} rejected, ${result.pending} pending (${fetchTime}ms)`)

  return result
}

// ============================================
// Latest 100 Leads (cached, refreshes with system)
// ============================================

export interface LatestLead {
  emailHash: string
  minerHotkey: string
  uid: number | null
  leadId: string | null
  timestamp: string
  epochId: number | null
  decision: 'ACCEPTED' | 'REJECTED' | 'PENDING'
  repScore: number | null
  rejectionReason: string | null
}

export async function fetchLatestLeads(metagraph: MetagraphData | null): Promise<LatestLead[]> {
  console.log('[DB] Fetching latest 100 leads...')
  const startTime = Date.now()

  // Get hotkey to UID mapping
  const hotkeyToUid = metagraph?.hotkeyToUid || {}
  const activeMiners = metagraph ? new Set(Object.keys(metagraph.hotkeyToUid)) : null

  // Fetch latest 100 CONSENSUS_RESULT events
  const { data: consensusData, error: consError } = await supabase
    .from('transparency_log')
    .select('ts, email_hash, payload')
    .eq('event_type', 'CONSENSUS_RESULT')
    .not('email_hash', 'is', null)
    .order('ts', { ascending: false })
    .limit(150) // Fetch extra to account for filtering

  if (consError) {
    console.error('[DB] Error fetching latest leads:', consError)
    return []
  }

  if (!consensusData || consensusData.length === 0) {
    return []
  }

  const emailHashes = consensusData.map(c => c.email_hash).filter(Boolean)

  // Fetch submissions for lead_id and miner hotkey
  const { data: submissionData } = await supabase
    .from('transparency_log')
    .select('email_hash, actor_hotkey, ts, payload')
    .eq('event_type', 'SUBMISSION')
    .in('email_hash', emailHashes)

  const submissionMap = new Map<string, { lead_id?: string; actor_hotkey?: string; ts?: string }>()
  if (submissionData) {
    for (const row of submissionData) {
      if (!row.email_hash || submissionMap.has(row.email_hash)) continue
      const payload = row.payload as { lead_id?: string } | null
      submissionMap.set(row.email_hash, {
        lead_id: payload?.lead_id,
        actor_hotkey: row.actor_hotkey,
        ts: row.ts,
      })
    }
  }

  // Build leads
  const leads: LatestLead[] = []
  for (const cons of consensusData) {
    if (leads.length >= 100) break

    const submission = submissionMap.get(cons.email_hash)
    const minerHotkey = submission?.actor_hotkey || ''

    // Filter by active miners if metagraph available
    if (activeMiners && !activeMiners.has(minerHotkey)) continue

    const payload = cons.payload as {
      lead_id?: string
      epoch_id?: number
      final_decision?: string
      final_rep_score?: number
      primary_rejection_reason?: string
    } | null

    leads.push({
      emailHash: cons.email_hash,
      minerHotkey,
      uid: hotkeyToUid[minerHotkey] ?? null,
      leadId: payload?.lead_id || submission?.lead_id || null,
      timestamp: submission?.ts || cons.ts,
      epochId: payload?.epoch_id ?? null,
      decision: normalizeDecision(payload?.final_decision),
      repScore: payload?.final_rep_score ?? null,
      rejectionReason: payload?.primary_rejection_reason ? cleanRejectionReason(payload.primary_rejection_reason) : null,
    })
  }

  const fetchTime = Date.now() - startTime
  console.log(`[DB] Fetched ${leads.length} latest leads in ${fetchTime}ms`)

  return leads
}
