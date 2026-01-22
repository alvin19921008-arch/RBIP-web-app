'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Pencil } from 'lucide-react'
import { AllocationNotesBoardReadonly } from '@/components/allocation/AllocationNotesBoardReadonly'

type NotesDoc = unknown

const AllocationNotesBoardEditor = dynamic(
  () => import('@/components/allocation/AllocationNotesBoardEditor').then((m) => m.AllocationNotesBoardEditor),
  {
    ssr: false,
    loading: () => (
      <div className="mt-4">
        <div className="grid grid-cols-8 gap-2">
          <div className="col-span-8 border rounded-md">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="h-4 w-40 rounded-md bg-muted animate-pulse" />
              <div className="h-8 w-16 rounded-md bg-muted/70 animate-pulse" />
            </div>
            <div className="px-3 py-2">
              <div className="h-20 rounded-md bg-muted/70 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    ),
  }
)

export function prefetchAllocationNotesBoardEditor() {
  return import('@/components/allocation/AllocationNotesBoardEditor')
}

export function AllocationNotesBoard({
  doc,
  onSave,
  title = 'Points to note',
}: {
  doc: NotesDoc | null | undefined
  onSave: (next: NotesDoc) => Promise<void> | void
  title?: string
}) {
  const [editing, setEditing] = React.useState(false)

  if (editing) {
    return <AllocationNotesBoardEditor doc={doc} onSave={onSave} onClose={() => setEditing(false)} title={title} />
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-8 border rounded-md">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-sm font-semibold">{title}</div>
            <Tooltip side="top" content="Edit">
              <span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onMouseEnter={() => void prefetchAllocationNotesBoardEditor()}
                  onFocus={() => void prefetchAllocationNotesBoardEditor()}
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </span>
            </Tooltip>
          </div>

          <AllocationNotesBoardReadonly doc={doc} />
        </div>
      </div>
    </div>
  )
}

