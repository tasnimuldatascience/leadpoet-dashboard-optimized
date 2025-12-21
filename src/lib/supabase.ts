import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for transparency log events
export interface TransparencyLogEvent {
  id: string
  ts: string
  event_type: string
  actor_hotkey: string | null
  email_hash: string | null
  tee_sequence: number | null
  payload: EventPayload
}

export interface EventPayload {
  lead_id?: string
  lead_blob_hash?: string
  miner_hotkey?: string
  uid?: number
  epoch_id?: number
  final_decision?: string
  final_rep_score?: number
  primary_rejection_reason?: string
  validator_count?: number
  consensus_weight?: number
  mirror?: string
  verified?: boolean
  hash_match?: boolean
}

// Helper to add delay between batches
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// Fields needed for consensus results (for matching with submissions)
const CONSENSUS_SELECT = 'id,ts,email_hash,payload'

// Fields needed for submissions
const SUBMISSION_SELECT = 'id,ts,actor_hotkey,email_hash,tee_sequence,payload'

// Fetch with retry logic and delays to avoid overwhelming Supabase
// Returns { data, failed } to distinguish between empty result and failure
async function fetchWithRetry<T>(
  queryFn: () => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  maxRetries = 3,
  retryDelay = 2000
): Promise<{ data: T[]; failed: boolean }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await queryFn()

    if (!error) {
      return { data: data || [], failed: false }
    }

    // On timeout, wait and retry
    if (error.code === '57014' && attempt < maxRetries - 1) {
      console.log(`Timeout, retrying (attempt ${attempt + 2}/${maxRetries})...`)
      await delay(retryDelay * (attempt + 1)) // Exponential backoff
      continue
    }

    console.error('Query error:', error)
    return { data: [], failed: true }
  }

  return { data: [], failed: true }
}

// Fetch consensus results (no timestamp filter - filtered by UID in metagraph later)
export async function fetchConsensusResults(_hoursFilter: number = 0): Promise<TransparencyLogEvent[]> {
  const allData: TransparencyLogEvent[] = []
  let offset = 0
  const batchSize = 1000
  let consecutiveFailures = 0
  const maxConsecutiveFailures = 3

  while (consecutiveFailures < maxConsecutiveFailures) {
    const result = await fetchWithRetry(() =>
      supabase
        .from('transparency_log')
        .select(CONSENSUS_SELECT)
        .eq('event_type', 'CONSENSUS_RESULT')
        .order('ts', { ascending: false })
        .range(offset, offset + batchSize - 1)
    )

    if (result.failed) {
      consecutiveFailures++
      console.log(`[Supabase] Batch at offset ${offset} failed, skipping (${consecutiveFailures}/${maxConsecutiveFailures} consecutive failures)`)
      offset += batchSize
      continue
    }

    consecutiveFailures = 0 // Reset on success

    if (result.data.length === 0) break

    allData.push(...(result.data as TransparencyLogEvent[]))

    if (result.data.length < batchSize) break
    offset += batchSize

    // Small delay between batches to avoid overwhelming the database
    if (offset % 10000 === 0) {
      await delay(100)
    }
  }

  console.log(`[Supabase] Fetched ${allData.length} CONSENSUS_RESULT events`)
  return allData
}

// Fetch submissions (no timestamp filter - filtered by UID in metagraph later)
export async function fetchSubmissions(_hoursFilter: number = 0): Promise<TransparencyLogEvent[]> {
  const allData: TransparencyLogEvent[] = []
  let offset = 0
  const batchSize = 1000
  let consecutiveFailures = 0
  const maxConsecutiveFailures = 3

  while (consecutiveFailures < maxConsecutiveFailures) {
    const result = await fetchWithRetry(() =>
      supabase
        .from('transparency_log')
        .select(SUBMISSION_SELECT)
        .eq('event_type', 'SUBMISSION')
        .order('ts', { ascending: false })
        .range(offset, offset + batchSize - 1)
    )

    if (result.failed) {
      consecutiveFailures++
      console.log(`[Supabase] Batch at offset ${offset} failed, skipping (${consecutiveFailures}/${maxConsecutiveFailures} consecutive failures)`)
      offset += batchSize
      continue
    }

    consecutiveFailures = 0 // Reset on success

    if (result.data.length === 0) break

    allData.push(...(result.data as TransparencyLogEvent[]))

    if (result.data.length < batchSize) break
    offset += batchSize

    // Small delay between batches to avoid overwhelming the database
    if (offset % 10000 === 0) {
      await delay(100)
    }
  }

  console.log(`[Supabase] Fetched ${allData.length} SUBMISSION events`)
  return allData
}

// Fetch all consensus results for epoch stats (directly from CONSENSUS_RESULT events)
export async function fetchAllConsensusForEpochStats(): Promise<TransparencyLogEvent[]> {
  const allData: TransparencyLogEvent[] = []
  let offset = 0
  const batchSize = 1000
  let consecutiveFailures = 0
  const maxConsecutiveFailures = 3

  while (consecutiveFailures < maxConsecutiveFailures) {
    const result = await fetchWithRetry(() =>
      supabase
        .from('transparency_log')
        .select(CONSENSUS_SELECT)
        .eq('event_type', 'CONSENSUS_RESULT')
        .order('ts', { ascending: false })
        .range(offset, offset + batchSize - 1)
    )

    if (result.failed) {
      consecutiveFailures++
      console.log(`[Supabase] EpochStats batch at offset ${offset} failed, skipping (${consecutiveFailures}/${maxConsecutiveFailures} consecutive failures)`)
      offset += batchSize
      continue
    }

    consecutiveFailures = 0 // Reset on success

    if (result.data.length === 0) break

    allData.push(...(result.data as TransparencyLogEvent[]))

    if (result.data.length < batchSize) break
    offset += batchSize

    if (offset % 10000 === 0) {
      await delay(100)
    }
  }

  return allData
}

// Fetch lead journey by email hash
export async function fetchLeadJourney(emailHash: string): Promise<TransparencyLogEvent[]> {
  const { data, error } = await supabase
    .from('transparency_log')
    .select('*')
    .eq('email_hash', emailHash)
    .order('ts', { ascending: true })

  if (error) {
    console.error('Error fetching lead journey:', error)
    return []
  }

  return data || []
}
