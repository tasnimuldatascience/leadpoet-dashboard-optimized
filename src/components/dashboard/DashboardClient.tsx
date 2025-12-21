'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Overview,
  MinerTracker,
  EpochAnalysis,
  LeadInventory,
  SubmissionTracker,
  Export,
  Sidebar,
} from '@/components/dashboard'
import type {
  TimeFilterOption,
  MetagraphData,
} from '@/lib/types'
import { TIME_FILTER_HOURS } from '@/lib/types'
import type { AllDashboardData } from '@/lib/db-aggregation'
import Image from 'next/image'
import {
  LayoutDashboard,
  Pickaxe,
  Layers,
  Package,
  Search,
  Download,
  RefreshCw,
  Menu,
} from 'lucide-react'

const REFRESH_INTERVAL = 300 // 5 minutes in seconds

// Dashboard data from API
interface DashboardData extends AllDashboardData {
  hours: number
  fetchedAt: number
}

// Props received from Server Component
export interface DashboardClientProps {
  initialData: DashboardData
  metagraph: MetagraphData | null
}

export function DashboardClient({ initialData, metagraph: initialMetagraph }: DashboardClientProps) {
  // Dashboard data state (aggregated results only - no raw data!)
  const [dashboardData, setDashboardData] = useState<DashboardData>(initialData)
  const [metagraph, setMetagraph] = useState<MetagraphData | null>(initialMetagraph)

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date(initialData.fetchedAt))
  const [timeFilter, setTimeFilter] = useState<TimeFilterOption>('all')
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedMinerHotkey, setSelectedMinerHotkey] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Ref to track if component is mounted
  const isMounted = useRef(true)

  // Fetch dashboard data with time filter
  const fetchDashboardData = useCallback(async (hours: number) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/dashboard?hours=${hours}`)

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }

      const data: DashboardData = await response.json()

      if (isMounted.current) {
        setDashboardData(data)
        setLastRefresh(new Date(data.fetchedAt))
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data')
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false)
      }
    }
  }, [])

  // Refresh metagraph
  const refreshMetagraph = useCallback(async () => {
    try {
      const response = await fetch('/api/metagraph')
      if (response.ok && isMounted.current) {
        const data = await response.json()
        setMetagraph(data)
      }
    } catch (err) {
      console.error('Failed to refresh metagraph:', err)
    }
  }, [])

  // Handle time filter change - fetch new data
  const handleTimeFilterChange = useCallback((option: TimeFilterOption, hours: number) => {
    setTimeFilter(option)
    fetchDashboardData(hours)
  }, [fetchDashboardData])

  // Set up cleanup and background refresh
  useEffect(() => {
    isMounted.current = true

    // Background refresh every 5 minutes
    const interval = setInterval(() => {
      const hours = TIME_FILTER_HOURS[timeFilter]
      fetchDashboardData(hours)
      refreshMetagraph()
    }, REFRESH_INTERVAL * 1000)

    return () => {
      isMounted.current = false
      clearInterval(interval)
    }
  }, [timeFilter, fetchDashboardData, refreshMetagraph])

  // Transform DB types to UI types
  const metrics = {
    total: dashboardData.summary.total_submissions,
    accepted: dashboardData.summary.total_accepted,
    rejected: dashboardData.summary.total_rejected,
    pending: dashboardData.summary.total_pending,
    acceptanceRate: dashboardData.summary.acceptance_rate,
    avgRepScore: dashboardData.summary.avg_rep_score,
    activeMiners: dashboardData.summary.unique_miners,
  }

  // Transform miner stats with metagraph data
  const minerStats = dashboardData.minerStats.map(m => {
    const uid = metagraph?.hotkeyToUid[m.miner_hotkey] ?? null
    const btIncentive = metagraph?.incentives[m.miner_hotkey] ?? 0
    const btEmission = metagraph?.emissions[m.miner_hotkey] ?? 0
    const stake = metagraph?.stakes[m.miner_hotkey] ?? 0

    return {
      uid,
      minerHotkey: m.miner_hotkey,
      minerShort: m.miner_hotkey.substring(0, 20) + '...',
      total: m.total_submissions,
      accepted: m.accepted,
      rejected: m.rejected,
      pending: m.pending,
      acceptanceRate: m.acceptance_rate,
      avgRepScore: m.avg_rep_score,
      btIncentive: btIncentive * 100,
      btEmission,
      stake: Math.round(stake * 100) / 100,
      // Epoch-specific stats (pre-calculated)
      last20Accepted: m.last20_accepted,
      last20Rejected: m.last20_rejected,
      currentAccepted: m.current_accepted,
      currentRejected: m.current_rejected,
      // Per-miner detailed stats for MinerTracker
      epochPerformance: (m.epoch_performance || []).map(ep => ({
        epochId: ep.epoch_id,
        accepted: ep.accepted,
        rejected: ep.rejected,
        acceptanceRate: ep.acceptance_rate,
      })),
      rejectionReasons: (m.rejection_reasons || []).map(rr => ({
        reason: rr.reason,
        count: rr.count,
        percentage: rr.percentage,
      })),
    }
  }).filter(m => !metagraph || Object.keys(metagraph.hotkeyToUid).length === 0 || m.uid !== null) // Only filter by metagraph if data available

  // Transform epoch stats (includes per-epoch miner stats)
  const epochStats = dashboardData.epochStats.map(e => ({
    epochId: e.epoch_id,
    total: e.total_leads,
    accepted: e.accepted,
    rejected: e.rejected,
    acceptanceRate: e.acceptance_rate,
    avgRepScore: e.avg_rep_score,
    miners: e.miners || [],
  }))

  // Transform lead inventory
  const inventoryData = dashboardData.leadInventory.map(l => ({
    date: l.date,
    totalValidInventory: l.cumulative_leads,
    newValidLeads: l.new_leads,
  }))

  // Transform rejection reasons
  const rejectionReasons = dashboardData.rejectionReasons

  // Transform incentive data with metagraph
  const incentiveData = dashboardData.incentiveData
    .map(i => {
      const uid = metagraph?.hotkeyToUid[i.miner_hotkey] ?? null
      const btIncentive = metagraph?.incentives[i.miner_hotkey] ?? 0

      return {
        minerShort: i.miner_hotkey.substring(0, 20) + '...',
        minerHotkey: i.miner_hotkey,
        uid,
        acceptedLeads: i.accepted_leads,
        leadSharePct: i.lead_share_pct,
        btIncentivePct: btIncentive * 100,
      }
    })
    .filter(i => !metagraph || Object.keys(metagraph.hotkeyToUid).length === 0 || i.uid !== null)

  // Get active miners from miner stats
  const activeMiners = minerStats.map(m => m.minerHotkey)

  // Get active miner count from metagraph (non-validators), fallback to minerStats count
  const activeMinerCount = metagraph && Object.keys(metagraph.isValidator).length > 0
    ? Object.entries(metagraph.isValidator).filter(([, isVal]) => !isVal).length
    : minerStats.length

  // Handler for clicking on a miner hotkey in the leaderboard
  const handleMinerClick = (minerHotkey: string) => {
    setSelectedMinerHotkey(minerHotkey)
    setActiveTab('miner-tracker')
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        lastRefresh={lastRefresh}
        timeFilter={timeFilter}
        onTimeFilterChange={handleTimeFilterChange}
        isLoading={isLoading}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-6 overflow-auto lg:ml-0">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <div className="flex items-center gap-2 md:gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-muted rounded-md -ml-2"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <a href="https://leadpoet.com" target="_blank" rel="noopener noreferrer" className="hidden sm:block hover:opacity-80 transition-opacity">
              <Image
                src="/icon.png"
                alt="LeadPoet Logo"
                width={32}
                height={32}
                className="rounded"
              />
            </a>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">
              Real-time Dashboard for Bittensor Subnet 71 (Leadpoet)
            </h1>
            {isLoading && (
              <Badge variant="secondary" className="gap-1 animate-pulse hidden sm:flex">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Loading...
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 ml-0 lg:ml-0">
            {timeFilter === 'all'
              ? 'Showing all available data'
              : `Showing last ${timeFilter === '7d' ? '7 days' : timeFilter}`}{' '}
            | <strong>{metrics.total.toLocaleString()}</strong> submissions
            | Avg Rep: <strong>{metrics.avgRepScore.toFixed(4)}</strong>
            {lastRefresh && (
              <span className="ml-2 text-xs hidden sm:inline">
                (Updated: {lastRefresh.toLocaleTimeString()})
              </span>
            )}
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 md:space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-6 gap-1">
              <TabsTrigger value="overview" className="gap-1 md:gap-2 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">
                <LayoutDashboard className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Overview</span>
                <span className="sm:hidden">Home</span>
              </TabsTrigger>
              <TabsTrigger value="lead-inventory" className="gap-1 md:gap-2 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">
                <Package className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Lead Inventory</span>
                <span className="sm:hidden">Leads</span>
              </TabsTrigger>
              <TabsTrigger value="miner-tracker" className="gap-1 md:gap-2 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">
                <Pickaxe className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Miner Tracker</span>
                <span className="sm:hidden">Miners</span>
              </TabsTrigger>
              <TabsTrigger value="epoch-analysis" className="gap-1 md:gap-2 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">
                <Layers className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Epoch Analysis</span>
                <span className="sm:hidden">Epochs</span>
              </TabsTrigger>
              <TabsTrigger value="submission-tracker" className="gap-1 md:gap-2 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">
                <Search className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Submissions</span>
                <span className="sm:hidden">Subs</span>
              </TabsTrigger>
              <TabsTrigger value="export" className="gap-1 md:gap-2 px-2 md:px-4 text-xs md:text-sm whitespace-nowrap">
                <Download className="h-3 w-3 md:h-4 md:w-4" />
                Export
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <Overview
              metrics={metrics}
              minerStats={minerStats}
              epochStats={epochStats}
              rejectionReasons={rejectionReasons}
              activeMinerCount={activeMinerCount}
              onMinerClick={handleMinerClick}
            />
          </TabsContent>

          <TabsContent value="lead-inventory">
            <LeadInventory data={inventoryData} />
          </TabsContent>

          <TabsContent value="miner-tracker">
            <MinerTracker
              minerStats={minerStats}
              activeMiners={activeMiners}
              metagraph={metagraph}
              externalSelectedMiner={selectedMinerHotkey}
              onMinerSelected={() => setSelectedMinerHotkey(null)}
            />
          </TabsContent>

          <TabsContent value="epoch-analysis">
            <EpochAnalysis
              epochStats={epochStats}
              metagraph={metagraph}
              onMinerClick={handleMinerClick}
            />
          </TabsContent>

          <TabsContent value="submission-tracker">
            <SubmissionTracker />
          </TabsContent>

          <TabsContent value="export">
            <Export
              minerStats={minerStats}
              epochStats={epochStats}
              incentiveData={incentiveData}
              inventoryData={inventoryData}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
