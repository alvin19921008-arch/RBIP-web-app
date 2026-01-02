import React from 'react'

interface UserGearIconProps {
  className?: string
}

// SPT icon: person with shoulder badges
export function UserGearIcon({ className }: UserGearIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Head */}
      <circle cx="12" cy="7" r="5" />

      {/* Neck */}
      <path d="M12 12v3" />

      {/* Curved upper body (shoulders and chest) */}
      <path d="M6 19c2-4 8-4 12 0" />

      {/* Left shoulder badge - filled */}
      <rect x="3.5" y="15.5" width="4" height="1" rx="1" fill="currentColor" />

      {/* Right shoulder badge - filled */}
      <rect x="16" y="15.5" width="4" height="1" rx="1" fill="currentColor" />
    </svg>
  )
}
