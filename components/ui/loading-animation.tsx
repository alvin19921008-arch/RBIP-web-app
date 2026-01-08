'use client'

import * as React from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'

type LoadingAnimationProps = {
  className?: string
}

const LOADING_SRC =
  'https://lottie.host/382239e8-c820-46c9-a55e-751559d314cc/dnbAnBF32O.lottie'

export function LoadingAnimation({ className }: LoadingAnimationProps) {
  return (
    <div className={className}>
      <DotLottieReact src={LOADING_SRC} autoplay loop />
    </div>
  )
}

