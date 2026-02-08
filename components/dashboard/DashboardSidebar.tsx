'use client'

import { LayoutList, Settings, Menu, ChevronLeft, UserCircle, Building2, Users2, UserRoundCog, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import type { LucideIcon } from 'lucide-react'
import { UserGearIcon } from '@/components/icons/UserGear'
import React from 'react'

export type CategoryId =
  | 'special-programs'
  | 'spt-allocations'
  | 'pca-preferences'
  | 'staff-profile'
  | 'ward-config'
  | 'team-configuration'
  | 'account-management'
  | 'sync-publish'
  | null

interface Category {
  id: Exclude<CategoryId, null>
  label: string
  icon: LucideIcon | React.ComponentType<{ className?: string }>
}

interface DashboardSidebarProps {
  activeCategory: CategoryId
  onCategoryChange: (category: CategoryId) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  categories?: Category[]
}

export const DASHBOARD_CATEGORIES: Category[] = [
  {
    id: 'special-programs',
    label: 'Special Programs',
    icon: LayoutList,
  },
  {
    id: 'spt-allocations',
    label: 'SPT Allocations',
    icon: UserGearIcon,
  },
  {
    id: 'pca-preferences',
    label: 'PCA Preferences',
    icon: Settings,
  },
  {
    id: 'staff-profile',
    label: 'Staff Profile',
    icon: UserCircle,
  },
  {
    id: 'ward-config',
    label: 'Ward Config and Bed Stat',
    icon: Building2,
  },
  {
    id: 'team-configuration',
    label: 'Team Configuration',
    icon: Users2,
  },
  {
    id: 'account-management',
    label: 'Account Management',
    icon: UserRoundCog,
  },
  {
    id: 'sync-publish',
    label: 'Sync / Publish',
    icon: ArrowLeftRight,
  },
]

export function DashboardSidebar({
  activeCategory,
  onCategoryChange,
  isCollapsed,
  onToggleCollapse,
  categories = DASHBOARD_CATEGORIES,
}: DashboardSidebarProps) {
  const handleCategoryClick = (categoryId: CategoryId) => {
    // Toggle: if clicking the same category, deselect it
    onCategoryChange(activeCategory === categoryId ? null : categoryId)
  }

  const CategoryItem = ({ category }: { category: Category }) => {
    const isActive = activeCategory === category.id
    const Icon = category.icon

    const buttonElement = (
      <button
        onClick={() => handleCategoryClick(category.id)}
        className={cn(
          'w-full flex items-center transition-colors rounded-md rbip-hover-scale relative hover:z-10',
          isCollapsed ? 'justify-center px-3 py-3' : 'px-4 py-3',
          isActive
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        <Icon className={cn('w-5 h-5 flex-shrink-0', !isCollapsed && 'mr-3')} />
        {!isCollapsed && (
          <span className="text-sm truncate">{category.label}</span>
        )}
      </button>
    )

    if (isCollapsed) {
      return (
        <Tooltip content={category.label} side="right">
          {buttonElement}
        </Tooltip>
      )
    }

    return buttonElement
  }

  return (
    <div
      className={cn(
        'bg-background border-r transition-all duration-200 flex flex-col h-full',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Toggle button */}
      <div className="p-3 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="w-full"
        >
          {isCollapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </Button>
      </div>

      {/* Category list */}
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {categories.map((category) => (
            <CategoryItem key={category.id} category={category} />
          ))}
        </div>
      </nav>
    </div>
  )
}
