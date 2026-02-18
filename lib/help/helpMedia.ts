import type { StaticImageData } from 'next/image'
import step2PcaCoverGif from '@/Video/step 2 PCA cover.gif'
import summaryInfoGif from '@/Video/Summary info_Gif.gif'
import staffPoolGif from '@/Video/staffpool.gif'
import contextualMenuGif from '@/Video/Contexual menu.gif'

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const resolveHelpMediaUrl = (envValue: string | undefined, fallback: StaticImageData): string => {
  const candidate = envValue?.trim()
  if (candidate && isHttpUrl(candidate)) return candidate
  return fallback.src
}

export const helpMedia = {
  step2PcaCoverGif: resolveHelpMediaUrl(
    process.env.NEXT_PUBLIC_HELP_MEDIA_STEP2_PCA_COVER_GIF_URL,
    step2PcaCoverGif
  ),
  summaryInfoGif: resolveHelpMediaUrl(
    process.env.NEXT_PUBLIC_HELP_MEDIA_SUMMARY_INFO_GIF_URL,
    summaryInfoGif
  ),
  staffPoolGif: resolveHelpMediaUrl(
    process.env.NEXT_PUBLIC_HELP_MEDIA_STAFF_POOL_GIF_URL,
    staffPoolGif
  ),
  contextualMenuGif: resolveHelpMediaUrl(
    process.env.NEXT_PUBLIC_HELP_MEDIA_CONTEXTUAL_MENU_GIF_URL,
    contextualMenuGif
  ),
} as const

export type HelpMediaKey = keyof typeof helpMedia
