export type Step3FlowChoice = 'v1-legacy' | 'v2-ranked'

export type Step3DialogSurface = 'closed' | 'entry' | Step3FlowChoice

export function openStep3EntrySurface(): Step3DialogSurface {
  return 'entry'
}

export function openStep3FlowSurface(choice: Step3FlowChoice): Step3DialogSurface {
  return choice
}

export function closeStep3DialogSurface(): Step3DialogSurface {
  return 'closed'
}
