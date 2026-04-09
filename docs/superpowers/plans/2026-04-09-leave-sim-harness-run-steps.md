# Leave Sim “Run steps” harness — implementation plan

> **For agentic workers:** Implement task-by-task; verify with lint + `npm run test:smoke`.

**Goal:** Reorganize Developer Leave Simulation → Run steps for clear Automatic/Interactive mini-step controls, Step 3 engine V2 (default) vs V1, Step 2.3 support, V2 without balanced/standard fork, single-column layout with invariants under pipeline.

**Architecture:** `DevLeaveSimPanel` owns UX + persistence; `page.tsx` implements `runStep2Auto` / `runStep3` / `runStep3V2Auto` with expanded args. V2 auto path always uses `standard` for `allocateFloatingPCA_v2`. V1 headless run passes recomputed team order + latest pending into `runStep3FloatingPCA`.

**Tech stack:** Next.js, React, existing schedule controller.

---

### Task 1: Panel types + helpers

- [x] Add `LeaveSimStepMode`, `buildStep3HarnessTeamOrder`, `StepModeRow` UI helper in `DevLeaveSimPanel.tsx`.

### Task 2: Props + state + persistence migration

- [x] Extend props: `showSharedTherapistStep`, `pendingPCAFTEPerTeam`, `visibleTeams`; `runStep2Auto` adds `autoStep23`; `runStep3` accepts optional `userTeamOrder` / `userAdjustedPendingFTE`; `runStep3V2Auto` drops `mode` from harness API (page uses `'standard'` only).

### Task 3: Run tab layout

- [x] Single column: Step 2 section (2.0→2.3), Step 3 section (engine, tie-break, V1-only allocation style, V2 buffer + 3.2/3.3, helper + Open Step 3 wizard), actions + invariant card.

### Task 4: Schedule page wiring

- [x] After Step 2 while-loop, run 2.3 when interactive; pass new props; move tie-break clear to start of step3 phase; V2 auto: always standard; extend `runStep3` passthrough.

### Task 5: Verify

- [ ] `npm run lint` / `npm run test:smoke` as available.
