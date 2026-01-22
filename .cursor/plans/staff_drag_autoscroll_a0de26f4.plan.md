---
name: Staff drag autoscroll
overview: Add auto-scroll on staff drag so the schedule auto-navigates to the relevant block (Therapist Allocation / PCA Allocation) and continues edge auto-scroll while dragging.
todos:
  - id: add-block-refs
    content: Add refs/anchors for Therapist Allocation and PCA Allocation blocks in schedule page.
    status: completed
  - id: snap-scroll-drag-start
    content: On drag start, scrollIntoView({block:'center'}) to the appropriate block based on staff rank/step.
    status: completed
  - id: edge-autoscroll-drag-move
    content: Implement near-edge window auto-scroll during drag using translated rect + RAF throttling.
    status: completed
  - id: cleanup-drag-end
    content: Cancel RAF and reset auto-scroll state on drag end/cancel paths.
    status: completed
isProject: false
---

## Goal

When a user starts dragging a staff card from Staff Pool (including Buffer Staff Pool), the schedule page should:

- **Snap-scroll** to the relevant block and center it in the viewport:
- Therapist ranks (SPT/APPT/RPT) → **Block 1: Therapist Allocation**
- PCA → **Block 2: PCA Allocation**
- While dragging, provide **edge auto-scroll** (top/bottom) so the user can continue dragging without manually scrolling.

## Where to implement

- Schedule drag lifecycle is already centralized in `[app/(dashboard)/schedule/page.tsx](/Users/alvin/Desktop/RBIP%20web%20app/app/\\\(dashboard)`/schedule/page.tsx) using `DndContext`:
- `onDragStart={handleDragStart}` (`handleDragStart` starts at ~L7053)
- `onDragMove={handleDragMove}` (`handleDragMove` starts at ~L7273)
- Staff cards provide the draggable payload via `useDraggable({ data: { staff, allocation, team } })` in `[components/allocation/StaffCard.tsx](/Users/alvin/Desktop/RBIP%20web%20app/components/allocation/StaffCard.tsx)` so `active.data.current.staff.rank` is available at runtime.

## Implementation steps

1. **Add block anchors (refs)** in `schedule/page.tsx`

- Create `useRef<HTMLDivElement|null>` for:
- Therapist Allocation block wrapper (`Block 1`)
- PCA Allocation block wrapper (`Block 2`)
- Attach those refs to the existing wrappers near the section headers:
- The `div` wrapping the `TherapistBlock` grid (currently under `"Therapist Allocation"`)
- The `div` wrapping the `PCABlock` grid (currently under `"PCA Allocation"`)

1. **Snap-scroll on drag start (center_align)**

- In `handleDragStart`:
- Determine staff rank from `active.data.current.staff?.rank` (preferred) with fallback to current `staffMember.rank`.
- Gate by step:
- Therapist: only if `currentStep === 'therapist-pca'`
- PCA: only if `currentStep === 'floating-pca'` and `staffMember.floating === true`
- Call `ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
- This applies equally to regular staff and buffer staff, since buffer entries are still `Staff` with `rank`.

1. **Edge auto-scroll while dragging (near_edge)**

- In `handleDragMove`:
- If a drag is active (therapist or PCA), compute the dragged card’s translated rect:
- `active.rect.current.translated ?? active.rect.current.initial`
- If the rect is near viewport edges, scroll the window:
- top threshold (e.g. 120px) → `window.scrollBy({ top: -delta })`
- bottom threshold (e.g. 120px) → `window.scrollBy({ top: +delta })`
- Use `requestAnimationFrame` + a `useRef<number|null>` guard to avoid excessive calls.

1. **Stop scrolling cleanly**

- In `handleDragEnd` and the “cancel drag” paths, cancel any pending RAF and reset refs so scrolling stops immediately.

1. **UX polish (Tailwind/CSS optional)**

- If needed, add `scroll-mt-*` or `scroll-py-*` to the block wrappers to improve perceived positioning with sticky headers, while still using `block:'center'`.

## Test plan

- In Step 2, start dragging a therapist from Staff Pool:
- Page snap-scrolls to Therapist Allocation and centers it.
- Drag near top/bottom edges continues scrolling.
- In Step 3, start dragging a floating PCA from Staff Pool:
- Page snap-scrolls to PCA Allocation and centers it.
- Edge scrolling works.
- Repeat with buffer therapist / buffer floating PCA from Buffer Staff Pool.
- Ensure no auto-scroll happens in the wrong step (drag is allowed to snap back as before).

