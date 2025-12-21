import { TransparencyLogEvent, fetchConsensusResults, fetchSubmissions, fetchAllConsensusForEpochStats } from './supabase'
import type {
  MergedSubmission,
  MinerStats,
  EpochStats,
  RejectionReason,
  LeadInventoryData,
  DashboardMetrics,
  IncentiveData,
  MetagraphData,
} from './types'

// Clean up rejection reason to show readable label
// Uses failed_fields > check_name > stage > message for accurate categorization
export function cleanRejectionReason(reason: string | null | undefined): string {
  if (!reason || reason === 'N/A') return 'N/A'

  // Try to parse as JSON
  try {
    if (reason.startsWith('{')) {
      const parsed = JSON.parse(reason)

      // Priority 1: Use failed_fields array (most accurate)
      const failedFields: string[] = parsed.failed_fields || []
      if (failedFields.length > 0) {
        const fieldMap: Record<string, string> = {
          email: 'Invalid Email',
          website: 'Invalid Website',
          site: 'Invalid Website',
          source_url: 'Invalid Source URL',
          linkedin: 'Invalid LinkedIn',
          region: 'Invalid Region',
          role: 'Invalid Role',
          industry: 'Invalid Industry',
          phone: 'Invalid Phone',
          name: 'Invalid Name',
          first_name: 'Invalid Name',
          last_name: 'Invalid Name',
          company: 'Invalid Company',
          title: 'Invalid Title',
          address: 'Invalid Address',
          exception: 'Validation Error',
          llm_error: 'LLM Error',
          source_type: 'Invalid Source Type',
        }

        for (const field of failedFields) {
          const mapped = fieldMap[field.toLowerCase()]
          if (mapped) return mapped
        }

        // Fallback for unknown fields
        return `Invalid ${failedFields[0].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`
      }

      // Priority 2: Use check_name
      const checkName = parsed.check_name || ''
      const message = parsed.message || ''

      const checkNameMap: Record<string, string> = {
        check_truelist_email: 'Invalid Email',
        check_myemailverifier_email: 'Invalid Email',
        check_email_regex: 'Invalid Email',
        check_mx_record: 'Invalid Email',
        check_linkedin_gse: 'Invalid LinkedIn',
        check_head_request: 'Invalid Website',
        check_source_provenance: 'Invalid Source URL',
        check_domain_age: 'Invalid Website',
        check_dnsbl: 'Invalid Website',
        check_name_email_match: 'Name/Email Mismatch',
        check_free_email_domain: 'Free Email Domain',
        validation_error: 'Validation Error',
        deep_verification: 'Deep Verification Failed',
      }

      if (checkName === 'check_stage5_unified') {
        // Parse message to determine role/region/industry
        const msgLower = message.toLowerCase()
        if (msgLower.includes('region failed') || (msgLower.includes('region') && msgLower.includes('failed'))) {
          return 'Invalid Region'
        }
        if (msgLower.includes('role failed') || (msgLower.includes('role') && msgLower.includes('failed'))) {
          return 'Invalid Role'
        }
        if (msgLower.includes('industry') && (msgLower.includes('failed') || msgLower.includes('verification failed'))) {
          return 'Invalid Industry'
        }
        return 'Role/Region/Industry Failed'
      }

      if (checkNameMap[checkName]) {
        return checkNameMap[checkName]
      }

      // Priority 3: Use stage
      const stage = parsed.stage || ''
      if (stage.includes('Email') || stage.includes('TrueList') || stage.includes('MyEmailVerifier')) {
        return 'Invalid Email'
      }
      if (stage.includes('LinkedIn') || stage.includes('GSE')) {
        return 'Invalid LinkedIn'
      }
      if (stage.includes('DNS') || stage.includes('Domain')) {
        return 'Invalid Website'
      }
      if (stage.includes('Source Provenance')) {
        return 'Invalid Source URL'
      }
      if (stage.includes('Hardcoded')) {
        return 'Invalid Website'
      }

      // Legacy: check for single failed_field
      if (parsed.failed_field) {
        const fieldMap: Record<string, string> = {
          site: 'Invalid Website',
          website: 'Invalid Website',
          email: 'Invalid Email',
          phone: 'Invalid Phone',
          name: 'Invalid Name',
          company: 'Invalid Company',
          title: 'Invalid Title',
          linkedin: 'Invalid LinkedIn',
          address: 'Invalid Address',
        }
        return fieldMap[parsed.failed_field.toLowerCase()] || `Invalid ${parsed.failed_field}`
      }

      if (parsed.reason) return parsed.reason.substring(0, 50)
      if (parsed.error) return parsed.error.substring(0, 50)
    }
  } catch {
    // Not JSON, continue with pattern matching
  }

  // Fallback: simple string pattern matching (avoid matching check_name)
  const reasonLower = reason.toLowerCase()

  if (reasonLower.includes('duplicate')) return 'Duplicate Lead'
  if (reasonLower.includes('spam')) return 'Spam Detected'
  if (reasonLower.includes('disposable')) return 'Disposable Email'
  if (reasonLower.includes('catchall') || reasonLower.includes('catch-all')) return 'Catch-all Email'
  if (reasonLower.includes('bounced') || reasonLower.includes('bounce')) return 'Email Bounced'

  // Clean and truncate
  const clean = reason.replace(/[{}\[\]"':]/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > 40 ? clean.substring(0, 40) + '...' : clean
}

// Normalize decision value
function normalizeDecision(decision: string | undefined): 'ACCEPTED' | 'REJECTED' | 'PENDING' {
  if (!decision) return 'PENDING'
  const lower = decision.toLowerCase()
  if (['deny', 'denied', 'reject', 'rejected'].includes(lower)) return 'REJECTED'
  if (['allow', 'allowed', 'accept', 'accepted', 'approve', 'approved'].includes(lower)) return 'ACCEPTED'
  return 'PENDING'
}

// Get all data using SUBMISSION as primary source (all miner submissions)
// Join with CONSENSUS_RESULT to get decisions - unmatched = PENDING
export async function getMergedData(hoursFilter: number = 0): Promise<MergedSubmission[]> {
  const [submissions, consensus] = await Promise.all([
    fetchSubmissions(hoursFilter),
    fetchConsensusResults(hoursFilter),
  ])

  // Create a map of email_hash -> consensus data (for decision lookup)
  const consensusMap = new Map<string, TransparencyLogEvent>()
  for (const cons of consensus) {
    if (cons.email_hash && !consensusMap.has(cons.email_hash)) {
      consensusMap.set(cons.email_hash, cons)
    }
  }

  // Use SUBMISSION as primary source (all miner submissions)
  // Join with CONSENSUS_RESULT to get decisions - no match = PENDING
  return submissions.map((sub) => {
    const consensusEvent = sub.email_hash ? consensusMap.get(sub.email_hash) : null
    const payload = sub.payload || {}
    const consPayload = consensusEvent?.payload || {}

    return {
      timestamp: sub.ts,
      leadId: payload.lead_id || consPayload.lead_id || null,
      minerHotkey: sub.actor_hotkey || payload.miner_hotkey || '',
      uid: null, // Will be filled from metagraph
      emailHash: sub.email_hash ? sub.email_hash.substring(0, 16) + '...' : null,
      emailHashFull: sub.email_hash,
      leadBlobHash: payload.lead_blob_hash
        ? payload.lead_blob_hash.substring(0, 16) + '...'
        : null,
      teeSequence: sub.tee_sequence || null,
      epochId: consPayload.epoch_id || null,
      // If no consensus result, mark as PENDING
      finalDecision: consensusEvent ? normalizeDecision(consPayload.final_decision) : 'PENDING',
      finalRepScore: consPayload.final_rep_score || null,
      primaryRejectionReason: cleanRejectionReason(consPayload.primary_rejection_reason),
      validatorCount: consPayload.validator_count || null,
    }
  })
}

// Calculate dashboard metrics
export function calculateMetrics(data: MergedSubmission[]): DashboardMetrics {
  if (data.length === 0) {
    return {
      total: 0,
      accepted: 0,
      rejected: 0,
      pending: 0,
      acceptanceRate: 0,
      avgRepScore: 0,
      activeMiners: 0,
    }
  }

  const accepted = data.filter((d) => d.finalDecision === 'ACCEPTED').length
  const rejected = data.filter((d) => d.finalDecision === 'REJECTED').length
  const pending = data.filter((d) => d.finalDecision === 'PENDING').length
  const decided = accepted + rejected
  const acceptanceRate = decided > 0 ? (accepted / decided) * 100 : 0

  const repScores = data.filter((d) => d.finalRepScore != null).map((d) => d.finalRepScore!)
  const avgRepScore = repScores.length > 0 ? repScores.reduce((a, b) => a + b, 0) / repScores.length : 0

  const uniqueMiners = new Set(data.map((d) => d.minerHotkey).filter(Boolean))

  return {
    total: data.length,
    accepted,
    rejected,
    pending,
    acceptanceRate: Math.round(acceptanceRate * 10) / 10,
    avgRepScore: Math.round(avgRepScore * 10000) / 10000,
    activeMiners: uniqueMiners.size,
  }
}

// Calculate miner stats
export function calculateMinerStats(
  data: MergedSubmission[],
  metagraph: MetagraphData | null
): MinerStats[] {
  const minerMap = new Map<string, MergedSubmission[]>()

  for (const sub of data) {
    if (!sub.minerHotkey || sub.minerHotkey === 'system' || sub.minerHotkey === 'gateway') continue

    // Only include miners in the metagraph
    if (metagraph && !metagraph.hotkeyToUid[sub.minerHotkey]) continue

    if (!minerMap.has(sub.minerHotkey)) {
      minerMap.set(sub.minerHotkey, [])
    }
    minerMap.get(sub.minerHotkey)!.push(sub)
  }

  return Array.from(minerMap.entries())
    .map(([hotkey, submissions]) => {
      const accepted = submissions.filter((s) => s.finalDecision === 'ACCEPTED').length
      const rejected = submissions.filter((s) => s.finalDecision === 'REJECTED').length
      const pending = submissions.filter((s) => s.finalDecision === 'PENDING').length
      const decided = accepted + rejected
      const acceptanceRate = decided > 0 ? (accepted / decided) * 100 : 0

      const repScores = submissions
        .filter((s) => s.finalRepScore != null)
        .map((s) => s.finalRepScore!)
      const avgRepScore =
        repScores.length > 0 ? repScores.reduce((a, b) => a + b, 0) / repScores.length : 0

      const uid = metagraph?.hotkeyToUid[hotkey] ?? null
      const btIncentive = metagraph?.incentives?.[hotkey] ?? 0
      const btEmission = metagraph?.emissions?.[hotkey] ?? 0
      const stake = metagraph?.stakes?.[hotkey] ?? 0

      return {
        uid,
        minerHotkey: hotkey,
        minerShort: hotkey.substring(0, 20) + '...',
        total: submissions.length,
        accepted,
        rejected,
        pending,
        acceptanceRate: Math.round(acceptanceRate * 10) / 10,
        avgRepScore: Math.round(avgRepScore * 1000) / 1000,
        btIncentive: btIncentive * 100, // Convert to percentage (no rounding)
        btEmission: btEmission, // Raw emission value from metagraph
        stake: Math.round(stake * 100) / 100,
      }
    })
    .sort((a, b) => b.acceptanceRate - a.acceptanceRate)
}

// Calculate epoch stats from merged data (legacy - may miss some consensus results)
export function calculateEpochStats(data: MergedSubmission[]): EpochStats[] {
  const epochMap = new Map<number, MergedSubmission[]>()

  for (const sub of data) {
    if (sub.epochId == null) continue

    if (!epochMap.has(sub.epochId)) {
      epochMap.set(sub.epochId, [])
    }
    epochMap.get(sub.epochId)!.push(sub)
  }

  return Array.from(epochMap.entries())
    .map(([epochId, submissions]) => {
      const accepted = submissions.filter((s) => s.finalDecision === 'ACCEPTED').length
      const rejected = submissions.filter((s) => s.finalDecision === 'REJECTED').length
      const decided = accepted + rejected
      const acceptanceRate = decided > 0 ? (accepted / decided) * 100 : 0

      const repScores = submissions
        .filter((s) => s.finalRepScore != null)
        .map((s) => s.finalRepScore!)
      const avgRepScore =
        repScores.length > 0 ? repScores.reduce((a, b) => a + b, 0) / repScores.length : 0

      return {
        epochId,
        total: submissions.length,
        accepted,
        rejected,
        acceptanceRate: Math.round(acceptanceRate * 10) / 10,
        avgRepScore: Math.round(avgRepScore * 1000) / 1000,
      }
    })
    .sort((a, b) => b.epochId - a.epochId)
}

// Normalize decision value for consensus events
function normalizeConsensusDecision(decision: string | undefined): 'ACCEPTED' | 'REJECTED' | 'PENDING' {
  if (!decision) return 'PENDING'
  const lower = decision.toLowerCase()
  if (['deny', 'denied', 'reject', 'rejected'].includes(lower)) return 'REJECTED'
  if (['allow', 'allowed', 'accept', 'accepted', 'approve', 'approved'].includes(lower)) return 'ACCEPTED'
  return 'PENDING'
}

// Calculate epoch stats directly from CONSENSUS_RESULT events (accurate totals)
export async function calculateEpochStatsFromConsensus(): Promise<EpochStats[]> {
  const consensusEvents = await fetchAllConsensusForEpochStats()

  const epochMap = new Map<number, TransparencyLogEvent[]>()

  for (const event of consensusEvents) {
    const epochId = event.payload?.epoch_id
    if (epochId == null) continue

    if (!epochMap.has(epochId)) {
      epochMap.set(epochId, [])
    }
    epochMap.get(epochId)!.push(event)
  }

  return Array.from(epochMap.entries())
    .map(([epochId, events]) => {
      const accepted = events.filter((e) =>
        normalizeConsensusDecision(e.payload?.final_decision) === 'ACCEPTED'
      ).length
      const rejected = events.filter((e) =>
        normalizeConsensusDecision(e.payload?.final_decision) === 'REJECTED'
      ).length
      const decided = accepted + rejected
      const acceptanceRate = decided > 0 ? (accepted / decided) * 100 : 0

      const repScores = events
        .filter((e) => e.payload?.final_rep_score != null)
        .map((e) => e.payload!.final_rep_score!)
      const avgRepScore =
        repScores.length > 0 ? repScores.reduce((a, b) => a + b, 0) / repScores.length : 0

      return {
        epochId,
        total: events.length,
        accepted,
        rejected,
        acceptanceRate: Math.round(acceptanceRate * 10) / 10,
        avgRepScore: Math.round(avgRepScore * 1000) / 1000,
      }
    })
    .sort((a, b) => b.epochId - a.epochId)
}

// Calculate rejection reasons
export function calculateRejectionReasons(data: MergedSubmission[]): RejectionReason[] {
  const rejected = data.filter((d) => d.finalDecision === 'REJECTED')
  const reasonMap = new Map<string, number>()

  for (const sub of rejected) {
    const reason = sub.primaryRejectionReason || 'Unknown'
    reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1)
  }

  const total = rejected.length

  return Array.from(reasonMap.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
}

// Calculate incentive distribution
export function calculateIncentives(
  data: MergedSubmission[],
  metagraph: MetagraphData | null
): IncentiveData[] {
  const minerAccepted = new Map<string, number>()

  for (const sub of data) {
    if (sub.finalDecision !== 'ACCEPTED' || !sub.minerHotkey) continue
    if (sub.minerHotkey === 'system' || sub.minerHotkey === 'gateway') continue

    // Only include miners in the metagraph
    if (metagraph && !metagraph.hotkeyToUid[sub.minerHotkey]) continue

    minerAccepted.set(sub.minerHotkey, (minerAccepted.get(sub.minerHotkey) || 0) + 1)
  }

  const totalAccepted = Array.from(minerAccepted.values()).reduce((a, b) => a + b, 0)

  return Array.from(minerAccepted.entries())
    .map(([hotkey, accepted]) => {
      const uid = metagraph?.hotkeyToUid[hotkey] ?? null
      const btIncentive = metagraph?.incentives[hotkey] ?? 0

      return {
        minerShort: hotkey.substring(0, 20) + '...',
        minerHotkey: hotkey,
        uid,
        acceptedLeads: accepted,
        leadSharePct: totalAccepted > 0 ? Math.round((accepted / totalAccepted) * 10000) / 100 : 0,
        btIncentivePct: btIncentive * 100, // Convert to percentage (no rounding)
      }
    })
    .filter((d) => d.uid != null)
    .sort((a, b) => b.leadSharePct - a.leadSharePct)
}

// Calculate lead inventory data
export function calculateLeadInventory(data: MergedSubmission[]): LeadInventoryData[] {
  const validLeads = data.filter((d) => d.finalDecision === 'ACCEPTED')

  if (validLeads.length === 0) return []

  // Group by date
  const dateMap = new Map<string, number>()

  for (const lead of validLeads) {
    const date = lead.timestamp.split('T')[0]
    dateMap.set(date, (dateMap.get(date) || 0) + 1)
  }

  // Convert to array and sort by date
  const dailyData = Array.from(dateMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Calculate cumulative sum
  let cumulative = 0
  return dailyData.map(({ date, count }) => {
    cumulative += count
    return {
      date,
      totalValidInventory: cumulative,
      newValidLeads: count,
    }
  })
}

// Get unique miners from data (filtered by metagraph)
export function getActiveMiners(
  data: MergedSubmission[],
  metagraph: MetagraphData | null
): string[] {
  const miners = new Set<string>()

  for (const sub of data) {
    if (!sub.minerHotkey || sub.minerHotkey === 'system' || sub.minerHotkey === 'gateway') continue

    // Only include miners in the metagraph
    if (metagraph && !metagraph.hotkeyToUid[sub.minerHotkey]) continue

    miners.add(sub.minerHotkey)
  }

  return Array.from(miners).sort()
}

// Filter data to only miners with UIDs in metagraph
export function filterToActiveMiners(
  data: MergedSubmission[],
  metagraph: MetagraphData | null
): MergedSubmission[] {
  if (!metagraph) return data

  return data.filter((sub) => {
    if (!sub.minerHotkey) return false
    return metagraph.hotkeyToUid[sub.minerHotkey] !== undefined
  })
}
