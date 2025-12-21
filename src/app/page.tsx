// Server Component - data is fetched on the server for instant page loads
import { getInitialPageData } from '@/lib/server-data'
import { DashboardClient } from '@/components/dashboard'

export default async function Dashboard() {
  // Fetch aggregated data server-side (no raw data caching!)
  const { dashboardData, metagraph } = await getInitialPageData()

  // Pass pre-fetched data to client component
  return (
    <DashboardClient
      initialData={dashboardData}
      metagraph={metagraph}
    />
  )
}
