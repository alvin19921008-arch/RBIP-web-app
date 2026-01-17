export function clampFixedPositionToViewport(args: {
  left: number
  top: number
  width: number
  height: number
  pad?: number
}) {
  const pad = typeof args.pad === 'number' ? args.pad : 8
  const maxLeft = Math.max(pad, window.innerWidth - args.width - pad)
  const maxTop = Math.max(pad, window.innerHeight - args.height - pad)
  const clampedLeft = Math.min(Math.max(pad, args.left), maxLeft)
  const clampedTop = Math.min(Math.max(pad, args.top), maxTop)
  return { left: clampedLeft, top: clampedTop }
}

