'use client'

import { useDndContext, DragEndEvent } from '@dnd-kit/core'
import { useState } from 'react'

export function useDragAndDrop() {
  const [activeId, setActiveId] = useState<string | null>(null)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    if (!over) {
      setActiveId(null)
      return
    }

    // Handle drop logic here
    console.log('Dropped', active.id, 'onto', over.id)
    
    setActiveId(null)
  }

  return {
    activeId,
    setActiveId,
    handleDragEnd,
  }
}

