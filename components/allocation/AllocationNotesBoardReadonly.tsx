'use client'

import * as React from 'react'

type NotesDoc = unknown

type PMMark = {
  type?: string
  attrs?: Record<string, unknown>
}

type PMNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: PMMark[]
  content?: PMNode[]
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isPmNode(value: unknown): value is PMNode {
  return isNonEmptyObject(value)
}

function asPmNode(value: unknown): PMNode | null {
  if (!isPmNode(value)) return null
  return value
}

function getMarkColor(mark: PMMark): string | null {
  const attrs = mark.attrs
  if (!attrs || typeof attrs !== 'object') return null
  const color = (attrs as any).color
  return typeof color === 'string' ? color : null
}

function getLinkHref(mark: PMMark): string | null {
  const attrs = mark.attrs
  if (!attrs || typeof attrs !== 'object') return null
  const href = (attrs as any).href
  return typeof href === 'string' ? href : null
}

function applyMarks(text: string, marks: PMMark[] | undefined): React.ReactNode {
  let out: React.ReactNode = text
  const list = Array.isArray(marks) ? marks : []

  // Apply marks in order; nesting is fine for our simple renderer.
  for (const mark of list) {
    const t = mark?.type
    if (t === 'bold') out = <strong>{out}</strong>
    else if (t === 'italic') out = <em>{out}</em>
    else if (t === 'underline') out = <u>{out}</u>
    else if (t === 'textStyle') {
      const c = getMarkColor(mark)
      if (c) out = <span style={{ color: c }}>{out}</span>
    } else if (t === 'highlight') {
      const c = getMarkColor(mark) ?? '#fef08a'
      out = <span style={{ backgroundColor: c }}>{out}</span>
    } else if (t === 'link') {
      const href = getLinkHref(mark)
      if (href) {
        out = (
          <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {out}
          </a>
        )
      }
    }
  }

  return out
}

function renderNode(node: PMNode, key: string): React.ReactNode {
  const type = node.type
  const children = Array.isArray(node.content)
    ? node.content.map((c, i) => {
        const pm = asPmNode(c)
        if (!pm) return null
        return <React.Fragment key={`${key}:${i}`}>{renderNode(pm, `${key}:${i}`)}</React.Fragment>
      })
    : null

  switch (type) {
    case 'doc':
      return <>{children}</>
    case 'paragraph':
      return <p className="mb-2 last:mb-0">{children}</p>
    case 'text':
      return <>{applyMarks(node.text ?? '', node.marks)}</>
    case 'hard_break':
      return <br />
    case 'bullet_list':
      return <ul className="my-2 list-disc pl-5">{children}</ul>
    case 'ordered_list': {
      const startRaw = (node.attrs as any)?.start
      const start = typeof startRaw === 'number' ? startRaw : 1
      return (
        <ol className="my-2 list-decimal pl-5" start={start}>
          {children}
        </ol>
      )
    }
    case 'list_item':
      return <li className="mb-1 last:mb-0">{children}</li>
    case 'blockquote':
      return <blockquote className="my-2 border-l-2 pl-3 italic text-muted-foreground">{children}</blockquote>
    case 'horizontal_rule':
      return <hr className="my-2 border-border" />
    case 'heading':
      return <div className="mb-2 font-semibold">{children}</div>
    default:
      // Unknown node: attempt to render children only.
      return <>{children}</>
  }
}

export function AllocationNotesBoardReadonly({ doc }: { doc: NotesDoc | null | undefined }) {
  const root = React.useMemo(() => {
    if (!isNonEmptyObject(doc)) return null
    const n = asPmNode(doc)
    if (!n) return null
    if (n.type !== 'doc') return null
    return n
  }, [doc])

  return (
    <div className="text-sm leading-6 min-h-[140px] px-3 py-2">
      {root ? renderNode(root, 'root') : <p className="text-muted-foreground">No notes.</p>}
    </div>
  )
}

