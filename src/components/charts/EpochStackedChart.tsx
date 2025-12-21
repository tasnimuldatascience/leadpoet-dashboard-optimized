'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'

// Simplified type for chart data - only needs what the chart renders
interface EpochChartData {
  epochId: number
  accepted: number
  rejected: number
}

interface EpochStackedChartProps {
  data: EpochChartData[]
  maxEpochs?: number
}

export function EpochStackedChart({ data, maxEpochs = 20 }: EpochStackedChartProps) {
  // Take the most recent epochs and reverse for chronological display
  const chartData = data.slice(0, maxEpochs).reverse()

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] md:h-[350px] text-muted-foreground">
        No epoch data available
      </div>
    )
  }

  return (
    <div className="h-[250px] md:h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 20, left: 10, bottom: 5 }}
        >
          <XAxis
            dataKey="epochId"
            stroke="#94a3b8"
            fontSize={10}
            tickFormatter={(value) => `E${value}`}
            interval="preserveStartEnd"
          />
          <YAxis stroke="#94a3b8" fontSize={10} width={40} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f1f5f9',
            }}
            itemStyle={{ color: '#f1f5f9' }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(value, name) => [(value ?? 0).toLocaleString(), name]}
            labelFormatter={(label) => `Epoch ${label}`}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
          />
          <Bar
            dataKey="accepted"
            name="Accepted"
            stackId="a"
            fill="#22c55e"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="rejected"
            name="Rejected"
            stackId="a"
            fill="#ef4444"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
