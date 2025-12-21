// Database aggregation queries - fetch once, aggregate all stats
// Time filtering done at DB level, filter by active miners (metagraph)
// Results cached for 5 minutes (~100KB, not raw data)

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

// Clean up rejection reason
function cleanRejectionReason(reason: string | null | undefined): string {
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

// Fetch and merge submissions with consensus - SINGLE fetch, used by all aggregations
async function fetchMergedLeads(hours: number, metagraph: MetagraphData | null): Promise<MergedLead[]> {
  console.log(`[DB] Fetching merged leads (hours=${hours})...`)
  const startTime = Date.now()
  const cutoff = getTimeCutoff(hours)

  // Get active miner hotkeys from metagraph (only if metagraph has data)
  // If metagraph is empty/failed, skip filtering to show all data
  const metagraphHotkeys = metagraph ? Object.keys(metagraph.hotkeyToUid) : []
  const activeMiners = metagraphHotkeys.length > 0 ? new Set(metagraphHotkeys) : null

  // Fetch submissions (primary source)
  const allSubmissions: Array<{ ts: string; actor_hotkey: string; email_hash: string }> = []
  let offset = 0
  const batchSize = 1000

  while (true) {
    let query = supabase
      .from('transparency_log')
      .select('ts,actor_hotkey,email_hash')
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

  // Filter by active miners
  const filteredSubmissions = activeMiners
    ? allSubmissions.filter(s => activeMiners.has(s.actor_hotkey))
    : allSubmissions

  console.log(`[DB] Filtered to ${filteredSubmissions.length} submissions from active miners`)

  // Fetch consensus results
  const consensusMap = new Map<string, { decision: string; epoch_id?: number; rep_score?: number; rejection_reason?: string }>()
  offset = 0

  while (true) {
    let query = supabase
      .from('transparency_log')
      .select('email_hash,payload')
      .eq('event_type', 'CONSENSUS_RESULT')
      .not('email_hash', 'is', null)

    if (cutoff) query = query.gte('ts', cutoff)

    const { data, error } = await query.range(offset, offset + batchSize - 1)
    if (error) { console.error('[DB] Error fetching consensus:', error); break }
    if (!data || data.length === 0) break

    for (const row of data) {
      if (!row.email_hash || consensusMap.has(row.email_hash)) continue
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

  console.log(`[DB] Fetched ${consensusMap.size} unique consensus results`)

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
      epochId: cons?.epoch_id ?? null,
      decision: cons ? normalizeDecision(cons.decision) : 'PENDING',
      repScore: cons?.rep_score ?? null,
      rejectionReason: cleanRejectionReason(cons?.rejection_reason),
    })
  }

  const fetchTime = Date.now() - startTime
  console.log(`[DB] Merged ${merged.length} leads in ${fetchTime}ms`)

  return merged
}

// Main function: Fetch all dashboard data in ONE call
export interface AllDashboardData {
  summary: DashboardSummary
  minerStats: MinerStats[]
  epochStats: EpochStats[]
  leadInventory: DailyLeadInventory[]
  rejectionReasons: RejectionReasonAggregated[]
  incentiveData: IncentiveDataAggregated[]
}

// All valid time presets
const ALL_HOUR_PRESETS = [0, 1, 6, 12, 24, 48, 72, 168]

// Track if cache warming is in progress
let isWarmingCache = false

export async function fetchAllDashboardData(hours: number, metagraph: MetagraphData | null): Promise<AllDashboardData> {
  // Stale-while-revalidate: Try to get cached data (even if stale)
  const staleResult = simpleCache.getStale<AllDashboardData>('dashboard', hours)

  if (staleResult) {
    if (!staleResult.isStale) {
      // Fresh data - return immediately
      return staleResult.data
    }

    // Data is stale - return it immediately but refresh in background
    if (!simpleCache.isRefreshing('dashboard', hours)) {
      console.log(`[Cache] Returning stale data for hours=${hours}, refreshing in background...`)
      refreshDataInBackground(hours, metagraph)
    }
    return staleResult.data
  }

  // No cached data - must fetch fresh
  console.log(`[DB] Fetching all dashboard data (hours=${hours})...`)
  const startTime = Date.now()

  // Single fetch of merged data
  const leads = await fetchMergedLeads(hours, metagraph)

  // Calculate all aggregations from the same data
  const summary = calculateSummary(leads)
  const minerStats = calculateMinerStats(leads)
  const epochStats = calculateEpochStats(leads)
  const leadInventory = calculateLeadInventory(leads)
  const rejectionReasons = calculateRejectionReasons(leads)
  const incentiveData = calculateIncentiveData(leads)

  const result = { summary, minerStats, epochStats, leadInventory, rejectionReasons, incentiveData }

  // Cache the aggregated results
  simpleCache.set('dashboard', result, hours)

  const totalTime = Date.now() - startTime
  console.log(`[DB] All dashboard data calculated in ${totalTime}ms`)

  // Trigger background cache warming for other presets (only once)
  if (!isWarmingCache) {
    warmCacheInBackground(metagraph)
  }

  return result
}

// Refresh data in background without blocking the response
async function refreshDataInBackground(hours: number, metagraph: MetagraphData | null) {
  simpleCache.setRefreshing('dashboard', hours, true)

  try {
    console.log(`[Cache] Background refresh started for hours=${hours}...`)
    const startTime = Date.now()

    const leads = await fetchMergedLeads(hours, metagraph)
    const summary = calculateSummary(leads)
    const minerStats = calculateMinerStats(leads)
    const epochStats = calculateEpochStats(leads)
    const leadInventory = calculateLeadInventory(leads)
    const rejectionReasons = calculateRejectionReasons(leads)
    const incentiveData = calculateIncentiveData(leads)

    const result = { summary, minerStats, epochStats, leadInventory, rejectionReasons, incentiveData }
    simpleCache.set('dashboard', result, hours)

    const totalTime = Date.now() - startTime
    console.log(`[Cache] Background refresh completed for hours=${hours} in ${totalTime}ms`)
  } catch (err) {
    console.error(`[Cache] Background refresh failed for hours=${hours}:`, err)
    simpleCache.setRefreshing('dashboard', hours, false)
  }
}

// Pre-warm cache for all time presets in background
async function warmCacheInBackground(metagraph: MetagraphData | null) {
  if (isWarmingCache) return
  isWarmingCache = true

  console.log('[Cache] Starting background cache warming...')

  for (const hours of ALL_HOUR_PRESETS) {
    // Skip if already cached
    if (simpleCache.get<AllDashboardData>('dashboard', hours)) {
      continue
    }

    try {
      console.log(`[Cache] Warming cache for hours=${hours}...`)
      const leads = await fetchMergedLeads(hours, metagraph)
      const summary = calculateSummary(leads)
      const minerStats = calculateMinerStats(leads)
      const epochStats = calculateEpochStats(leads)
      const leadInventory = calculateLeadInventory(leads)
      const rejectionReasons = calculateRejectionReasons(leads)
      const incentiveData = calculateIncentiveData(leads)

      const result = { summary, minerStats, epochStats, leadInventory, rejectionReasons, incentiveData }
      simpleCache.set('dashboard', result, hours)
    } catch (err) {
      console.error(`[Cache] Failed to warm cache for hours=${hours}:`, err)
    }
  }

  console.log('[Cache] Background cache warming complete!')
  isWarmingCache = false
}

// Aggregation functions (work on already-fetched data)
function calculateSummary(leads: MergedLead[]): DashboardSummary {
  const accepted = leads.filter(l => l.decision === 'ACCEPTED').length
  const rejected = leads.filter(l => l.decision === 'REJECTED').length
  const pending = leads.filter(l => l.decision === 'PENDING').length
  const total = leads.length
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

function calculateEpochStats(leads: MergedLead[]): EpochStats[] {
  const epochMap = new Map<number, MergedLead[]>()

  for (const lead of leads) {
    if (lead.epochId == null) continue
    if (!epochMap.has(lead.epochId)) epochMap.set(lead.epochId, [])
    epochMap.get(lead.epochId)!.push(lead)
  }

  return Array.from(epochMap.entries()).map(([epochId, epochLeads]) => {
    const accepted = epochLeads.filter(l => l.decision === 'ACCEPTED').length
    const rejected = epochLeads.filter(l => l.decision === 'REJECTED').length
    const decided = accepted + rejected

    // Only calculate avg rep score for ACCEPTED leads
    const acceptedEpochLeads = epochLeads.filter(l => l.decision === 'ACCEPTED')
    const repScores = acceptedEpochLeads.filter(l => l.repScore != null).map(l => l.repScore!)
    const avgRepScore = repScores.length > 0 ? repScores.reduce((a, b) => a + b, 0) / repScores.length : 0

    // Calculate per-miner stats for this epoch
    const minerMap = new Map<string, MergedLead[]>()
    for (const lead of epochLeads) {
      if (!minerMap.has(lead.minerHotkey)) minerMap.set(lead.minerHotkey, [])
      minerMap.get(lead.minerHotkey)!.push(lead)
    }

    const miners: EpochMinerStats[] = Array.from(minerMap.entries()).map(([hotkey, minerLeads]) => {
      const mAccepted = minerLeads.filter(l => l.decision === 'ACCEPTED').length
      const mRejected = minerLeads.filter(l => l.decision === 'REJECTED').length
      const mDecided = mAccepted + mRejected
      // Only calculate avg rep score for ACCEPTED leads
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
      total_leads: epochLeads.length,
      accepted,
      rejected,
      acceptance_rate: decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : 0,
      avg_rep_score: Math.round(avgRepScore * 1000) / 1000,
      miners,
    }
  }).sort((a, b) => b.epoch_id - a.epoch_id)
}

function calculateLeadInventory(leads: MergedLead[]): DailyLeadInventory[] {
  const acceptedLeads = leads.filter(l => l.decision === 'ACCEPTED')
  const dateMap = new Map<string, number>()

  for (const lead of acceptedLeads) {
    const date = lead.timestamp.split('T')[0]
    dateMap.set(date, (dateMap.get(date) || 0) + 1)
  }

  const dates = Array.from(dateMap.keys()).sort()
  let cumulative = 0

  return dates.map(date => {
    const newLeads = dateMap.get(date) || 0
    cumulative += newLeads
    return { date, new_leads: newLeads, cumulative_leads: cumulative }
  })
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

  // Filter by active miners
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
      minerShort: sub.actor_hotkey.substring(0, 16) + '...',
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
