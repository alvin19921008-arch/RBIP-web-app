/**
 * RBIP design tokens — **class names** and CSS variable names for shared UI.
 *
 * Source of truth for Step 3.2 warm theme: `styles/rbip-design-tokens.css`
 * (imported from `app/globals.css`). Keep this file aligned when renaming utilities.
 *
 * Step map (wizard):
 * - **3.1 / 3.4**: informational blue — continue using Tailwind `sky-*` in those sections.
 * - **3.2**: warm amber / orange — use `rbipStep32` classes below.
 * - **3.3**: adjacent lane/detail — muted teal / light-green (`rbipStep33`, 沈實 edges in hue).
 * - **3.4**: final review detail shell — use `rbipStep34` + `Step3V2LaneDetailShell` theme `final`.
 */

/** CSS custom properties (for inline `style` or rare arbitrary Tailwind) */
export const rbipStep32CssVars = {
  shellBorder: '--rbip-step32-shell-border',
  shellBg: '--rbip-step32-shell-bg',
  reservedAccent: '--rbip-step32-reserved-accent',
} as const

/**
 * Utility classes from `styles/rbip-design-tokens.css` (`@layer components`).
 * Prefer these over ad-hoc `sky-*` / `amber-*` in Step 3.2 components.
 */
export const rbipStep32 = {
  detailShell: 'rbip-step32-detail-shell',
  detailBeak: 'rbip-step32-detail-beak',
  detailHeading: 'rbip-step32-detail-heading',
  contextLabel: 'rbip-step32-context-label',
  statusPill: 'rbip-step32-status-pill',
  combinedSurface: 'rbip-step32-combined-surface',
  combinedGrid: 'rbip-step32-combined-grid',
  outcomeCard: 'rbip-step32-outcome-card',
  suggestedBadge: 'rbip-step32-suggested-badge',
  reservedRow: 'rbip-step32-reserved-row',
  savePanel: 'rbip-step32-save-panel',
  /** Same utility as {@link rbipStep32.sectionHeading} — kept for readable call sites. */
  sectionHeading: 'rbip-step32-section-heading',
  saveHeading: 'rbip-step32-section-heading',
  choiceSelected: 'rbip-step32-choice-selected',
  choiceIdleHover: 'rbip-step32-choice-idle-hover',
  titleHighlight: 'rbip-step32-title-highlight',
  titleHighlightPreferred: 'rbip-step32-title-highlight--preferred',
  titleHighlightFloor: 'rbip-step32-title-highlight--floor',
  laneChipMatched: 'rbip-step32-lane-chip--matched',
  laneChipSelected: 'rbip-step32-lane-chip-selected',
  focusable: 'rbip-step32-focusable',
} as const

/** Step 3.3 adjacent-slot review — teal / light-green, 沈實 borders (see `styles/rbip-design-tokens.css`). */
export const rbipStep33 = {
  detailShell: 'rbip-step33-detail-shell',
  detailBeak: 'rbip-step33-detail-beak',
  /** Near-white inner plate inside the mint shell (luminance stratification vs 3.2 combined). */
  combinedSurface: 'rbip-step33-combined-surface',
  laneChipActive: 'rbip-step33-lane-chip--active',
  laneChipSelected: 'rbip-step33-lane-chip-selected',
  sectionDivider: 'rbip-step33-section-divider',
  metricBadge: 'rbip-step33-metric-badge',
  calloutAccent: 'rbip-step33-callout-accent',
  optionRowSelected: 'rbip-step33-option-row--selected',
  iconCheck: 'rbip-step33-icon-check',
  /** Toggle “selected” decision control (parallel to `rbipStep32.choiceSelected`). */
  choiceSelected: 'rbip-step33-choice-selected',
  choiceIdleHover: 'rbip-step33-choice-idle-hover',
  focusable: 'rbip-step33-focusable',
} as const

/** Step 3.4 final ranked review — blue-tinted detail shell + beak (see `styles/rbip-design-tokens.css`). */
export const rbipStep34 = {
  detailShell: 'rbip-step34-detail-shell',
  detailBeak: 'rbip-step34-detail-beak',
  /** Team lane card: tracker-aligned provenance dots (3.2 → 3.3 → surplus → extra). */
  laneDotCluster: 'rbip-step34-lane-dot-cluster',
  laneDot: 'rbip-step34-lane-dot',
  laneDotLg: 'rbip-step34-lane-dot--lg',
  laneDotStep32: 'rbip-step34-lane-dot--step32',
  laneDotStep33: 'rbip-step34-lane-dot--step33',
  laneDotSurplus: 'rbip-step34-lane-dot--surplus',
  laneDotExtra: 'rbip-step34-lane-dot--extra',
} as const
