export type Step2ImpactKind =
  | 'special-programs'
  | 'substitution'
  | 'spt-final-edits'
  | 'shared-therapist-edits'
  | 'main-rerun'

export type Step2DownstreamImpactDelta = {
  step3Changed: boolean
  step4Changed: boolean
}

export type Step2DownstreamImpactRuleInput = {
  kind: Step2ImpactKind
  step3FingerprintChanged: boolean
  step4FingerprintChanged: boolean
  step3TargetsDependOnPtDistribution: boolean
  explicitStep3Change: boolean
  explicitStep4Change: boolean
}

export function mergeStep2DownstreamImpacts(
  left: Step2DownstreamImpactDelta,
  right: Step2DownstreamImpactDelta
): Step2DownstreamImpactDelta {
  return {
    step3Changed: left.step3Changed || right.step3Changed,
    step4Changed: left.step4Changed || right.step4Changed,
  }
}

export function evaluateStep2DownstreamImpact(
  input: Step2DownstreamImpactRuleInput
): Step2DownstreamImpactDelta {
  switch (input.kind) {
    case 'special-programs':
      return {
        step3Changed: input.explicitStep3Change || input.step3FingerprintChanged,
        step4Changed: input.explicitStep4Change || input.step4FingerprintChanged,
      }
    case 'substitution':
      return {
        step3Changed: input.explicitStep3Change || input.step3FingerprintChanged,
        step4Changed: false,
      }
    case 'spt-final-edits':
    case 'shared-therapist-edits':
      return {
        step3Changed:
          (input.explicitStep4Change && input.step3TargetsDependOnPtDistribution) || input.step3FingerprintChanged,
        step4Changed: input.explicitStep4Change || input.step4FingerprintChanged,
      }
    case 'main-rerun':
      return {
        step3Changed: input.step3FingerprintChanged,
        step4Changed: input.step4FingerprintChanged,
      }
    default: {
      const exhaustiveCheck: never = input.kind
      return exhaustiveCheck
    }
  }
}
