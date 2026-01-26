# RBIP Duty List - Quick Context

> **Purpose**: Minimal context file for new chat agents. Essential rules are in `.cursor/rules/`. For detailed history, see `CHANGELOG.md`.

## Project Overview

Hospital therapist and PCA allocation system with automated daily duty assignments and manual override capabilities.

**Tech Stack**: Next.js 16.1+ (App Router), React 19.2+, TypeScript, Supabase (PostgreSQL), Tailwind CSS 4.1+

## Core Concepts

- **5-Step Allocation Workflow**: Leave/FTE → Therapist/Non-Floating PCA → Floating PCA → Bed Relieving → Review
- **Three-Layer State**: Saved (DB) → Algorithm (generated) → Override (user edits)
- **staffOverrides**: Single source of truth for all staff modifications
- **Per-Date Isolation**: Each schedule date has isolated snapshot to prevent cross-date contamination

## Critical Files

- `app/(dashboard)/schedule/page.tsx` - Main schedule page
- `lib/algorithms/pcaAllocation.ts` - PCA allocation algorithm
- `lib/algorithms/therapistAllocation.ts` - Therapist allocation algorithm
- `lib/features/schedule/controller/useScheduleController.ts` - Domain state controller
- `lib/db/types.ts` - Database type conversion utilities (CRITICAL)

## Essential Rules (See `.cursor/rules/`)

- **Database Type Safety**: Always use `lib/db/types.ts` utilities (TypeScript types are WIDER than DB enums)
- **staffOverrides**: All staff modifications must update `staffOverrides`
- **average_pca_per_team**: Calculated in Step 1, persists as target through Steps 2-4 (never recalculate)
- **Snapshot Envelope**: Always wrap snapshots before saving, validate on load

## Where to Find More

- **Essential Patterns**: `.cursor/rules/ARCHITECTURE_ESSENTIALS.mdc` (auto-loaded)
- **Database Types**: `.cursor/rules/database-types.mdc` (auto-loaded)
- **TypeScript Patterns**: `.cursor/rules/typescript-strict-patterns.mdc` (auto-loaded)
- **Design Elements**: `.cursor/rules/design-elements-commonality.mdc` (auto-loaded)
- **Workflow Data**: `.cursor/rules/stepwise-workflow-data.mdc` (auto-loaded)
- **Detailed History**: `CHANGELOG.md` (read when needed for historical context)
