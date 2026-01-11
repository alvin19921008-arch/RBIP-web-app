'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Check, ChevronDown, Highlighter, List, ListOrdered, Pencil, Redo2, Undo2 } from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'

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
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const pop = popRef.current
    if (!anchor || !pop) return

    const rect = anchor.getBoundingClientRect()
    const popRect = pop.getBoundingClientRect()
    const padding = 8

    let left = rect.left
    let top = rect.bottom + padding

    // Clamp within viewport
    const maxLeft = window.innerWidth - popRect.width - 8
    left = Math.max(8, Math.min(left, maxLeft))

    const maxTop = window.innerHeight - popRect.height - 8
    top = Math.max(8, Math.min(top, maxTop))

    setPos({ left, top })
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

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

export function AllocationNotesBoard({
  doc,
  onSave,
  title = 'Points to note',
}: {
  doc: NotesDoc | null | undefined
  onSave: (next: NotesDoc) => Promise<void> | void
  title?: string
}) {
  const initialDoc = React.useMemo(() => {
    if (isNonEmptyObject(doc)) return doc
    return EMPTY_DOC
  }, [doc])

  const [isEditing, setIsEditing] = React.useState(false)
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
    editable: false,
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
    if (!isEditing) return
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
  }, [editor, isEditing])

  // Keep display content in sync when not editing
  React.useEffect(() => {
    if (!editor) return
    if (isEditing) return
    editor.commands.setContent(initialDoc as any, { emitUpdate: false })
  }, [editor, initialDoc, isEditing])

  const canEdit = !!editor && !saving

  const enterEdit = () => {
    if (!editor) return
    setIsEditing(true)
    editor.setEditable(true)
    editor.commands.focus('end')
  }

  const cancelEdit = () => {
    if (!editor) {
      setIsEditing(false)
      return
    }
    editor.commands.setContent(initialDoc as any, { emitUpdate: false })
    editor.setEditable(false)
    setIsEditing(false)
  }

  const save = async () => {
    if (!editor) return
    const nextDoc = editor.getJSON()
    setSaving(true)
    try {
      await onSave(nextDoc as any)
      editor.setEditable(false)
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-8 gap-2">
        <div className="col-span-8 border rounded-md">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-sm font-semibold">{title}</div>
            {!isEditing ? (
              <Tooltip side="top" content="Edit">
                <span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={enterEdit}
                    disabled={!canEdit}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </span>
              </Tooltip>
            ) : null}
          </div>

          {/* Toolbar (2nd line, left-aligned) */}
          {isEditing ? (
            <div className="px-3 py-1.5 border-b">
              <div className="flex flex-wrap items-center justify-start gap-1">
                <Tooltip side="top" content="Undo (Ctrl/Cmd+Z)">
                  <span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={!editor?.can().undo()}
                      onClick={() => editor?.chain().focus().undo().run()}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip side="top" content="Redo (Ctrl/Cmd+Y)">
                  <span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={!editor?.can().redo()}
                      onClick={() => editor?.chain().focus().redo().run()}
                    >
                      <Redo2 className="h-4 w-4" />
                    </Button>
                  </span>
                </Tooltip>

                <Tooltip side="top" content="Bold">
                  <span>
                    <Button
                      type="button"
                      variant={editor?.isActive('bold') ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-8 w-8"
                      disabled={!editor?.can().toggleBold()}
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
                      disabled={!editor?.can().toggleItalic()}
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
                      disabled={!editor?.can().toggleUnderline()}
                      onClick={() => editor?.chain().focus().toggleUnderline().run()}
                    >
                      <span className="text-sm underline">U</span>
                    </Button>
                  </span>
                </Tooltip>

                <SwatchPopover
                  label="Text color"
                  swatches={TEXT_COLORS}
                  disabled={!canEdit}
                  icon={<span className="text-sm font-medium">A</span>}
                  onPick={(value) => {
                    if (!editor) return
                    editor.chain().focus().setColor(value).run()
                  }}
                />
                <SwatchPopover
                  label="Highlight"
                  swatches={HIGHLIGHT_COLORS}
                  disabled={!canEdit}
                  icon={<Highlighter className="h-4 w-4" />}
                  onPick={(value) => {
                    if (!editor) return
                    if (value === 'transparent') {
                      editor.chain().focus().unsetHighlight().run()
                    } else {
                      editor.chain().focus().setHighlight({ color: value }).run()
                    }
                  }}
                />

                <Tooltip side="top" content="Bullets">
                  <span>
                    <Button
                      type="button"
                      variant={editor?.isActive('bulletList') ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-8 w-8"
                      disabled={!editor?.can().toggleBulletList()}
                      onClick={() => editor?.chain().focus().toggleBulletList().run()}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip side="top" content="Numbering">
                  <span>
                    <Button
                      type="button"
                      variant={editor?.isActive('orderedList') ? 'secondary' : 'ghost'}
                      size="icon"
                      className="h-8 w-8"
                      disabled={!editor?.can().toggleOrderedList()}
                      onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                    >
                      <ListOrdered className="h-4 w-4" />
                    </Button>
                  </span>
                </Tooltip>
              </div>
            </div>
          ) : null}

          <div className={isEditing ? 'max-h-[360px] overflow-y-auto' : undefined}>
            <EditorContent editor={editor} />
          </div>

          {isEditing ? (
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t">
              <Button type="button" variant="outline" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
                <Check className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        :global(.allocation-notes-editor ul) {
          list-style: disc;
          padding-left: 1.25rem;
          margin: 0.25rem 0;
        }
        :global(.allocation-notes-editor ol) {
          list-style: decimal;
          padding-left: 1.25rem;
          margin: 0.25rem 0;
        }
        :global(.allocation-notes-editor li) {
          margin: 0.1rem 0;
        }
        :global(.allocation-notes-editor p) {
          margin: 0.25rem 0;
        }
      `}</style>
    </div>
  )
}

