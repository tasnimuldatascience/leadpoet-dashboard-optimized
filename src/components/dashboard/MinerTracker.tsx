'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/shared/MetricCard'
import { EpochStackedChart, RejectionBarChart } from '@/components/charts'
import {
  FileText,
  CheckCircle,
  XCircle,
  Percent,
  Activity,
  Coins,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react'
import type {
  MinerStats,
  MetagraphData,
} from '@/lib/types'

interface MinerTrackerProps {
  minerStats: MinerStats[]
  activeMiners: string[]
  metagraph: MetagraphData | null
  externalSelectedMiner?: string | null
  onMinerSelected?: () => void
}

export function MinerTracker({
  minerStats,
  activeMiners,
  metagraph,
  externalSelectedMiner,
  onMinerSelected,
}: MinerTrackerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMiner, setSelectedMiner] = useState<string | null>(null)

  // Handle external miner selection (from clicking hotkey in Overview)
  useEffect(() => {
    if (externalSelectedMiner) {
      setSelectedMiner(externalSelectedMiner)
      // Notify parent that we've consumed the external selection
      if (onMinerSelected) {
        onMinerSelected()
      }
    }
  }, [externalSelectedMiner, onMinerSelected])

  // Auto-select the top miner (by accepted count) on initial load
  useEffect(() => {
    if (!selectedMiner && !externalSelectedMiner && minerStats.length > 0) {
      // Sort by accepted to find the top miner
      const topMiner = [...minerStats].sort((a, b) => b.accepted - a.accepted)[0]
      if (topMiner) {
        setSelectedMiner(topMiner.minerHotkey)
      }
    }
  }, [minerStats, selectedMiner, externalSelectedMiner])

  // Filter miners by search term (hotkey only - UID handled on Enter)
  const filteredMiners = useMemo(() => {
    if (!searchTerm) return activeMiners
    const term = searchTerm.toLowerCase().trim()
    return activeMiners.filter((hotkey) => {
      // Check if hotkey matches
      if (hotkey.toLowerCase().includes(term)) return true
      return false
    })
  }, [activeMiners, searchTerm])

  // Handle search submission (Enter key)
  const handleSearchSubmit = () => {
    if (!searchTerm.trim()) return
    const term = searchTerm.trim()

    // Check if search term is a number (UID search)
    if (/^\d+$/.test(term)) {
      const uidNum = parseInt(term, 10)
      const matchedStats = minerStats.find((s) => s.uid === uidNum)
      if (matchedStats) {
        setSelectedMiner(matchedStats.minerHotkey)
        setSearchTerm('')
        return
      }
    }

    // Otherwise select first filtered miner (hotkey search)
    if (filteredMiners.length > 0) {
      setSelectedMiner(filteredMiners[0])
      setSearchTerm('')
    }
  }

  // Get selected miner's stats (includes pre-calculated epoch performance and rejection reasons)
  const selectedMinerStats = useMemo(() => {
    if (!selectedMiner) return null
    return minerStats.find((m) => m.minerHotkey === selectedMiner) || null
  }, [minerStats, selectedMiner])

  // Get epoch stats for chart (transform to format expected by EpochStackedChart)
  const minerEpochStats = useMemo(() => {
    if (!selectedMinerStats) return []
    return selectedMinerStats.epochPerformance.map(ep => ({
      epochId: ep.epochId,
      total: ep.accepted + ep.rejected,
      accepted: ep.accepted,
      rejected: ep.rejected,
      acceptanceRate: ep.acceptanceRate,
      avgRepScore: 0, // Not tracked per-epoch per-miner
    }))
  }, [selectedMinerStats])

  // Get rejection reasons for chart
  const minerRejectionReasons = useMemo(() => {
    if (!selectedMinerStats) return []
    return selectedMinerStats.rejectionReasons
  }, [selectedMinerStats])

  // Calculate incentive share for selected miner
  const incentiveShare = useMemo(() => {
    if (!selectedMinerStats) return 0
    const totalAccepted = minerStats.reduce((sum, m) => sum + m.accepted, 0)
    return totalAccepted > 0 ? (selectedMinerStats.accepted / totalAccepted) * 100 : 0
  }, [minerStats, selectedMinerStats])

  return (
    <div className="space-y-6">
      {/* Miner Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            Search by hotkey or UID
          </label>
          <Input
            placeholder="Enter hotkey or UID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearchSubmit()
              }
            }}
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            Select Miner
          </label>
          <Select
            value={selectedMiner || ''}
            onValueChange={(value) => {
              setSelectedMiner(value)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a miner..." />
            </SelectTrigger>
            <SelectContent>
              {filteredMiners.map((miner) => {
                const stats = minerStats.find((s) => s.minerHotkey === miner)
                const uid = stats?.uid
                return (
                  <SelectItem key={miner} value={miner}>
                    {uid !== null && uid !== undefined ? `[${uid}] ` : ''}{miner.substring(0, 24)}...
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedMiner && selectedMinerStats && (
        <>
          {/* Miner Info */}
          <Card className="bg-blue-500/10 border-blue-500/30">
            <CardContent className="pt-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Badge variant="outline" className="text-lg px-3 py-1">
                  UID: {selectedMinerStats.uid ?? 'N/A'}
                </Badge>
                <span className="font-mono text-sm text-muted-foreground">
                  {selectedMiner}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <div>
            <h3 className="text-sm font-medium mb-3">Performance Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Total Submissions"
                value={selectedMinerStats.total}
                icon={FileText}
                color="blue"
              />
              <MetricCard
                title="Accepted"
                value={selectedMinerStats.accepted}
                icon={CheckCircle}
                color="green"
              />
              <MetricCard
                title="Rejected"
                value={selectedMinerStats.rejected}
                icon={XCircle}
                color="red"
              />
              <MetricCard
                title="Acceptance Rate"
                value={`${selectedMinerStats.acceptanceRate}%`}
                icon={Percent}
                color="purple"
              />
            </div>
          </div>

          {/* Incentive Metrics */}
          <div>
            <h3 className="text-sm font-medium mb-3">Incentive & Reputation</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MetricCard
                title="Avg Rep Score"
                value={selectedMinerStats.avgRepScore.toFixed(3)}
                icon={Activity}
                color="cyan"
              />
              <MetricCard
                title="Lead Share"
                value={`${incentiveShare.toFixed(2)}%`}
                icon={TrendingUp}
                color="blue"
              />
              <MetricCard
                title="Incentive"
                value={`${selectedMinerStats.btIncentive.toFixed(4)}%`}
                icon={Coins}
                color="green"
              />
              <MetricCard
                title="Emission"
                value={`${(selectedMinerStats.btEmission || 0).toFixed(4)} ρ`}
                icon={Zap}
                color="purple"
              />
              <MetricCard
                title="Stake"
                value={`${selectedMinerStats.stake.toFixed(2)} τ`}
                icon={Wallet}
                color="amber"
              />
            </div>
          </div>

          {/* Epoch Performance Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Epoch-wide Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <EpochStackedChart data={minerEpochStats} maxEpochs={20} />
            </CardContent>
          </Card>


          {/* Rejection Reasons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rejection Reasons</CardTitle>
            </CardHeader>
            <CardContent>
              <RejectionBarChart data={minerRejectionReasons} maxItems={10} />
            </CardContent>
          </Card>
        </>
      )}

      {!selectedMiner && (
        <Card className="py-12">
          <CardContent className="text-center text-muted-foreground">
            Select a miner to view their performance details
          </CardContent>
        </Card>
      )}
    </div>
  )
}
