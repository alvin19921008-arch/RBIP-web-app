# Changelog 2

## Step 3 V2 (ranked slots) — 2026-04

**Revamped V2:** Ranked-slot Step 3.4 uses a continuity-friendly draft pass plus a **bounded, deterministic audit/repair** pass; tracker distinguishes draft / repair / extra-coverage; `selected_only` preserves base ranked slots while biasing PCA choice from Step 3.2/3.3. The V2 wizard preview materializes committed Step 3.2/3.3 picks into allocations **before** Step 3.4 so save state matches the sheet.

For objectives, defect kinds, and diagnostics, see **`docs/superpowers/specs/2026-04-06-floating-pca-ranked-slot-allocation-design.md`**.

**2026-04-10:** PCA tracker V1 freeze + V2 tooltip/model; `preStep34RoundedPendingFte`; duplicate-floating semantics aligned to Step 3.4; f76/f78/f79; V2 scarcity summary/dialog where changed. **Checkpoint:** f73–f82 green; extraction spec/plan (`2026-04-10-floating-pca-v1-v2-extraction-*`) added — rollback point before allocator split.

**2026-04-10 (later):** Floating PCA **V1/V2 code split**: legacy vs ranked engines in `floatingPcaLegacy/` and `floatingPcaV2/`; shared contracts + invalid-slot helper; inline `allocatePCA()` floating phase extracted; V2 provenance + ranked tracker summary derivations isolated; thin `pcaAllocationFloating` façade. Behavior-named exports unchanged.
