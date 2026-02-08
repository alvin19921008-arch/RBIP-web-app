# Schedule Page Refactor Plan (High ROI Only)

## Goals
- Reduce cold-start bundle and render work
- Remove redundant state/effects
- Keep functionality identical

## Scope
- Focus on `app/(dashboard)/schedule/page.tsx`
- Skip “move-only” refactors without measurable ROI

## High-ROI Candidates

### 1) Remove legacy "showBackButton"
- Status: Done
- Delete state + effect + props usage
- Rationale: feature removed; fewer renders and simpler props

### 2) Eliminate URL-sync useEffects
- Status: Done (top-down split divider fixed; splitRatio derived from URL)
- Replace `splitDirection`, `splitRatio`, `isSplitSwapped` state with derived values
- Remove 3 `useEffect` syncs
- Rationale: reduces render cycles and state churn

### 3) Collapse resolver state → ref-only or hook
- Status: Done (resolver refs only, no state sync effects)
- Replace resolver state + effect sync with ref-only resolver storage
- Rationale: reduces re-renders and repetitive patterns

### 4) Shared Supabase fetch helpers
- Extract shared “snapshot diff inputs” fetch (with back-compat column fallback)
- Rationale: de-dup logic and reduce chance of inconsistent behavior
- Only do if it reduces duplicated calls in runtime

### 5) Lazy-load heavy UI clusters not on critical path
- Audit popovers/panels that are always in tree; defer via dynamic import or conditional render
- Rationale: reduce initial JS execution and memory

## Explicitly Out of Scope (Low ROI)
- Pure file splitting without performance benefit
- Style-only refactors unless they enable reuse or reduce runtime logic

## Test Plan
- Manual: navigation to schedule page, step flows 1–5, copy wizard, dialogs
- Verify: no regression in allocations, snapshots, or diagnostics popovers
