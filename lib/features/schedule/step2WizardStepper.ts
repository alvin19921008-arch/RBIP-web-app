export type Step2WizardStepperStep = {
  step: '2.0' | '2.1' | '2.2' | '2.3'
  label: 'Programs' | 'Substitute' | 'SPT' | 'Shared therapist'
}

export function buildStep2WizardStepperSteps(args: {
  showSubstituteStep: boolean
  showSharedTherapistStep: boolean
}): Step2WizardStepperStep[] {
  const steps: Step2WizardStepperStep[] = [{ step: '2.0', label: 'Programs' }]
  if (args.showSubstituteStep) steps.push({ step: '2.1', label: 'Substitute' })
  steps.push({ step: '2.2', label: 'SPT' })
  if (args.showSharedTherapistStep) steps.push({ step: '2.3', label: 'Shared therapist' })
  return steps
}
