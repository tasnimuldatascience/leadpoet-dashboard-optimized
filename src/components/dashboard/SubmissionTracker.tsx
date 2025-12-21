'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  FileText,
  Database,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Info,
  Loader2,
  Copy,
  Check,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchLeadJourney } from '@/lib/supabase'
import type { JourneyEvent } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface SearchResult {
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

// Copyable text component
function CopyableText({ text, shortText }: { text: string; shortText: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <span
      onClick={handleCopy}
      className="cursor-pointer hover:text-primary inline-flex items-center gap-1 group"
      title={`Click to copy: ${text}`}
    >
      {shortText}
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50" />
      )}
    </span>
  )
}

// Normalize decision values
function normalizeDecision(decision: string | undefined): 'ACCEPTED' | 'REJECTED' | 'PENDING' {
  if (!decision) return 'PENDING'
  const lower = decision.toLowerCase()
  if (['deny', 'denied', 'reject', 'rejected'].includes(lower)) return 'REJECTED'
  if (['allow', 'allowed', 'accept', 'accepted', 'approve', 'approved'].includes(lower)) return 'ACCEPTED'
  return 'PENDING'
}

export function SubmissionTracker() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedEmailHash, setSelectedEmailHash] = useState<string | null>(null)
  const [journeyEvents, setJourneyEvents] = useState<JourneyEvent[]>([])
  const [loadingJourney, setLoadingJourney] = useState(false)

  // Search database directly
  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setHasSearched(true)
    setSelectedEmailHash(null)

    try {
      const query = searchQuery.trim()

      // Search submissions by lead_id in payload only
      const { data: submissions, error } = await supabase
        .from('transparency_log')
        .select('ts, actor_hotkey, email_hash, payload')
        .eq('event_type', 'SUBMISSION')
        .ilike('payload->>lead_id', `%${query}%`)
        .order('ts', { ascending: false })
        .limit(100)

      if (error) {
        console.error('Search error:', error)
        setSearchResults([])
        return
      }

      if (!submissions || submissions.length === 0) {
        setSearchResults([])
        return
      }

      // Get email hashes to fetch consensus results
      const emailHashes = submissions.map(s => s.email_hash).filter(Boolean)

      // Fetch consensus results for these email hashes
      const { data: consensusData } = await supabase
        .from('transparency_log')
        .select('email_hash, payload')
        .eq('event_type', 'CONSENSUS_RESULT')
        .in('email_hash', emailHashes)

      const consensusMap = new Map<string, {
        decision: string
        epoch_id?: number
        rep_score?: number
        rejection_reason?: string
      }>()

      if (consensusData) {
        for (const row of consensusData) {
          if (!row.email_hash || consensusMap.has(row.email_hash)) continue
          const p = row.payload as { final_decision?: string; epoch_id?: number; final_rep_score?: number; primary_rejection_reason?: string }
          consensusMap.set(row.email_hash, {
            decision: p?.final_decision || '',
            epoch_id: p?.epoch_id,
            rep_score: p?.final_rep_score,
            rejection_reason: p?.primary_rejection_reason,
          })
        }
      }

      // Build results
      const results: SearchResult[] = submissions.map(sub => {
        const cons = consensusMap.get(sub.email_hash)
        const payload = sub.payload as { lead_id?: string } | null

        return {
          emailHash: sub.email_hash,
          emailHashShort: sub.email_hash?.substring(0, 16) + '...' || 'N/A',
          minerHotkey: sub.actor_hotkey,
          minerShort: sub.actor_hotkey?.substring(0, 16) + '...' || 'N/A',
          timestamp: sub.ts,
          epochId: cons?.epoch_id ?? null,
          decision: normalizeDecision(cons?.decision),
          repScore: cons?.rep_score ?? null,
          rejectionReason: cons?.rejection_reason || 'N/A',
          leadId: payload?.lead_id ?? null,
        }
      })

      setSearchResults(results)
    } catch (err) {
      console.error('Search error:', err)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Handle enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Load journey events when email hash is selected
  const handleSelectEmailHash = async (emailHash: string) => {
    setSelectedEmailHash(emailHash)
    setLoadingJourney(true)

    try {
      const events = await fetchLeadJourney(emailHash)
      const journeyEvents: JourneyEvent[] = events.map((e) => ({
        timestamp: e.ts,
        eventType: e.event_type,
        actor: e.actor_hotkey ? e.actor_hotkey.substring(0, 20) + '...' : null,
        leadId: e.payload?.lead_id || null,
        finalDecision: e.payload?.final_decision || null,
        finalRepScore: e.payload?.final_rep_score || null,
        rejectionReason: e.payload?.primary_rejection_reason || null,
        teeSequence: e.tee_sequence,
      }))
      setJourneyEvents(journeyEvents)
    } catch (error) {
      console.error('Error fetching journey:', error)
      setJourneyEvents([])
    } finally {
      setLoadingJourney(false)
    }
  }

  const getEventIcon = (eventType: string, decision?: string | null) => {
    if (eventType === 'SUBMISSION_REQUEST') return <Send className="h-4 w-4" />
    if (eventType === 'STORAGE_PROOF') return <Database className="h-4 w-4" />
    if (eventType === 'SUBMISSION') return <FileText className="h-4 w-4" />
    if (eventType === 'CONSENSUS_RESULT') {
      if (decision === 'ACCEPTED') return <CheckCircle className="h-4 w-4 text-green-500" />
      if (decision === 'REJECTED') return <XCircle className="h-4 w-4 text-red-500" />
    }
    return <Clock className="h-4 w-4" />
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
        <Info className="h-4 w-4 flex-shrink-0" />
        <span>Search by Lead ID</span>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder="Enter lead ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="max-w-lg"
        />
        <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()} className="gap-2">
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Search
        </Button>
      </div>

      {/* Results */}
      {isSearching && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Searching...
        </div>
      )}

      {!isSearching && hasSearched && searchResults.length === 0 && (
        <div className="text-center p-8 text-muted-foreground">
          No results found for "{searchQuery}"
        </div>
      )}

      {!isSearching && searchResults.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            Found <strong>{searchResults.length}</strong> results
          </p>

          <Card>
            <CardContent className="pt-4">
              <div className="rounded-md border max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Epoch</TableHead>
                      <TableHead>Miner</TableHead>
                      <TableHead>Lead ID</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Rep Score</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Email Hash</TableHead>
                      <TableHead>Submission Journey</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.map((sub, idx) => (
                      <TableRow
                        key={idx}
                        className="hover:bg-muted/50"
                      >
                        <TableCell>{sub.epochId || 'N/A'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <CopyableText text={sub.minerHotkey} shortText={sub.minerShort} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {sub.leadId ? (
                            <span>{sub.leadId.substring(0, 12)}...</span>
                          ) : (
                            'N/A'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              sub.decision === 'ACCEPTED'
                                ? 'default'
                                : sub.decision === 'REJECTED'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {sub.decision}
                          </Badge>
                        </TableCell>
                        <TableCell>{sub.repScore?.toFixed(3) || 'N/A'}</TableCell>
                        <TableCell className="text-xs max-w-32 truncate">
                          {sub.rejectionReason || 'N/A'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <CopyableText text={sub.emailHash} shortText={sub.emailHashShort} />
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => handleSelectEmailHash(sub.emailHash)}
                            className="text-xs text-primary hover:underline"
                          >
                            View Journey
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Lead Journey Viewer */}
      {selectedEmailHash && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Lead Journey</span>
              <button
                onClick={() => setSelectedEmailHash(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingJourney && (
              <p className="text-sm text-muted-foreground">Loading journey...</p>
            )}

            {!loadingJourney && journeyEvents.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm font-medium font-mono">
                  {selectedEmailHash.substring(0, 40)}...
                </p>
                <ScrollArea className="h-80">
                  <div className="space-y-3">
                    {journeyEvents.map((event, idx) => (
                      <Card
                        key={idx}
                        className={
                          idx === journeyEvents.length - 1
                            ? 'border-primary'
                            : ''
                        }
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-1">
                              {getEventIcon(event.eventType, event.finalDecision)}
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{event.eventType}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(event.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground space-y-0.5">
                                <p>Actor: {event.actor || 'N/A'}</p>
                                <p>Lead ID: {event.leadId || 'N/A'}</p>
                                {event.finalDecision && (
                                  <p>Decision: {event.finalDecision}</p>
                                )}
                                {event.finalRepScore != null && (
                                  <p>Rep Score: {event.finalRepScore}</p>
                                )}
                                {event.rejectionReason && (
                                  <p>Reason: {event.rejectionReason}</p>
                                )}
                                <p>TEE Sequence: {event.teeSequence || 'N/A'}</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {!loadingJourney && journeyEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">No journey events found</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
