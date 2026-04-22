import type { ScheduleCalculations } from '@/types/schedule'

/** Merge contributor rows into one display row for merged teams (sums numeric fields, unions wards). */
export function combineScheduleCalculations(
  rows: Array<ScheduleCalculations | null | undefined>
): ScheduleCalculations | null {
  const valid = rows.filter((row): row is ScheduleCalculations => !!row)
  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0]

  const first = valid[0]
  const designated = Array.from(new Set(valid.flatMap((v) => v.designated_wards || [])))
  const sum = (selector: (c: ScheduleCalculations) => number | undefined) =>
    valid.reduce((acc, row) => acc + (selector(row) || 0), 0)

  const totalBedsDesignated = sum((c) => c.total_beds_designated)
  const totalBeds = sum((c) => c.total_beds)
  const ptPerTeam = sum((c) => c.pt_per_team)
  const totalPtPerTeam = sum((c) => c.total_pt_per_team)
  const bedsForRelieving = sum((c) => c.beds_for_relieving)
  const pcaOnDuty = sum((c) => c.pca_on_duty)
  const avgPcaPerTeam = sum((c) => c.average_pca_per_team)
  const baseAvgPcaPerTeam = sum((c) => c.base_average_pca_per_team || 0)
  const requiredPcaPerTeam = sum((c) => c.required_pca_per_team || 0)
  const expectedBedsPerTeam = sum((c) => c.expected_beds_per_team || 0)

  return {
    ...first,
    designated_wards: designated,
    total_beds_designated: totalBedsDesignated,
    total_beds: totalBeds,
    pt_per_team: ptPerTeam,
    total_pt_per_team: totalPtPerTeam,
    beds_for_relieving: bedsForRelieving,
    pca_on_duty: pcaOnDuty,
    average_pca_per_team: avgPcaPerTeam,
    base_average_pca_per_team: baseAvgPcaPerTeam,
    required_pca_per_team: requiredPcaPerTeam,
    expected_beds_per_team: expectedBedsPerTeam,
    // Keep globals from first row (these should be identical across teams in current model).
    total_pt_on_duty: first.total_pt_on_duty,
    beds_per_pt: first.beds_per_pt,
    total_pt_per_pca: first.total_pt_per_pca,
  }
}
