export interface ExistingProgramOverrideSeedInput {
  programId?: string
  programName: string
  foundTherapistId?: string
  foundPrimaryPcaId?: string
  foundSlots?: number[]
  foundRequiredSlots?: number[]
  foundTherapistFTE?: number
  foundPCAFTE?: number
  foundDRMAddOn?: number
  primaryConfiguredTherapist?: {
    id: string
    fte: number | undefined
  } | null
  isPrimaryConfiguredTherapistAvailable?: boolean
}

export interface ExistingProgramOverrideSeed {
  programId?: string
  therapistId?: string
  pcaId?: string
  primaryPcaId?: string
  slots?: number[]
  therapistFTESubtraction?: number
  pcaFTESubtraction?: number
  drmAddOn?: number
}

export function buildExistingProgramOverrideSeed(
  input: ExistingProgramOverrideSeedInput
): ExistingProgramOverrideSeed | null {
  const hasExistingData =
    input.foundTherapistId !== undefined ||
    input.foundPrimaryPcaId !== undefined ||
    input.foundSlots !== undefined ||
    input.foundRequiredSlots !== undefined ||
    input.foundDRMAddOn !== undefined

  if (!hasExistingData) return null

  const effectiveRequiredSlots = input.foundRequiredSlots ?? input.foundSlots
  let therapistId = input.foundTherapistId
  let therapistFTESubtraction = input.foundTherapistFTE

  if (
    input.programName === 'CRP' &&
    input.primaryConfiguredTherapist &&
    input.isPrimaryConfiguredTherapistAvailable
  ) {
    therapistId = input.primaryConfiguredTherapist.id
    therapistFTESubtraction =
      input.primaryConfiguredTherapist.fte !== undefined
        ? input.primaryConfiguredTherapist.fte
        : 0
  }

  return {
    programId: input.programId,
    therapistId,
    pcaId: input.foundPrimaryPcaId,
    primaryPcaId: input.foundPrimaryPcaId,
    slots: effectiveRequiredSlots ?? input.foundSlots,
    therapistFTESubtraction,
    pcaFTESubtraction: input.foundPCAFTE,
    drmAddOn: input.foundDRMAddOn,
  }
}
