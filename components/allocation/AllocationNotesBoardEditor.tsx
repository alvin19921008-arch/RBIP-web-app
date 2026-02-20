'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Check, ChevronDown, Highlighter, List, ListOrdered, Redo2, Undo2, X } from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { useAnchoredPopoverPosition } from '@/lib/hooks/useAnchoredPopoverPosition'
import { useOnClickOutside } from '@/lib/hooks/useOnClickOutside'

type NotesDoc = unknown

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] } as const

type Swatch = { label: string; value: string; className: string }

const TEXT_COLORS: Swatch[] = [
  { label: 'Black', value: '#111827', className: 'bg-gray-900' },
  { label: 'Gray', value: '#6b7280', className: 'bg-gray-500' },
  { label: 'Red', value: '#dc2626', className: 'bg-red-600' },
  { label: 'Orange', value: '#ea580c', className: 'bg-orange-600' },
  { label: 'Yellow', value: '#ca8a04', className: 'bg-yellow-600' },
  { label: 'Green', value: '#16a34a', className: 'bg-green-600' },
  { label: 'Teal', value: '#0d9488', className: 'bg-teal-600' },
  { label: 'Blue', value: '#2563eb', className: 'bg-blue-600' },
  { label: 'Purple', value: '#7c3aed', className: 'bg-violet-600' },
  { label: 'Pink', value: '#db2777', className: 'bg-pink-600' },
]

const HIGHLIGHT_COLORS: Swatch[] = [
  { label: 'Yellow', value: '#fef08a', className: 'bg-yellow-200' },
  { label: 'Orange', value: '#fed7aa', className: 'bg-orange-200' },
  { label: 'Red', value: '#fecaca', className: 'bg-red-200' },
  { label: 'Green', value: '#bbf7d0', className: 'bg-green-200' },
  { label: 'Teal', value: '#99f6e4', className: 'bg-teal-200' },
  { label: 'Blue', value: '#bfdbfe', className: 'bg-blue-200' },
  { label: 'Purple', value: '#ddd6fe', className: 'bg-violet-200' },
  { label: 'Pink', value: '#fbcfe8', className: 'bg-pink-200' },
  { label: 'Gray', value: '#e5e7eb', className: 'bg-gray-200' },
  { label: 'None', value: 'transparent', className: 'bg-background border border-input' },
]

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function SwatchPopover({
  label,
  swatches,
  onPick,
  disabled,
  icon,
}: {
  label: string
  swatches: Swatch[]
  onPick: (value: string) => void
  disabled?: boolean
  icon: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const anchorRef = React.useRef<HTMLButtonElement | null>(null)
  const popRef = React.useRef<HTMLDivElement | null>(null)
  const pos = useAnchoredPopoverPosition({
    open,
    anchorRef,
    popoverRef: popRef,
    placement: 'bottom-start',
    offset: 8,
    pad: 8,
  })
  useOnClickOutside([anchorRef, popRef], () => setOpen(false), { enabled: open, event: 'pointerdown' })

  return (
    <div className="relative">
      <Tooltip side="top" content={label}>
        <span>
          <Button
            ref={anchorRef}
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="inline-flex items-center gap-1">
              {icon}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </span>
          </Button>
        </span>
      </Tooltip>

      {open ? (
        <div
          ref={popRef}
          className="fixed z-50 rounded-md border bg-background shadow-md p-2"
          style={pos ? { left: pos.left, top: pos.top } : undefined}
          role="dialog"
          aria-label={label}
        >
          <div className="grid grid-cols-5 gap-2">
            {swatches.map((s) => (
              <button
                key={s.label}
                type="button"
                className={`h-6 w-6 rounded-sm ${s.className}`}
                title={s.label}
                onClick={() => {
                  onPick(s.value)
                  setOpen(false)
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AllocationNotesBoardEditor({
  doc,
  onSave,
  onClose,
  title = 'Points to note',
}: {
  doc: NotesDoc | null | undefined
  onSave: (next: NotesDoc) => Promise<void> | void
  onClose: () => void
  title?: string
}) {
  const initialDoc = React.useMemo(() => {
    if (isNonEmptyObject(doc)) return doc
    return EMPTY_DOC
  }, [doc])

  const [saving, setSaving] = React.useState(false)

  const editor = useEditor({
    // Next.js (App Router) will pre-render client components and then hydrate.
    // Tiptap requires this to avoid hydration mismatches.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Keep headings off (this is a note board, not a document).
        heading: false,
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: initialDoc as any,
    editable: true,
    editorProps: {
      attributes: {
        class:
          'allocation-notes-editor focus:outline-none text-sm leading-6 min-h-[140px] px-3 py-2',
      },
    },
  })

  // Explicitly support common undo/redo shortcuts while editing.
  React.useEffect(() => {
    if (!editor) return
    const el = editor.view.dom

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          editor.chain().focus().redo().run()
        } else {
          editor.chain().focus().undo().run()
        }
      } else if (key === 'y') {
        event.preventDefault()
        editor.chain().focus().redo().run()
      }
    }

    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
  }, [editor])

  const canEdit = !!editor && !saving

  const cancel = () => {
    onClose()
  }

  const save = async () => {
    if (!editor) return
    const nextDoc = editor.getJSON()
    setSaving(true)
    try {
      await onSave(nextDoc as any)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const toggleList = (ordered: boolean) => {
    if (!editor) return
    if (ordered) editor.chain().focus().toggleOrderedList().run()
    else editor.chain().focus().toggleBulletList().run()
  }

  const setTextColor = (value: string) => {
    if (!editor) return
    editor.chain().focus().setColor(value).run()
  }

  const setHighlightColor = (value: string) => {
    if (!editor) return
    if (value === 'transparent') {
      editor.chain().focus().unsetHighlight().run()
      return
    }
    editor.chain().focus().setHighlight({ color: value }).run()
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-8 border rounded-md">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-sm font-semibold">{title}</div>
            <div className="flex items-center gap-1">
              <Tooltip side="top" content="Cancel">
                <span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={cancel}
                    disabled={!canEdit}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </span>
              </Tooltip>
              <Tooltip side="top" content="Confirm">
                <span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={save}
                    disabled={!canEdit}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </span>
              </Tooltip>
            </div>
          </div>

          {/* Toolbar */}
          <div className="px-3 py-1.5 border-b flex flex-wrap items-center gap-1">
            <Tooltip side="top" content="Undo">
              <span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!editor?.can().undo() || saving}
                  onClick={() => editor?.chain().focus().undo().run()}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </span>
            </Tooltip>
            <Tooltip side="top" content="Redo">
              <span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!editor?.can().redo() || saving}
                  onClick={() => editor?.chain().focus().redo().run()}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </span>
            </Tooltip>

            <div className="h-6 w-px bg-border mx-1" />

            <Tooltip side="top" content="Bold">
              <span>
                <Button
                  type="button"
                  variant={editor?.isActive('bold') ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  disabled={!editor?.can().toggleBold() || saving}
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                >
                  <span className="text-sm font-bold">B</span>
                </Button>
              </span>
            </Tooltip>
            <Tooltip side="top" content="Italic">
              <span>
                <Button
                  type="button"
                  variant={editor?.isActive('italic') ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  disabled={!editor?.can().toggleItalic() || saving}
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                >
                  <span className="text-sm italic">I</span>
                </Button>
              </span>
            </Tooltip>
            <Tooltip side="top" content="Underline">
              <span>
                <Button
                  type="button"
                  variant={editor?.isActive('underline') ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  disabled={!editor?.can().toggleUnderline() || saving}
                  onClick={() => editor?.chain().focus().toggleUnderline().run()}
                >
                  <span className="text-sm underline">U</span>
                </Button>
              </span>
            </Tooltip>

            <div className="h-6 w-px bg-border mx-1" />

            <Tooltip side="top" content="Bullet list">
              <span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!canEdit}
                  onClick={() => toggleList(false)}
                >
                  <List className="h-4 w-4" />
                </Button>
              </span>
            </Tooltip>
            <Tooltip side="top" content="Ordered list">
              <span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!canEdit}
                  onClick={() => toggleList(true)}
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </span>
            </Tooltip>

            <div className="h-6 w-px bg-border mx-1" />

            <SwatchPopover
              label="Text color"
              swatches={TEXT_COLORS}
              onPick={setTextColor}
              disabled={!canEdit}
              icon={<span className="text-xs font-semibold">A</span>}
            />
            <SwatchPopover
              label="Highlight"
              swatches={HIGHLIGHT_COLORS}
              onPick={setHighlightColor}
              disabled={!canEdit}
              icon={<Highlighter className="h-4 w-4" />}
            />
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  )
}

