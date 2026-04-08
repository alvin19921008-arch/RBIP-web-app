import { expect, test } from '@playwright/test'
import {
  evaluateStep2DownstreamImpact,
  mergeStep2DownstreamImpacts,
  type Step2DownstreamImpactRuleInput,
} from '@/lib/features/schedule/step2DownstreamImpact'

function evaluate(input: Partial<Step2DownstreamImpactRuleInput>) {
  return evaluateStep2DownstreamImpact({
    kind: 'main-rerun',
    step3FingerprintChanged: false,
    step4FingerprintChanged: false,
    step3TargetsDependOnPtDistribution: true,
    explicitStep3Change: false,
    explicitStep4Change: false,
    ...input,
  })
}

test.describe('Step 2 downstream impact contract', () => {
  test('step 2.0 special program changes keep Step 3 dirty even when fingerprints look unchanged @smoke', () => {
    expect(
      evaluate({
        kind: 'special-programs',
        explicitStep3Change: true,
        step3FingerprintChanged: false,
        step4FingerprintChanged: false,
      })
    ).toEqual({
      step3Changed: true,
      step4Changed: false,
    })
  })

  test('step 2.1 substitution changes only dirty Step 3 @smoke', () => {
    expect(
      evaluate({
        kind: 'substitution',
        explicitStep3Change: true,
        explicitStep4Change: true,
      })
    ).toEqual({
      step3Changed: true,
      step4Changed: false,
    })
  })

  test('step 2.2 and 2.3 edits dirty Step 4 and Step 3 only when targets are PT-sensitive @smoke', () => {
    expect(
      evaluate({
        kind: 'spt-final-edits',
        explicitStep4Change: true,
        step3TargetsDependOnPtDistribution: true,
      })
    ).toEqual({
      step3Changed: true,
      step4Changed: true,
    })

    expect(
      evaluate({
        kind: 'shared-therapist-edits',
        explicitStep4Change: true,
        step3TargetsDependOnPtDistribution: false,
      })
    ).toEqual({
      step3Changed: false,
      step4Changed: true,
    })
  })

  test('main rerun remains fingerprint-driven for no-op protection @smoke', () => {
    expect(
      evaluate({
        kind: 'main-rerun',
        step3FingerprintChanged: false,
        step4FingerprintChanged: false,
      })
    ).toEqual({
      step3Changed: false,
      step4Changed: false,
    })

    expect(
      evaluate({
        kind: 'main-rerun',
        step3FingerprintChanged: true,
        step4FingerprintChanged: true,
      })
    ).toEqual({
      step3Changed: true,
      step4Changed: true,
    })
  })

  test('explicit contract signals merge with fingerprint deltas @smoke', () => {
    expect(
      mergeStep2DownstreamImpacts(
        { step3Changed: true, step4Changed: false },
        { step3Changed: false, step4Changed: true }
      )
    ).toEqual({
      step3Changed: true,
      step4Changed: true,
    })
  })
})
