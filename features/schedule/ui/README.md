# Schedule UI (`features/schedule/ui`)

React-only schedule workflow UI: shells under `sections/`, step bodies under `steps/`, dialogs, hooks. Domain logic stays in `lib/features/schedule/` (see workspace architecture rules).

## Tailwind v4 scan

Tailwind picks up classes from this tree via **`app/globals.css`**:

```css
@source "../features/**/*.{ts,tsx}";
```

That line is part of Phase 1 / Phase 2f so utilities used only under `features/` are included in the build.

## Design tokens & UI constraints

- **Step / app tokens:** [`../../../styles/rbip-design-tokens.css`](../../../styles/rbip-design-tokens.css)
- **RBIP UI patterns (tooltips, borders, Step 3 colors):** [`../../../.cursor/rules/design-elements-commonality.mdc`](../../../.cursor/rules/design-elements-commonality.mdc)

Prefer semantic shadcn-style variables (`bg-popover`, `border-border`, `text-muted-foreground`, etc.) so components behave in both light and dark themes.

## Phase 2f note (this slice)

Token alignment touched **developer diagnostics / timing tooltips** in `sections/SchedulePageHeaderRightActions.tsx` only. **Step 3.2 / 3.3** wizard UI (`components/allocation/*` dialogs) was not edited here.
