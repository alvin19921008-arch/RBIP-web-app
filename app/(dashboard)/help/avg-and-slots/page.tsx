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

        <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
          <h2 className="text-base font-semibold">Raised target (shared spare) — early, Step 2→3</h2>
          <p className="text-muted-foreground">
            In V2, when spare placeable slots in the <span className="font-medium text-foreground">floating pool</span>{' '}
            are shared fairly after rounding, a team’s <span className="font-medium text-foreground">operational</span>{' '}
            floating target can be slightly higher than a naive “Avg minus non-floating” mental sum. The app may show a
            short line such as <span className="font-medium text-foreground">Raised target</span> or a tooltip like{' '}
            <span className="font-medium text-foreground">Raised floating target (shared spare).</span>
          </p>
          <p className="text-muted-foreground">
            The <span className="font-medium text-foreground">Avg PCA/team</span> line on the dashboard and Step 3.1
            stays the <span className="font-medium text-foreground">raw</span> therapist-weighted value so the
            headline number stays stable day to day.
          </p>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
          <h2 className="text-base font-semibold">Extra after needs — later, Step 3.4</h2>
          <p className="text-muted-foreground">
            Sometimes the allocator places <span className="font-medium text-foreground">optional</span> floating slot(s){' '}
            <span className="font-medium text-foreground">after</span> basic floating needs are already met. That is{' '}
            <span className="font-medium text-foreground">extra after needs</span>. It is{' '}
            <span className="font-medium text-foreground">not</span> the same as a raised target from rounding: raised
            target is about <span className="font-medium text-foreground">how the target was set at handoff</span>;
            extra after needs is about <span className="font-medium text-foreground">what happened during allocation</span>{' '}
            (order, repair, extra-coverage pass, etc.).
          </p>
          <p className="text-muted-foreground">
            Default one-line framing: “After every team’s basic floating need was met, rounding still left spare
            slot(s), so the system could place extra slot(s).”
          </p>
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
