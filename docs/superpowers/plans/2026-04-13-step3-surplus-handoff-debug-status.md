# Step 3 Surplus Handoff

## Context

This handoff is for continued investigation of the Step 3 surplus / extra-slot behavior under the ranked V2 flow described in:

- `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
- `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md`

The immediate user complaint at handoff time is:

- `Avg PCA/team` now shows raw values instead of quarter-rounded values, but
- the broader surplus behavior appears less trustworthy than before,
- more teams appear to receive surplus / extra-slot behavior,
- the user no longer trusts the current source of truth for surplus grants.

This note is intentionally evidence-first and should help a fresh agent avoid inheriting bad assumptions from the prior debugging loop.

## User intent that must remain fixed

- `Avg PCA/team` on the dashboard PCA block and Step 3.1 should be the raw Excel-style value, not quarter-rounded.
- Operational Step 3 pending / slot eligibility should still come from the rounded Step 3 target logic, not from raw display values.
- The system must not "bloat" tiny continuous weighted surplus into operational extra slots unless the rounded target actually crosses the quarter-step boundary per spec intent.
- V1 / legacy floating behavior must not be changed.
- V2-only policy should stay inside V2-specific codepaths; avoid moving ranked-slot policy into generic helpers unless it is truly display-only or contract-only.

## What was attempted

### 1. Surplus bootstrap projection work

`lib/features/schedule/step3Bootstrap.ts`

- Added / expanded V2 `Step3BootstrapSummary` surplus metadata:
  - `rawSurplusFte`
  - `idealWeightedSurplusShareByTeam`
  - `redistributableSlackSlots`
  - `realizedSurplusSlotGrantsByTeam`
  - `roundedAdjustedTeamTargets`
  - `surplusAdjustmentDeltaByTeam`
  - `rawAveragePCAPerTeamByTeam`
- Added a fallback branch currently logged as `H5`:
  - "Applied target-first rounded-slack fallback uplift"

### 2. Display wiring work

`app/(dashboard)/schedule/page.tsx`

- Dashboard PCA card `averagePCAPerTeam` was rewired away from Step 2 `calculations.average_pca_per_team`.
- It now shows the raw Step 3 bootstrap `teamTargets` value.

`components/allocation/FloatingPCAConfigDialogV2.tsx`

- Step 3.1 card was instrumented and confirmed to already show raw values.

### 3. Tooltip / tracker provenance work

`lib/features/schedule/step3V2CommittedSelections.ts`
`lib/features/schedule/v2PcaTrackerTooltipModel.ts`
`types/schedule.ts`

- Saved tracker summary stamping was added for:
  - `summary.v2RealizedSurplusSlotGrant`
  - `assignment.v2EnabledBySurplusAdjustedTarget`

## Runtime evidence from the latest debug log

Log file:

- `.cursor/debug-41d21d.log`

Key observations from the most recent run:

### A. Dashboard avg display is now raw

Confirmed by repeated `H11` entries such as:

- `displayedAverage: 1.3454545454545452`
- `rawTeamTarget: 1.3454545454545452`
- `roundedAdjustedTarget: 1.5`

Examples:

- `H11` FO at log lines around `143`, `162`, `173`, `188`, `204`, `244`, `271`, `308`, `326`
- `H11` DRO at log lines around `145`, `164`, `175`, `190`, `206`, `246`, `273`, `310`, `328`

Important caveat:

- The `H11` field `source: "roundedAdjustedTeamTargets"` is now stale / misleading.
- That string was not updated when the display memo switched to raw `teamTargets`.
- Therefore:
  - trust `displayedAverage === rawTeamTarget`
  - do **not** trust the `source` label in `H11`

### B. Step 3.1 avg display is also raw

Confirmed by `H12`:

- FO: `displayedAvg: 1.3454545454545452`, `roundedAdjustedTarget: 1.5`
- DRO: `displayedAvg: 1.9696969696969697`, `roundedAdjustedTarget: 2`

Examples:

- log lines around `210` to `239`

### C. The suspicious part is the fallback surplus grant itself

The strongest evidence for likely misbehavior is this repeated combination:

- `rawSurplusFte: 0`
- `redistributableSlackSlots: 0`
- `roundedModelSlackSlots: 2`
- followed by `H5` fallback applying uplift anyway

Examples:

- `H1` lines around `158`, `169`, `184`, `201`
- `H5` lines around `159`, `170`, `185`, `202`

Representative values:

- `availableFloatingSlots: 14`
- `totalRawPending: 3.5`
- `rawSurplusFte: 0`
- `redistributableSlackSlots: 0`
- `ceilNeededSlots: 18`
- `roundedNeededSlots: 12`
- `roundedModelSlackSlots: 2`

Then `H5` says:

- `adjustedTargetFO: 1.5`
- `deltaFO: 0.25`
- `pendingFO: 0.5`

This means:

- the current code is still creating a realized FO uplift from a state where strict surplus is zero and strict redistributable slack is zero,
- purely because the rounded-model slack diagnostic says there are 2 slack slots.

This is exactly the area most likely responsible for the user's "more teams now look surplus / extra" complaint.

### D. Page-level pending and card-level pending disagree across surfaces

`H3` shows page-level pending like:

- FO `pendingFO: 0.345`
- DRO `pendingDRO: 0.97`

But later, in Step 3 entry / V2 ranked state after fallback:

- FO `pendingFO: 0.5`
- DRO `pendingDRO: 1`

And `H7` on `PCABlock` shows:

- FO `pendingPcaFte: 0.25` in one run
- then FO `pendingPcaFte: 0` in another run

This suggests the UI is crossing multiple states:

- raw bootstrap state
- fallback-adjusted bootstrap state
- open / closed Step 3 dialog state
- post-allocation tracker state

The next agent should map each surface to its intended contract before trusting any visual symptom.

### E. Surplus tooltip provenance is still not proving the "extra slot" story

`H4` repeatedly shows:

- `grantSlots: 0`
- `v2EnabledBySurplusAdjustedTarget: false`

even when the fallback branch appears to uplift FO.

Examples:

- lines around `250` to `259`
- lines around `277` to `288`
- lines around `314` to `325`
- lines around `350` to `361`

This means the visual / tracker provenance still does not line up cleanly with the current surplus uplift behavior.

## What is actually confirmed vs unconfirmed

### Confirmed

- Dashboard `Avg PCA/team` is now raw, not rounded.
- Step 3.1 `Avg PCA/team` is raw.
- The `H11 source` string is stale and should not be treated as evidence anymore.
- The current fallback branch can uplift FO to `1.5` / `pending 0.5` even when:
  - `rawSurplusFte = 0`
  - `redistributableSlackSlots = 0`

### Not confirmed

- That fallback behavior is actually correct per spec.
- The current number of teams/slots marked as surplus-enabled is correct.
- Tooltip provenance is aligned with the actual surplus grants.
- The "extra" tags on slots are trustworthy indicators of surplus-driven allocation.

## Likely investigation drift / why this got messy

The debugging loop mixed together 3 separate concerns:

1. Surplus target computation in bootstrap
2. Raw-vs-rounded display semantics
3. Tracker / tooltip provenance of surplus-enabled rows

The raw display issue is relatively isolated and mostly solved.
The bigger risk is that display fixes happened while the fallback surplus logic remained active, so the UI may now be showing raw targets correctly while the underlying extra-slot behavior is still drifting.

## Strong recommendation for the next agent

Start by treating the fallback branch in `step3Bootstrap.ts` as the prime suspect.

### Suspect area

`lib/features/schedule/step3Bootstrap.ts`

Look for the logic logged as:

- `H5`
- "Applied target-first rounded-slack fallback uplift"

Reason:

- It currently converts diagnostic rounded slack into operational uplift even when strict surplus and strict redistributable slack are zero.
- That is the single clearest runtime sign of potential contract drift.

## Suggested next steps for the new agent

### 1. Separate surfaces by contract

Before changing code, explicitly map:

- dashboard `Avg PCA/team` display source
- Step 3.1 `Avg PCA/team` display source
- `pendingPCAFTEForStep3Dialog`
- V2 bootstrap `pendingByTeam`
- tracker provenance fields
- UI "extra" tag source

### 2. Re-verify the intended surplus rule against spec, not the current code

For the specific case from the logs:

- `rawSurplusFte = 0`
- `redistributableSlackSlots = 0`
- `roundedModelSlackSlots = 2`

Decide whether the spec truly allows any operational uplift at all.

If the answer is "no", then `H5` fallback likely needs removal or major narrowing.

### 3. Audit whether "extra" tags are tied to surplus, generic extra coverage, or both

The user is seeing more "extra" / surplus-looking slots, but current logs do not establish whether that label is:

- actual surplus-target-enabled allocation,
- generic Step 3.4 extra coverage,
- or another tracker summary / display label.

This must be disentangled before any more policy changes.

### 4. Do not trust the current `H11 source` string

It is stale after the raw display patch.
If you keep instrumentation, update the label first.

## Relevant files touched during this debugging cycle

These are the main files to inspect first:

- `lib/features/schedule/step3Bootstrap.ts`
- `app/(dashboard)/schedule/page.tsx`
- `components/allocation/FloatingPCAConfigDialogV2.tsx`
- `lib/features/schedule/step3V2CommittedSelections.ts`
- `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- `components/allocation/PCABlock.tsx`
- `types/schedule.ts`

There are many other modified files in the repo, but the above are the ones most directly involved in this debugging thread.

## Regressions added during this thread

These tests were added during the investigation and may or may not represent the final desired behavior:

- `tests/regression/f106-step3-bootstrap-surplus-projection-prefers-raw-surplus-before-rounding.test.ts`
- `tests/regression/f107-step3-bootstrap-surplus-projection-caps-ideal-distribution-by-executable-slack.test.ts`
- `tests/regression/f108-step3-bootstrap-surplus-projection-preserves-global-slot-sum-after-rounding.test.ts`
- `tests/regression/f109-step2-step31-share-surplus-aware-rounded-target-contract.test.ts`
- `tests/regression/f110-step34-tooltip-surplus-adjusted-target-provenance-contract.test.ts`
- `tests/regression/f111-step3-bootstrap-rounded-slack-fallback-uplifts-crossing-team-without-bloating-neighbor.test.ts`
- `tests/regression/f112-step34-v2-saved-tracker-surplus-provenance-contract.test.ts`
- `tests/regression/f113-step3-dashboard-avg-pca-uses-raw-bootstrap-target.test.ts`

If the next agent concludes the fallback itself is wrong, `f111` is the first test that should be re-questioned.

## Bottom line

The debugging session did successfully prove one thing:

- raw avg display is now correct on both dashboard and Step 3.1

But it did **not** restore confidence in the actual surplus grant policy.

The most likely source of current over-allocation / over-tagging confusion is the fallback uplift path in `step3Bootstrap.ts`, especially when it fires with:

- zero strict surplus
- zero strict redistributable slack
- positive rounded-model slack

That should be the first place the next agent audits.

## Ready-to-use prompt for next agent

Use this prompt for the next agent:

```md
You are taking over a messy debugging session in the RBIP duty list app for Step 3 surplus / extra-slot behavior in ranked V2 floating allocation.

Read this handoff first:

- `docs/superpowers/plans/2026-04-13-step3-surplus-handoff-debug-status.md`

Primary spec context:

- `docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`
- `docs/superpowers/specs/2026-04-13-v2-step3-surplus-targets-and-ranked-swap-optimization-design.md`

Critical instruction from the user:

- Do NOT use TDD for this debugging task.
- Do NOT start by writing more tests.
- Previous attempts added tests that passed while the real bug and trust issues remained.
- Prioritize runtime evidence, log analysis, contract tracing, and source-of-truth mapping before adding or changing tests.

What is known:

- Dashboard `Avg PCA/team` now shows raw values.
- Step 3.1 `Avg PCA/team` also shows raw values.
- The deeper surplus behavior is still not trusted.
- The strongest suspect is the fallback logic in `lib/features/schedule/step3Bootstrap.ts` logged as `H5`, where uplift is being applied even when:
  - `rawSurplusFte = 0`
  - `redistributableSlackSlots = 0`
  - but `roundedModelSlackSlots > 0`

Your job:

1. Reconstruct the real source of truth for:
   - raw display avg
   - rounded operational target
   - pending FTE
   - surplus grant
   - "extra" slot tags
   - tooltip provenance
2. Audit whether the `H5` fallback should exist at all under the spec.
3. Determine why more teams/slots now appear surplus-enabled or extra-tagged.
4. Treat existing tests as potentially incomplete or misleading; do not assume they prove behavior is correct.
5. Prefer minimal, evidence-backed fixes only after you can explain the full data flow.

Useful files to inspect first:

- `lib/features/schedule/step3Bootstrap.ts`
- `app/(dashboard)/schedule/page.tsx`
- `components/allocation/FloatingPCAConfigDialogV2.tsx`
- `components/allocation/PCABlock.tsx`
- `lib/features/schedule/step3V2CommittedSelections.ts`
- `lib/features/schedule/v2PcaTrackerTooltipModel.ts`
- `types/schedule.ts`

Important caution:

- The `H11` debug log field `source: "roundedAdjustedTeamTargets"` is stale and misleading.
- Trust the actual logged values (`displayedAverage`, `rawTeamTarget`, `roundedAdjustedTarget`), not that stale string label.

Please begin with runtime evidence and contract mapping, not with new tests.
```
