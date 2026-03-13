export function computeStalePcaStaffIdsForReplace(args: {
  existingStaffIds: string[]
  submittedStaffIds: string[]
}): string[] {
  const submitted = new Set((args.submittedStaffIds ?? []).filter(Boolean))
  return Array.from(new Set((args.existingStaffIds ?? []).filter(Boolean))).filter((staffId) => !submitted.has(staffId))
}
