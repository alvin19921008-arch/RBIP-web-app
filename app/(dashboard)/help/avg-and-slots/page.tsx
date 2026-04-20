import Link from 'next/link'
import { AvgPcaFormulaSteps, AvgPcaSanityCheckStaticDescription } from '@/components/help/avgPcaFormulaSteps'

export const metadata = {
  title: 'Avg PCA and slots',
  description:
    'Why Avg PCA/team uses continuous FTE while Step 3 uses slots, and how budgeted Extra after needs works in Step 3.4.',
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

        <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
          <h2 className="text-base font-semibold">Slack after rounding</h2>
          <p className="text-muted-foreground">
            After <span className="font-medium text-foreground">Step 2</span>, each team’s floating gap is expressed on
            the quarter grid. The pool may still have spare placeable slots once those needs are counted in slots.
            Optional coverage beyond met needs is realized in <span className="font-medium text-foreground">Step 3.4</span>{' '}
            only, as <span className="font-medium text-foreground">budgeted Extra after needs</span> (capped; favors
            under-assigned teams first). The dashboard <span className="font-medium text-foreground">Avg</span> row stays
            the raw therapist-weighted value.
          </p>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
          <h2 className="text-base font-semibold">Extra after needs (budgeted) — Step 3.4</h2>
          <p className="text-muted-foreground">
            After <span className="font-medium text-foreground">every team’s basic floating need</span> is already
            covered, Step 3.4 may still place optional floating slot(s), <span className="font-medium text-foreground">up to a computed budget</span>{' '}
            from pool spare and aggregate under-assignment. That is <span className="font-medium text-foreground">Extra after needs</span>.
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
              Extra after needs (summary)
            </p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[280px] border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/60 text-foreground">
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Topic</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Extra after needs (budgeted)</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr>
                    <td className="border-b border-border px-3 py-2 font-medium text-foreground">When</td>
                    <td className="border-b border-border px-3 py-2">Step 3.4, after basic floating needs are met</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2 font-medium text-foreground">What moves</td>
                    <td className="border-b border-border px-3 py-2">Optional assignments (extra slots), not the Avg row</td>
                  </tr>
                  <tr>
                    <td className="border-b border-border px-3 py-2 font-medium text-foreground">Avg row</td>
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
