'use client'

import { useState, useEffect, useRef } from 'react'

interface TimeIntervalSliderProps {
  slot: number
  startTime: string  // "0900" (HHMM)
  endTime: string    // "1030" (HHMM)
  value?: { start: string; end: string }
  onChange: (timeRange: { start: string; end: string }) => void
}

export function TimeIntervalSlider({
  slot,
  startTime,
  endTime,
  value,
  onChange
}: TimeIntervalSliderProps) {
  // Convert HHMM strings to minutes since start of day
  const timeToMinutes = (time: string): number => {
    const hours = parseInt(time.slice(0, 2))
    const minutes = parseInt(time.slice(2))
    return hours * 60 + minutes
  }

  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${String(hours).padStart(2, '0')}${String(mins).padStart(2, '0')}`
  }

  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)
  const totalMinutes = endMinutes - startMinutes

  // Generate 15-minute intervals
  const intervals: number[] = []
  for (let i = 0; i <= totalMinutes; i += 15) {
    intervals.push(startMinutes + i)
  }

  // Convert current value to slider positions
  const [sliderStart, setSliderStart] = useState<number>(0)
  const [sliderEnd, setSliderEnd] = useState<number>(intervals.length - 1)
  const trackRef = useRef<HTMLDivElement>(null)

  // Update slider positions when value changes
  useEffect(() => {
    if (value) {
      const startIdx = intervals.findIndex(min => min >= timeToMinutes(value.start))
      const endIdx = intervals.findIndex(min => min >= timeToMinutes(value.end))
      setSliderStart(startIdx >= 0 ? startIdx : 0)
      setSliderEnd(endIdx >= 0 ? endIdx : intervals.length - 1)
    }
  }, [value, intervals])

  const handleSliderChange = (startIdx: number, endIdx: number) => {
    setSliderStart(startIdx)
    setSliderEnd(endIdx)

    const startTimeSelected = minutesToTime(intervals[startIdx])
    const endTimeSelected = minutesToTime(intervals[endIdx])

    onChange({
      start: startTimeSelected,
      end: endTimeSelected
    })
  }

  const selectedStartTime = minutesToTime(intervals[sliderStart])
  const selectedEndTime = minutesToTime(intervals[sliderEnd])

  return (
    <div className="space-y-2">
      {/* Instructional text */}
      <p className="text-xs text-muted-foreground">
        Slide the bar to indicate which time interval the PCA would be present
      </p>
      
      {/* Time labels below slider */}
      <div className="flex justify-between text-xs text-muted-foreground px-2">
        {intervals.map((minutes, index) => (
          <span key={index} className="text-center">
            {minutesToTime(minutes)}
          </span>
        ))}
      </div>

      {/* Range slider implementation using HTML5 range inputs */}
      <div className="relative px-2">
        {/* Slider track */}
        <div ref={trackRef} className="relative h-2 bg-gray-200 rounded-full">
          {/* Selected range */}
          <div
            className="absolute h-full bg-blue-500 rounded-full"
            style={{
              left: `${(sliderStart / (intervals.length - 1)) * 100}%`,
              width: `${((sliderEnd - sliderStart) / (intervals.length - 1)) * 100}%`
            }}
          />

          {/* Start handle */}
          <div
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full -top-1 cursor-pointer"
            style={{
              left: `${(sliderStart / (intervals.length - 1)) * 100}%`,
              transform: 'translateX(-50%)'
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              if (!trackRef.current) return
              
              const startDrag = (moveEvent: MouseEvent) => {
                if (!trackRef.current) return
                const rect = trackRef.current.getBoundingClientRect()
                const x = moveEvent.clientX - rect.left
                const percentage = Math.max(0, Math.min(1, x / rect.width))
                const newIndex = Math.round(percentage * (intervals.length - 1))
                handleSliderChange(newIndex, Math.max(newIndex, sliderEnd))
              }

              const endDrag = () => {
                document.removeEventListener('mousemove', startDrag)
                document.removeEventListener('mouseup', endDrag)
              }

              document.addEventListener('mousemove', startDrag)
              document.addEventListener('mouseup', endDrag)
            }}
          />

          {/* End handle */}
          <div
            className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full -top-1 cursor-pointer"
            style={{
              left: `${(sliderEnd / (intervals.length - 1)) * 100}%`,
              transform: 'translateX(-50%)'
            }}
            onMouseDown={(e) => {
              e.preventDefault()
              if (!trackRef.current) return
              
              const startDrag = (moveEvent: MouseEvent) => {
                if (!trackRef.current) return
                const rect = trackRef.current.getBoundingClientRect()
                const x = moveEvent.clientX - rect.left
                const percentage = Math.max(0, Math.min(1, x / rect.width))
                const newIndex = Math.round(percentage * (intervals.length - 1))
                handleSliderChange(Math.min(newIndex, sliderStart), newIndex)
              }

              const endDrag = () => {
                document.removeEventListener('mousemove', startDrag)
                document.removeEventListener('mouseup', endDrag)
              }

              document.addEventListener('mousemove', startDrag)
              document.addEventListener('mouseup', endDrag)
            }}
          />
        </div>
      </div>

      {/* Selected time range display */}
      <div className="text-sm text-blue-600 font-medium text-center">
        Selected: {selectedStartTime}-{selectedEndTime}
      </div>
    </div>
  )
}