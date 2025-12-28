---
name: Dashboard Sidebar Layout
overview: ""
todos: []
---

# Dashboard Sidebar Layout Implementation

## Overview

Transform the Dashboard page from a card-based grid layout to a sidebar layout with categories on the left and content on the right. The sidebar will be collapsible to maximize content space when needed.

## Current Implementation

- **Location**: `app/(dashboard)/dashboard/page.tsx`
- **Current structure**: Card-based grid layout with 4 cards (Special Programs, SPT Allocations, PCA Preferences, PCA Unmet Needs Tracking)
- **Behavior**: Clicking a card expands the panel below the grid
- **Categories**: 

  1. Special Programs (SpecialProgramPanel)
  2. SPT Allocations (SPTAllocationPanel)
  3. PCA Preferences (PCAPreferencePanel)
  4. PCA Unmet Needs Tracking (UnmetPCANeedsCard - will show as a panel in content area)

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Navbar (existing)                                               │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────────────────────────────────────────┐  │
│ │ Sidebar  │ │ Content Area                                 │  │
│ │          │ │                                              │  │
│ │ [≡] Toggle│ │ ┌────────────────────────────────────────┐ │  │
│ │          │ │ │ Header: "Dashboard"                     │ │  │
│ │          │ │ │ (or "Special Programs" when selected)   │ │  │
│ │ • Special│ │ │                                        │ │  │
│ │   Programs│ │ │                                        │ │  │
│ │   (active)│ │ │ [Selected Category Content]            │ │  │
│ │          │ │ │                                        │ │  │
│ │ ○ SPT    │ │ │ (SpecialProgramPanel or                │ │  │
│ │   Alloc. │ │ │  SPTAllocationPanel or                 │ │  │
│ │          │ │ │  PCAPreferencePanel or                 │ │  │
│ │ ○ PCA    │ │ │  UnmetPCANeedsCard)                    │ │  │
│ │   Prefs  │ │ │                                        │ │  │
│ │          │ │ │                                        │ │  │
│ │ ○ PCA    │ │ │                                        │ │  │
│ │   Unmet  │ │ │                                        │ │  │
│ │   Needs  │ │ │                                        │ │  │
│ │          │ │ └────────────────────────────────────────┘ │  │
│ │          │ │                                              │  │
│ │          │ │ (smooth scroll, loading states)             │  │
│ └──────────┘ └──────────────────────────────────────────────┘  │
│                                                                 │
│ When Collapsed:                                                 │
│ ┌────┐ ┌────────────────────────────────────────────────────┐  │
│ │[≡] │ │ Content Area (full width)                          │  │
│ │    │ │                                                     │  │
│ │[📋]│ │                                                     │  │
│ │ ℹ️  │ │ (tooltip shows "Special Programs" on hover)       │  │
│ │    │ │                                                     │  │
│ │[👥]│ │                                                     │  │
│ │    │ │                                                     │  │
│ └────┘ └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Planned Changes

### 1. Create Sidebar Component

**New file**: `components/dashboard/DashboardSidebar.tsx`

Create a new collapsible sidebar component with:

- List of 4 category items with icons:
  - Special Programs (icon: `LayoutList` or `FileText`)
  - SPT Allocations (icon: `Users` or `UserCheck`)
  - PCA Preferences (icon: `Settings` or `Sliders`)
  - PCA Unmet Needs Tracking (icon: `AlertCircle` or `Bell`)
- Active state highlighting for selected category (`bg-primary/10` or `bg-accent`)
- Collapse/expand toggle button at top (hamburger menu icon: `Menu` or chevron `ChevronLeft`/`ChevronRight`)
- When collapsed: Show icons only with tooltip labels on hover (using Tooltip component)
- Smooth transitions for collapse/expand animation (`transition-all duration-200`)
- Fixed height sidebar that scrolls if content overflows
- Width: `w-64` when expanded, `w-16` when collapsed

**Props**:

```tsx
interface DashboardSidebarProps {
  activeCategory: string | null
  onCategoryChange: (category: string | null) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

type CategoryId = 'special-programs' | 'spt-allocations' | 'pca-preferences' | 'pca-unmet-needs' | null
```

**Categories configuration**:

```tsx
const categories = [
  { 
    id: 'special-programs', 
    label: 'Special Programs', 
    icon: LayoutList 
  },
  { 
    id: 'spt-allocations', 
    label: 'SPT Allocations', 
    icon: Users 
  },
  { 
    id: 'pca-preferences', 
    label: 'PCA Preferences', 
    icon: Settings 
  },
  { 
    id: 'pca-unmet-needs', 
    label: 'PCA Unmet Needs Tracking', 
    icon: AlertCircle 
  },
]
```

### 2. Update Dashboard Page Layout

**File**: `app/(dashboard)/dashboard/page.tsx`

- Replace card grid layout with flexbox layout: `flex` with sidebar on left, content on right
- Remove card-based category selection (the grid of cards)
- Add state for sidebar collapse: `const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)`
- Update `PanelType` to include `'pca-unmet-needs'`: `type PanelType = 'special-programs' | 'spt-allocations' | 'pca-preferences' | 'pca-unmet-needs' | null`
- Remove `unmetNeedsExpanded` state (no longer needed)
- **Keep header section** but make it dynamic:
  - Show "Dashboard" when no category is selected
  - Show the selected category name when a category is active (e.g., "Special Programs", "SPT Allocations", etc.)
  - Show subtitle: "Configure system settings and preferences" (or category-specific description)

**Layout structure**:

```tsx
<div className="flex h-[calc(100vh-4rem)]">
  <DashboardSidebar 
    activeCategory={activePanel}
    onCategoryChange={setActivePanel}
    isCollapsed={isSidebarCollapsed}
    onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
  />
  <div className="flex-1 overflow-auto p-6">
    {/* Header section - dynamic based on selection */}
    <div className="mb-6">
      <h1 className="text-3xl font-bold mb-2">
        {activePanel ? getCategoryLabel(activePanel) : 'Dashboard'}
      </h1>
      <p className="text-muted-foreground">
        {activePanel ? getCategoryDescription(activePanel) : 'Configure system settings and preferences'}
      </p>
    </div>
    
    {/* Content area with smooth scroll and loading states */}
    {isLoading && <LoadingSpinner />}
    {!isLoading && activePanel && (
      <div className="smooth-scroll">
        {activePanel === 'special-programs' && <SpecialProgramPanel />}
        {activePanel === 'spt-allocations' && <SPTAllocationPanel />}
        {activePanel === 'pca-preferences' && <PCAPreferencePanel />}
        {activePanel === 'pca-unmet-needs' && <UnmetPCANeedsCard />}
      </div>
    )}
    {!activePanel && (
      <div className="text-center text-muted-foreground py-12">
        Select a category from the sidebar to begin
      </div>
    )}
  </div>
</div>
```

### 3. Handle Category Selection

- When a category is selected in sidebar, show its corresponding panel component in the right content area
- **When sidebar is collapsed**: Show icons only with **tooltip labels** on hover (use Tooltip component from UI library)
- **PCA Unmet Needs Tracking**: Handle as a regular category - when clicked, show `UnmetPCANeedsCard` component in the content area (wrapped appropriately)
- Update type definition to include `'pca-unmet-needs'` as a valid PanelType

### 4. Styling Details

- **Sidebar**: 
  - Expanded: `w-64 bg-background border-r`
  - Collapsed: `w-16`
  - Transition: `transition-all duration-200`
  - Height: `h-full` (full height of container)
  - Overflow: `overflow-y-auto` if content overflows

- **Content area**: 
  - `flex-1` to take remaining space
  - `overflow-auto` for scrolling
  - `p-6` for padding
  - `smooth-scroll` class for smooth scroll behavior (CSS: `scroll-behavior: smooth`)

- **Category items in sidebar**: 
  - Hover states: `hover:bg-accent`
  - Active state: `bg-primary/10 text-primary font-semibold` or `bg-accent`
  - Padding: `px-4 py-3` when expanded, centered when collapsed
  - Icons: Size `w-5 h-5`, margin right when expanded

- **Toggle button**: 
  - Positioned at top of sidebar
  - Icon: `Menu` or `ChevronLeft`/`ChevronRight`
  - Padding and hover states

- **Tooltips** (when collapsed):
  - Use Tooltip component from `@/components/ui/tooltip` (or create if doesn't exist)
  - Show category label on hover over icon
  - Position: `right` side of sidebar

### 5. Enhanced Features

✅ **Smooth scroll behavior**: Add `scroll-behavior: smooth` CSS class or inline style to content area

✅ **Loading states**:

- Add loading state management for each panel component
- Show loading spinner (`Loader2` icon from lucide-react with animation) while data is fetching
- Each panel component should handle its own loading state, or wrap in Suspense if using server components

❌ **Keyboard shortcuts**: Not needed

❌ **Remember collapsed state in localStorage**: Not needed

### 6. Component Updates Needed

**UnmetPCANeedsCard integration**:

- Currently `UnmetPCANeedsCard` might be designed for card-in-card usage
- May need to wrap it in a container or modify to work as a standalone panel in content area
- Check if it needs a wrapper div with proper spacing

## Implementation Steps

1. Check if Tooltip component exists, create if needed (`components/ui/tooltip.tsx`)
2. Create `components/dashboard/DashboardSidebar.tsx` with:

   - Collapsible functionality
   - Category list with icons
   - Active state handling
   - Tooltip support for collapsed state
   - Toggle button

3. Update `app/(dashboard)/dashboard/page.tsx`:

   - Import DashboardSidebar
   - Replace card grid with sidebar + content layout
   - Add sidebar collapse state
   - Update PanelType to include 'pca-unmet-needs'
   - Add dynamic header based on selected category
   - Add smooth scroll class
   - Add loading state management
   - Handle all 4 categories including PCA Unmet Needs

4. Remove old card grid implementation code
5. Test collapse/expand functionality
6. Test tooltips in collapsed state
7. Test category selection and content display
8. Ensure smooth scroll behavior works
9. Test loading states for each panel
10. Style active/hover states appropriately

## Files to Modify/Create

**Create**:

- `components/dashboard/DashboardSidebar.tsx`
- `components/ui/tooltip.tsx` (if doesn't exist)

**Modify**:

- `app/(dashboard)/dashboard/page.tsx` (major restructure)

**Check/Verify**:

- Ensure `UnmetPCANeedsCard` component works as standalone panel (may need wrapper)
- Verify all panel components handle loading states properly

## Category Details

| Category ID | Label | Icon | Component | Description |

|------------|-------|------|-----------|-------------|

| `special-programs` | Special Programs | `LayoutList` | `SpecialProgramPanel` | Manage special program configurations |

| `spt-allocations` | SPT Allocations | `Users` | `SPTAllocationPanel` | Configure SPT allocation settings |

| `pca-preferences` | PCA Preferences | `Settings` | `PCAPreferencePanel` | Manage PCA preference settings |

| `pca-unmet-needs` | PCA Unmet Needs Tracking | `AlertCircle` | `UnmetPCANeedsCard` | Track and view unmet PCA needs |

## Notes

- Header shows category name when selected, "Dashboard" when none selected
- Sidebar collapse affects only width, content area expands accordingly
- All 4 categories work the same way - click to show content in right area
- Tooltips appear on hover when sidebar is collapsed
- Smooth scrolling for better UX in content area
- Loading states prevent content flash during data fetching