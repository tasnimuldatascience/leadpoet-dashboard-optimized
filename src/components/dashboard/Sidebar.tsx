'use client'

import Image from 'next/image'
import { Separator } from '@/components/ui/separator'
import { X, Server } from 'lucide-react'

interface SidebarProps {
  lastRefresh: Date | null
  isLoading?: boolean
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({
  lastRefresh,
  isLoading = false,
  isOpen = true,
  onClose,
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-card border-r min-h-screen p-4 space-y-6
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
      {/* Header with close button for mobile */}
      <div className="flex items-center justify-between">
        <a href="https://leadpoet.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Image
            src="/icon.png"
            alt="LeadPoet Logo"
            width={40}
            height={40}
            className="rounded-md"
          />
          <div>
            <h1 className="font-bold text-lg">Leadpoet</h1>
            <p className="text-xs text-muted-foreground">Real-time Dashboard for Bittensor Subnet 71</p>
          </div>
        </a>
        {/* Close button - only visible on mobile */}
        <button
          onClick={onClose}
          className="lg:hidden p-2 hover:bg-muted rounded-md"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <Separator />

      {/* Auto-refresh Status */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Server className="h-4 w-4 text-green-500" />
          <span className="text-muted-foreground">Auto-refresh: 5 min</span>
        </div>
        {lastRefresh && (
          <div className="text-xs text-muted-foreground">
            Last update: {lastRefresh.toLocaleTimeString()} EST
          </div>
        )}
      </div>

      </div>
    </>
  )
}
