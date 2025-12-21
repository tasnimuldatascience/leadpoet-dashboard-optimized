'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InventoryGrowthChart, DailyLeadsChart } from '@/components/charts'
import type { LeadInventoryData } from '@/lib/types'

interface LeadInventoryProps {
  data: LeadInventoryData[]
}

export function LeadInventory({ data }: LeadInventoryProps) {
  if (data.length === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center text-muted-foreground">
          No lead inventory data available
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Inventory Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Valid Lead Inventory Growth</CardTitle>
          <p className="text-sm text-muted-foreground">
            Total sum of valid leads in database over time
          </p>
        </CardHeader>
        <CardContent>
          <InventoryGrowthChart data={data} />
        </CardContent>
      </Card>

      {/* Daily Leads Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily Valid Lead Additions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Number of valid leads entering inventory each day
          </p>
        </CardHeader>
        <CardContent>
          <DailyLeadsChart data={data} />
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Inventory Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">New Valid Leads</TableHead>
                  <TableHead className="text-right">Total Inventory</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data].reverse().map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="text-right">
                      {row.newValidLeads.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.totalValidInventory.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
