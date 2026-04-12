# Changelog 2

## Step 3 V2 (ranked slots) — 2026-04

**Revamped V2:** Ranked-slot Step 3.4 uses a continuity-friendly draft pass plus a **bounded, deterministic audit/repair** pass; tracker distinguishes draft / repair / extra-coverage; `selected_only` preserves base ranked slots while biasing PCA choice from Step 3.2/3.3. The V2 wizard preview materializes committed Step 3.2/3.3 picks into allocations **before** Step 3.4 so save state matches the sheet.

For objectives, defect kinds, and diagnostics, see **`docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`**.

**2026-04-10:** PCA tracker V1 freeze + V2 tooltip/model; `preStep34RoundedPendingFte`; duplicate-floating semantics aligned to Step 3.4; f76/f78/f79; V2 scarcity summary/dialog where changed. **Checkpoint:** f73–f82 green; extraction spec/plan (`2026-04-10-floating-pca-v1-v2-extraction-*`) added — rollback point before allocator split.

**2026-04-10 (later):** Floating PCA **V1/V2 code split**: legacy vs ranked engines in `floatingPcaLegacy/` and `floatingPcaV2/`; shared contracts + invalid-slot helper; inline `allocatePCA()` floating phase extracted; V2 provenance + ranked tracker summary derivations isolated; thin `pcaAllocationFloating` façade. Behavior-named exports unchanged.

**2026-04-11:** V2 fairness-floor (`repairAudit`/`repairMoves`, f84/f85); Step 3 ownership/fulfillment helper + V2 tooltip line (`step3FloatingFulfillmentSemantics`, f86/f87); `extraCoverageRuntime` marks extra only on true Step 3 surplus (f88).

**2026-04-12:** *(2nd draft — revamped V2 Step 3.2 preferred review.)* Status-first lane with stacked lane→detail; beak on the outer detail shell; wide `xl` two-column layout for steps 1–2 with horizontal outcome strip and clipped peek when there are ≥2 cards; Radix popover for “How to read statuses”; outcome rows as a compact CSS grid (rank · interval · PCA). Preview/copy in `lib/features/schedule/step32V2/`; UI in `components/allocation/step32V2/`; Step 3.2 commits via `committedStep3Assignments` with **legacy** preferences so Step 3.4 keeps the full preferred set; `FloatingPCAConfigDialogV2` + f65/f89–f92.
