export type Step3V2Step = '3.1' | '3.2' | '3.3' | '3.4'

export function buildStep3V2VisibleSteps(params: {
  includeStep32: boolean
  includeStep33: boolean
}): Step3V2Step[] {
  const steps: Step3V2Step[] = ['3.1']
  if (params.includeStep32) steps.push('3.2')
  if (params.includeStep33) steps.push('3.3')
  steps.push('3.4')
  return steps
}

export function getStep3V2BackTarget(params: {
  currentStep: Step3V2Step
  visibleSteps: Step3V2Step[]
}): Step3V2Step | null {
  const currentIndex = params.visibleSteps.indexOf(params.currentStep)
  if (currentIndex <= 0) return null
  return params.visibleSteps[currentIndex - 1] ?? null
}
