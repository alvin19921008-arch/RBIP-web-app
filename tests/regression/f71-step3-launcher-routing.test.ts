import assert from 'node:assert/strict'

import {
  closeStep3DialogSurface,
  openStep3EntrySurface,
  openStep3FlowSurface,
  type Step3DialogSurface,
} from '../../lib/features/schedule/step3DialogFlow'

async function main() {
  const entrySurface = openStep3EntrySurface()
  assert.equal(entrySurface, 'entry', 'Expected Step 3 to open at the launcher surface first')

  const v1Surface = openStep3FlowSurface('v1-legacy')
  assert.equal(v1Surface, 'v1-legacy', 'Expected the V1 launcher choice to route into the legacy Step 3 flow')

  const v2Surface = openStep3FlowSurface('v2-ranked')
  assert.equal(v2Surface, 'v2-ranked', 'Expected the V2 launcher choice to route into the ranked Step 3 flow')

  const closedSurface: Step3DialogSurface = closeStep3DialogSurface()
  assert.equal(closedSurface, 'closed', 'Expected closing Step 3 dialogs to clear all Step 3 surfaces')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
