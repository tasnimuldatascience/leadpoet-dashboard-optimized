'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { MetricCard } from '@/components/shared/MetricCard'
import {
  DecisionPieChart,
  RejectionBarChart,
  EpochStackedChart,
  MinerIncentiveChart,
} from '@/components/charts'
import {
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
} from 'lucide-react'
import type {
  DashboardMetrics,
  MinerStats,
  EpochStats,
  RejectionReason,
} from '@/lib/types'

type SortKey = 'uid' | 'minerHotkey' | 'total' | 'accepted' | 'rejected' | 'pending' | 'acceptanceRate' | 'avgRepScore' | 'last20Accepted' | 'last20Rejected' | 'currentAccepted' | 'currentRejected' | 'btIncentive'
type SortDirection = 'asc' | 'desc'

interface OverviewProps {
  metrics: DashboardMetrics
  minerStats: MinerStats[]
  epochStats: EpochStats[]
  rejectionReasons: RejectionReason[]
  activeMinerCount: number
  onMinerClick?: (minerHotkey: string) => void
}

export function Overview({
  metrics,
  minerStats,
  epochStats,
  rejectionReasons,
  activeMinerCount,
  onMinerClick,
}: OverviewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('accepted')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [taoPrice, setTaoPrice] = useState<number | null>(null)
  const [copiedHotkey, setCopiedHotkey] = useState<string | null>(null)

  // Fetch TAO price from CoinGecko
  useEffect(() => {
    const fetchTaoPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd')
        const data = await res.json()
        if (data?.bittensor?.usd) {
          setTaoPrice(data.bittensor.usd)
        }
      } catch (err) {
        console.error('Failed to fetch TAO price:', err)
      }
    }
    fetchTaoPrice()
  }, [])

  // Get the current epoch ID for display
  const currentEpochId = useMemo(() => {
    const sortedEpochs = [...epochStats].sort((a, b) => b.epochId - a.epochId)
    return sortedEpochs[0]?.epochId ?? null
  }, [epochStats])

  // Leaderboard data uses pre-calculated epoch stats from minerStats
  const leaderboardData = minerStats

  // Calculate totals
  const totals = useMemo(() => {
    const totalStats = leaderboardData.reduce(
      (acc, miner) => ({
        total: acc.total + miner.total,
        accepted: acc.accepted + miner.accepted,
        rejected: acc.rejected + miner.rejected,
        pending: acc.pending + miner.pending,
        last20Accepted: acc.last20Accepted + miner.last20Accepted,
        last20Rejected: acc.last20Rejected + miner.last20Rejected,
        currentAccepted: acc.currentAccepted + miner.currentAccepted,
        currentRejected: acc.currentRejected + miner.currentRejected,
        btIncentive: acc.btIncentive + miner.btIncentive,
        avgRepScoreSum: acc.avgRepScoreSum + (miner.avgRepScore * miner.total),
        totalForAvg: acc.totalForAvg + miner.total,
      }),
      { total: 0, accepted: 0, rejected: 0, pending: 0, last20Accepted: 0, last20Rejected: 0, currentAccepted: 0, currentRejected: 0, btIncentive: 0, avgRepScoreSum: 0, totalForAvg: 0 }
    )

    const decided = totalStats.accepted + totalStats.rejected
    const rate = decided > 0 ? (totalStats.accepted / decided) * 100 : 0
    const avgScore = totalStats.totalForAvg > 0 ? totalStats.avgRepScoreSum / totalStats.totalForAvg : 0

    return {
      ...totalStats,
      rate: Math.round(rate * 10) / 10,
      avgScore: Math.round(avgScore * 1000) / 1000,
    }
  }, [leaderboardData])

  const sortedLeaderboardData = useMemo(() => {
    const sorted = [...leaderboardData].sort((a, b) => {
      let aValue: number | string | null = null
      let bValue: number | string | null = null

      switch (sortKey) {
        case 'uid':
          aValue = a.uid ?? -1
          bValue = b.uid ?? -1
          break
        case 'minerHotkey':
          aValue = a.minerHotkey
          bValue = b.minerHotkey
          break
        default:
          aValue = a[sortKey as keyof MinerStats] as number
          bValue = b[sortKey as keyof MinerStats] as number
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return sortDirection === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number)
    })
    return sorted
  }, [leaderboardData, sortKey, sortDirection])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />
  }

  const handleHotkeyClick = (minerHotkey: string) => {
    if (onMinerClick) {
      onMinerClick(minerHotkey)
    }
  }

  const handleCopyHotkey = async (hotkey: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(hotkey)
      setCopiedHotkey(hotkey)
      setTimeout(() => setCopiedHotkey(null), 2000)
    } catch (err) {
      console.error('Failed to copy hotkey:', err)
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-4">
        <MetricCard
          title="Total Submissions"
          value={metrics.total.toLocaleString()}
          icon={FileText}
          color="blue"
        />
        <MetricCard
          title="Accepted"
          value={metrics.accepted.toLocaleString()}
          icon={CheckCircle}
          color="green"
        />
        <MetricCard
          title="Rejected"
          value={metrics.rejected.toLocaleString()}
          icon={XCircle}
          color="red"
        />
        <MetricCard
          title="Pending"
          value={metrics.pending.toLocaleString()}
          icon={Clock}
          color="amber"
        />
        <MetricCard
          title="Avg Rep Score"
          value={metrics.avgRepScore.toFixed(4)}
          icon={Activity}
          color="purple"
        />
        <MetricCard
          title="Active Miners"
          value={activeMinerCount}
          icon={Users}
          color="cyan"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Decision Distribution</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
            <DecisionPieChart
              accepted={metrics.accepted}
              rejected={metrics.rejected}
              pending={metrics.pending}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Top Rejection Reasons</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
            <RejectionBarChart data={rejectionReasons} maxItems={10} />
          </CardContent>
        </Card>
      </div>

      {/* Epoch Performance */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Epoch-wide Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          <EpochStackedChart data={epochStats} maxEpochs={20} />
        </CardContent>
      </Card>

      {/* Incentive Distribution */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Miner Incentive Distribution</CardTitle>
          <p className="text-xs md:text-sm text-muted-foreground">
            Bittensor on-chain incentive ranked by miner performance
          </p>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          <MinerIncentiveChart minerStats={minerStats} />
        </CardContent>
      </Card>

      {/* Miner Leaderboard */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Miner Leaderboard</CardTitle>
          <p className="text-xs text-muted-foreground md:hidden">
            ← Scroll horizontally to see all columns →
          </p>
        </CardHeader>
        <CardContent className="p-2 md:p-6 pt-0 md:pt-0">
          <div className="rounded-md border max-h-[500px] md:max-h-[600px] overflow-auto relative">
            <Table className="text-xs md:text-sm">
              <TableHeader className="sticky top-0 z-20 bg-slate-900 shadow-sm">
                <TableRow>
                  <TableHead
                    className="w-12 md:w-16 cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('uid')}
                  >
                    <div className="flex items-center whitespace-nowrap">
                      UID
                      <SortIcon columnKey="uid" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 select-none min-w-[120px] md:min-w-[180px] px-2 md:px-4"
                    onClick={() => handleSort('minerHotkey')}
                  >
                    <div className="flex items-center whitespace-nowrap">
                      Hotkey
                      <SortIcon columnKey="minerHotkey" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('total')}
                  >
                    <div className="flex items-center justify-end whitespace-nowrap">
                      Total
                      <SortIcon columnKey="total" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('accepted')}
                  >
                    <div className="flex items-center justify-end whitespace-nowrap">
                      <span className="hidden sm:inline">Accepted</span>
                      <span className="sm:hidden">Acc</span>
                      <SortIcon columnKey="accepted" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('rejected')}
                  >
                    <div className="flex items-center justify-end whitespace-nowrap">
                      <span className="hidden sm:inline">Rejected</span>
                      <span className="sm:hidden">Rej</span>
                      <SortIcon columnKey="rejected" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('pending')}
                  >
                    <div className="flex items-center justify-end whitespace-nowrap">
                      <span className="hidden sm:inline">Pending</span>
                      <span className="sm:hidden">Pend</span>
                      <SortIcon columnKey="pending" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('acceptanceRate')}
                  >
                    <div className="flex items-center justify-end whitespace-nowrap">
                      Rate%
                      <SortIcon columnKey="acceptanceRate" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('avgRepScore')}
                  >
                    <div className="flex items-center justify-end whitespace-nowrap">
                      <span className="hidden sm:inline">Avg Score</span>
                      <span className="sm:hidden">Score</span>
                      <SortIcon columnKey="avgRepScore" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('last20Accepted')}
                  >
                    <div className="flex items-center justify-center whitespace-nowrap">
                      <span className="hidden sm:inline">Last 20</span>
                      <span className="sm:hidden">L20</span>
                      <SortIcon columnKey="last20Accepted" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('currentAccepted')}
                  >
                    <div className="flex items-center justify-center whitespace-nowrap">
                      <span className="hidden sm:inline">Current</span>
                      <span className="sm:hidden">Cur</span>
                      <SortIcon columnKey="currentAccepted" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50 select-none px-2 md:px-4"
                    onClick={() => handleSort('btIncentive')}
                  >
                    <div className="flex items-center justify-end whitespace-nowrap">
                      <span className="hidden sm:inline">BT Incentive</span>
                      <span className="sm:hidden">BT%</span>
                      <SortIcon columnKey="btIncentive" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLeaderboardData.map((miner) => (
                  <TableRow key={miner.minerHotkey}>
                    <TableCell className="font-mono px-2 md:px-4">
                      {miner.uid ?? 'N/A'}
                    </TableCell>
                    <TableCell className="font-mono text-xs px-2 md:px-4">
                      <div className="flex items-center gap-1">
                        <span
                          className="text-blue-400 hover:text-blue-300 cursor-pointer hover:underline truncate max-w-[80px] md:max-w-none"
                          onClick={() => handleHotkeyClick(miner.minerHotkey)}
                          title={`Click to view in Miner Tracker: ${miner.minerHotkey}`}
                        >
                          {miner.minerShort}
                        </span>
                        <button
                          onClick={(e) => handleCopyHotkey(miner.minerHotkey, e)}
                          className="p-1 hover:bg-muted rounded opacity-50 hover:opacity-100 flex-shrink-0"
                          title="Copy hotkey"
                        >
                          {copiedHotkey === miner.minerHotkey ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-2 md:px-4">{miner.total}</TableCell>
                    <TableCell className="text-right text-green-500 px-2 md:px-4">
                      {miner.accepted}
                    </TableCell>
                    <TableCell className="text-right text-red-500 px-2 md:px-4">
                      {miner.rejected}
                    </TableCell>
                    <TableCell className="text-right text-amber-500 px-2 md:px-4">
                      {miner.pending}
                    </TableCell>
                    <TableCell className="text-right px-2 md:px-4">
                      {miner.acceptanceRate}%
                    </TableCell>
                    <TableCell className="text-right px-2 md:px-4">
                      {miner.avgRepScore.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-center px-2 md:px-4 whitespace-nowrap">
                      <span className="text-green-500">{miner.last20Accepted}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-red-500">{miner.last20Rejected}</span>
                    </TableCell>
                    <TableCell className="text-center px-2 md:px-4 whitespace-nowrap">
                      <span className="text-green-500">{miner.currentAccepted}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-red-500">{miner.currentRejected}</span>
                    </TableCell>
                    <TableCell className="text-right px-2 md:px-4 whitespace-nowrap">
                      {miner.btIncentive.toFixed(4)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="sticky bottom-0 z-20 bg-slate-800 font-semibold shadow-[0_-2px_4px_rgba(0,0,0,0.3)]">
                <TableRow>
                  <TableCell className="font-bold px-2 md:px-4">Total</TableCell>
                  <TableCell className="text-muted-foreground px-2 md:px-4">-</TableCell>
                  <TableCell className="text-right px-2 md:px-4">{totals.total}</TableCell>
                  <TableCell className="text-right text-green-500 px-2 md:px-4">
                    {totals.accepted}
                  </TableCell>
                  <TableCell className="text-right text-red-500 px-2 md:px-4">
                    {totals.rejected}
                  </TableCell>
                  <TableCell className="text-right text-amber-500 px-2 md:px-4">
                    {totals.pending}
                  </TableCell>
                  <TableCell className="text-right px-2 md:px-4">
                    {totals.rate}%
                  </TableCell>
                  <TableCell className="text-right px-2 md:px-4">
                    {totals.avgScore.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-center px-2 md:px-4 whitespace-nowrap">
                    <span className="text-green-500">{totals.last20Accepted}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-red-500">{totals.last20Rejected}</span>
                  </TableCell>
                  <TableCell className="text-center px-2 md:px-4 whitespace-nowrap">
                    <span className="text-green-500">{totals.currentAccepted}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-red-500">{totals.currentRejected}</span>
                  </TableCell>
                  <TableCell className="text-right px-2 md:px-4 whitespace-nowrap">
                    <div>{totals.btIncentive.toFixed(4)}%</div>
                    {taoPrice && (
                      <div className="text-xs text-muted-foreground">
                        ≈ ${((totals.btIncentive / 100) * taoPrice).toFixed(2)}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
