'use client'

import type { ComponentProps } from 'react'
import { FloatingPCAConfigDialog } from './FloatingPCAConfigDialog'

export type FloatingPCAConfigDialogV1Props = ComponentProps<typeof FloatingPCAConfigDialog>

export function FloatingPCAConfigDialogV1(props: FloatingPCAConfigDialogV1Props) {
  return <FloatingPCAConfigDialog {...props} />
}
