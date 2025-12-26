'use client'

import { useEffect, useState } from 'react'
import { Team } from '@/types/staff'

const TEAMS: Team[] = ['FO', 'SMM', 'SFM', 'CPPC', 'MC', 'GMC', 'NSM', 'DRO']

interface UnmetNeedsData {
  teamCounts: Record<Team, number>
  teamLastDates: Record<Team, string>
}

export function UnmetPCANeedsCard() {
  const [data, setData] = useState<UnmetNeedsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUnmetNeeds()
  }, [])

  const fetchUnmetNeeds = async () => {
    try {
      const response = await fetch('/api/unmet-pca-needs')
      if (response.ok) {
        const result = await response.json()
        setData(result)
      } else {
        console.error('Failed to fetch unmet PCA needs')
      }
    } catch (error) {
      console.error('Error fetching unmet PCA needs:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (count: number) => {
    if (count === 0) return 'text-green-600'
    if (count <= 2) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getStatusBgColor = (count: number) => {
    if (count === 0) return 'bg-green-50'
    if (count <= 2) return 'bg-yellow-50'
    return 'bg-red-50'
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Number of days (past 5 working days) where teams needed PCA but did not receive floating PCA assignments
      </p>
      
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : data ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {TEAMS.map((team) => {
              const count = data.teamCounts[team] || 0
              const lastDate = data.teamLastDates[team] || ''
              
              return (
                <div
                  key={team}
                  className={`p-3 rounded-lg border ${getStatusBgColor(count)}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">{team}</span>
                    <span className={`text-lg font-bold ${getStatusColor(count)}`}>
                      {count}
                    </span>
                  </div>
                  {lastDate && (
                    <p className="text-xs text-muted-foreground">
                      Last: {formatDate(lastDate)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          
          <div className="mt-4 flex items-center space-x-4 text-xs text-muted-foreground">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded bg-green-50 border border-green-200"></div>
              <span>0 days</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200"></div>
              <span>1-2 days</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 rounded bg-red-50 border border-red-200"></div>
              <span>3+ days</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No data available</p>
      )}
    </div>
  )
}
