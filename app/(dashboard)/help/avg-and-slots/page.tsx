import Link from 'next/link'
import { AvgPcaFormulaSteps, AvgPcaSanityCheckStaticDescription } from '@/components/help/avgPcaFormulaSteps'

export const metadata = {
  title: 'Avg PCA and slots',
  description:
    'Why Avg PCA/team uses continuous FTE while Step 3 uses slots, and how raised target (shared spare) differs from extra after needs.',
}

export default function AvgAndSlotsHelpPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] w-full px-8 py-6 bg-background">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-2">
          <Link
            href="/help"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            ← Back to Help Center
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Avg PCA/team and slots</h1>
          <p className="text-sm text-muted-foreground">
            A short, plain-language guide to how the dashboard formula relates to Step 3 floating coverage (V2).
          </p>
        </div>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
          <h2 className="text-base font-semibold">Two ways of counting</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Continuous (fractions)</span> — Beds, therapists, who is
              on duty, special programs, and non-floating coverage feed a formula. The result is{' '}
              <span className="font-medium text-foreground">Avg PCA/team</span> per team: a smooth number you can reason
              about (for example 1.35 FTE).
            </li>
            <li>
              <span className="font-medium text-foreground">Slots (chunks)</span> — Real assignments move in steps of{' '}
              <span className="font-medium text-foreground">0.25 FTE</span> (one slot). Anything the allocator must place
              has to land on that grid.
            </li>
          </ul>
          <p className="text-muted-foreground">
            The app uses a <span className="font-medium text-foreground">deterministic</span> “nearest quarter” rule for
            those snaps. It does <span className="font-medium text-foreground">not</span> coordinate “round this team
            down so another team can round up” the way a manual spreadsheet check sometimes does.
          </p>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
          <h2 className="text-base font-semibold">Why scarcity or “extra” can appear</h2>
          <p className="text-muted-foreground">
            When you turn continuous needs into quarter slots and add across teams, the totals do not always line up
            perfectly. Compare:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              How many <span className="font-medium text-foreground">floating slots</span> the roster can still place
              (the pool), and
            </li>
            <li>
              How many slots teams <span className="font-medium text-foreground">need</span> on that same grid after
              Avg, non-floating coverage, and rounding.
            </li>
          </ul>
          <p className="text-muted-foreground">
            If the pool is <span className="font-medium text-foreground">short</span>, you feel scarcity pressure. If the
            pool has <span className="font-medium text-foreground">leftover placeable slots</span> after honest needs,
            there can be <span className="font-medium text-foreground">slack</span>. Slack is not “Avg was wrong at Step
            2”; it is often discretization plus a global capacity check.
          </p>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
          <h2 className="text-base font-semibold">Raised target (shared spare) — after Step 2, before Step 3</h2>
          <p className="text-muted-foreground">
            After <span className="font-medium text-foreground">Step 2</span>, the system turns each team’s floating{' '}
            <span className="font-medium text-foreground">need</span> into <span className="font-medium text-foreground">whole slots</span>{' '}
            (0.25 FTE each). Sometimes the <span className="font-medium text-foreground">floating pool</span> can still
            make <span className="font-medium text-foreground">extra whole slots</span> after those needs are counted in
            slots. A fair share of that spare can <span className="font-medium text-foreground">raise</span> one team’s{' '}
            <span className="font-medium text-foreground">floating target</span> slightly — that is{' '}
            <span className="font-medium text-foreground">raised target (shared spare)</span>.
          </p>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Example mapping (same idea, different units)
            </p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[280px] border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/60 text-foreground">
                    <th className="border-b border-border px-3 py-2 text-left font-medium">In the app</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">In this example</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr>
                    <td className="border-b border-border px-3 py-2">1 placeable slot (0.25 FTE)</td>
                    <td className="border-b border-border px-3 py-2">1 × 8 g bun (fixed size)</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2">Continuous floating pool (FTE)</td>
                    <td className="border-b border-border px-3 py-2">Whole bread dough (e.g. 100 g)</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2">Need counted in whole slots</td>
                    <td className="border-b border-border px-3 py-2">Mealboxes — only whole compartments (no 0.37 box)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="mb-2 font-medium text-foreground">Dough → buns (continuous vs whole slots)</p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[260px] border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/60 text-foreground">
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Idea</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr>
                    <td className="border-b border-border px-3 py-2">Whole dough (continuous)</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">100 g</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2">Fixed bun size → max buns you can bake</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">8 g each → 12 buns (uses 96 g)</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2">Leftover dough (not another 8 g bun)</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">4 g</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">12 buns</span> ≈ how many{' '}
                <span className="font-medium text-foreground">whole placeable slots</span> the floating pool can still
                make today.
              </li>
              <li>
                <span className="font-medium text-foreground">4 g</span> ≈ continuous “headroom” in the story that{' '}
                <span className="font-medium text-foreground">does not</span> automatically become another 8 g bun — same
                idea as: not every leftover bit becomes another 0.25 FTE slot unless the rules allow a{' '}
                <span className="font-medium text-foreground">whole</span> slot.
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-2 font-medium text-foreground">Mealboxes = need in whole slots only</p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[280px] border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/60 text-foreground">
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Team (mealbox)</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">
                      Compartments to fill (slots)
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr>
                    <td className="border-b border-border px-3 py-2">Team 1</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">4</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2">Team 2</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">4</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2">Team 3</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">3</td>
                  </tr>
                  <tr className="bg-muted/30 font-medium text-foreground">
                    <td className="border-b border-border px-3 py-2">Total</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">11</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                Each <span className="font-medium text-foreground">compartment</span> ={' '}
                <span className="font-medium text-foreground">1 slot (0.25 FTE)</span> still owed from the floating pool
                for that team’s plan.
              </li>
              <li>
                <span className="font-medium text-foreground">12</span> buns possible,{' '}
                <span className="font-medium text-foreground">11</span> compartments needed →{' '}
                <span className="font-medium text-foreground">1 spare bun</span> the system can assign fairly (using Avg
                PCA/team weighting) → one team’s <span className="font-medium text-foreground">floating target</span> can
                show <span className="font-medium text-foreground">+0.25 FTE</span>.
              </li>
              <li>
                <span className="font-medium text-foreground">Avg PCA/team</span> on the dashboard and Step 3.1{' '}
                <span className="font-medium text-foreground">does not change</span> — only the floating target for
                Step 3 can move.
              </li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            In-app hints:{' '}
            <span className="font-medium text-foreground">Floating target includes a small raise from shared spare (rounding).</span>{' '}
            Tooltip: <span className="font-medium text-foreground">Raised floating target (shared spare).</span>
          </p>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
          <h2 className="text-base font-semibold">Extra after needs — later, Step 3.4</h2>
          <p className="text-muted-foreground">
            After <span className="font-medium text-foreground">every team’s basic floating need</span> is already
            covered, the <span className="font-medium text-foreground">system</span> may still place optional floating
            slot(s). That is <span className="font-medium text-foreground">extra after needs</span>. It depends on how
            Step 3.4 runs (order, repair, extra pass) — not the same story as raising the floating target at Step 2→3.
          </p>

          <div>
            <p className="mb-2 font-medium text-foreground">Cake → slices (optional extra after needs are met)</p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[260px] border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/60 text-foreground">
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Idea</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Slices</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr>
                    <td className="border-b border-border px-3 py-2">Cake (pool story for this picture)</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">8</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2">Slices needed so every must-fill guest is OK</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">7</td>
                  </tr>
                  <tr className="bg-muted/30 font-medium text-foreground">
                    <td className="border-b border-border px-3 py-2">Optional extra slice</td>
                    <td className="border-b border-border px-3 py-2 text-right tabular-nums">8 − 7 = 1</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                The <span className="font-medium text-foreground">+1 slice</span> is “on top” of basic need — not the
                same as “the recipe changed at Step 2.”
              </li>
              <li>
                <span className="font-medium text-foreground">Avg PCA/team</span> stays unchanged here too.
              </li>
            </ul>
          </div>

          <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-muted-foreground">
            <span className="font-medium text-foreground">One-line summary:</span> After every team’s basic floating need
            was met, rounding still left spare slot(s), so the system could place extra slot(s).
          </p>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Raised target vs extra after needs
            </p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[320px] border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/60 text-foreground">
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Topic</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">
                      Raised target (shared spare)
                    </th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Extra after needs</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr>
                    <td className="border-b border-border px-3 py-2 font-medium text-foreground">When</td>
                    <td className="border-b border-border px-3 py-2">After Step 2→3, when counting needs in whole slots leaves spare whole slots in the pool</td>
                    <td className="border-b border-border px-3 py-2">During / after Step 3.4, when basic needs are met but optional slots can still be placed</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2 font-medium text-foreground">What moves</td>
                    <td className="border-b border-border px-3 py-2">Mostly the floating target (+0.25 FTE style)</td>
                    <td className="border-b border-border px-3 py-2">Assignments (an extra slot), not the Avg row</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2 font-medium text-foreground">Avg row</td>
                    <td className="border-b border-border px-3 py-2">Unchanged</td>
                    <td className="border-b border-border px-3 py-2">Unchanged</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/50 p-4 text-xs leading-snug">
          <h2 className="text-sm font-semibold text-foreground">Avg PCA/team formula (reference)</h2>
          <AvgPcaFormulaSteps />
          <div className="border-t border-amber-200/80 pt-2 space-y-1">
            <div className="font-semibold text-foreground">Sanity check</div>
            <AvgPcaSanityCheckStaticDescription />
          </div>
        </section>

      </div>
    </div>
  )
}
