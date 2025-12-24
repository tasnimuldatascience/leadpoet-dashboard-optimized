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
  Wallet,
  Zap,
  Download,
  Search,
} from 'lucide-react'
import type { MinerStats } from '@/lib/types'

interface MinerTrackerProps {
  minerStats: MinerStats[]
  activeMiners: string[]
  externalSelectedMiner?: string | null
  onMinerSelected?: () => void
}

export function MinerTracker({
  minerStats,
  activeMiners,
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
  // Sort by UID ascending for dropdown display
  const filteredMiners = useMemo(() => {
    let miners = activeMiners
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim()
      miners = activeMiners.filter((hotkey) => {
        // Check if hotkey matches
        if (hotkey.toLowerCase().includes(term)) return true
        return false
      })
    }
    // Sort by UID ascending
    return [...miners].sort((a, b) => {
      const uidA = minerStats.find(s => s.minerHotkey === a)?.uid ?? Infinity
      const uidB = minerStats.find(s => s.minerHotkey === b)?.uid ?? Infinity
      return uidA - uidB
    })
  }, [activeMiners, searchTerm, minerStats])

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

  // Download CSV function for epoch performance
  const downloadEpochPerformanceCSV = () => {
    if (!selectedMinerStats || minerEpochStats.length === 0) return
    const headers = ['Epoch ID', 'Total', 'Accepted', 'Rejected', 'Acceptance Rate%']
    const rows = minerEpochStats.map(ep => [
      ep.epochId,
      ep.total,
      ep.accepted,
      ep.rejected,
      ep.acceptanceRate
    ])
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `miner_${selectedMinerStats.uid ?? 'unknown'}_epoch_performance.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Download CSV function for miner rejection reasons
  const downloadMinerRejectionReasonsCSV = () => {
    if (!selectedMinerStats || minerRejectionReasons.length === 0) return
    const headers = ['Reason', 'Count', 'Percentage']
    const rows = minerRejectionReasons.map(r => [
      `"${r.reason.replace(/"/g, '""')}"`,
      r.count,
      r.percentage.toFixed(2) + '%'
    ])
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `miner_${selectedMinerStats.uid ?? 'unknown'}_rejection_reasons.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Miner Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            Search by Hotkey or UID
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="Enter Hotkey or UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearchSubmit()
                }
              }}
              className="flex-1"
            />
            <button
              onClick={handleSearchSubmit}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-sm"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
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
              <SelectValue placeholder="Select a Hotkey..." />
            </SelectTrigger>
            <SelectContent>
              {filteredMiners.map((miner) => {
                const stats = minerStats.find((s) => s.minerHotkey === miner)
                const uid = stats?.uid
                return (
                  <SelectItem key={miner} value={miner}>
                    {uid !== null && uid !== undefined ? `[${uid}] ` : ''}{miner}
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
          <Card className="bg-blue-500/10 border-blue-500/30 overflow-hidden">
            <CardContent className="pt-4 px-3 md:px-6">
              <div className="flex items-center justify-center gap-2 md:gap-4 flex-wrap">
                <Badge variant="outline" className="text-base md:text-lg px-2 md:px-3 py-1 flex-shrink-0">
                  UID: {selectedMinerStats.uid ?? 'N/A'}
                </Badge>
                <span className="font-mono text-xs md:text-sm text-muted-foreground break-all text-center">
                  {selectedMiner}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <div>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Avg Rep Score"
                value={selectedMinerStats.avgRepScore.toFixed(3)}
                icon={Activity}
                color="cyan"
              />
              <MetricCard
                title="Incentive"
                value={`${selectedMinerStats.btIncentive.toFixed(4)}%`}
                icon={Coins}
                color="green"
              />
              <MetricCard
                title="Emission per Epoch"
                value={`${(selectedMinerStats.btEmission || 0).toFixed(4)} ㄴ`}
                icon={Zap}
                color="purple"
              />
              <MetricCard
                title="Alpha Stake"
                value={`${selectedMinerStats.stake.toFixed(2)} ㄴ`}
                icon={Wallet}
                color="amber"
              />
            </div>
          </div>

          {/* Epoch Performance Chart */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base md:text-lg">Epoch Performance</CardTitle>
                <button
                  onClick={downloadEpochPerformanceCSV}
                  className="flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md"
                >
                  <Download className="h-3 w-3" />
                  <span className="hidden sm:inline">CSV</span>
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
              <EpochStackedChart data={minerEpochStats} maxEpochs={20} />
            </CardContent>
          </Card>

          {/* Rejection Reasons */}
          <Card>
            <CardHeader className="p-4 md:p-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base md:text-lg">Rejection Reasons</CardTitle>
                <button
                  onClick={downloadMinerRejectionReasonsCSV}
                  className="flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md"
                >
                  <Download className="h-3 w-3" />
                  <span className="hidden sm:inline">CSV</span>
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
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
