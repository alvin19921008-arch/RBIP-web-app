import React from 'react'

interface UserGearIconProps {
  className?: string
}

// User-gear icon combining user silhouette with gear/settings icon
export function UserGearIcon({ className }: UserGearIconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 256 256"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* User icon - left side */}
      <circle cx="80" cy="80" r="32" />
      <path d="M16,224a64,64,0,0,1,128,0" />
      
      {/* Gear icon - right side, overlapping */}
      <circle cx="176" cy="80" r="40" fill="none" />
      <circle cx="176" cy="80" r="28" fill="none" />
      <line x1="176" y1="40" x2="176" y2="20" />
      <line x1="176" y1="140" x2="176" y2="160" />
      <line x1="216" y1="80" x2="236" y2="80" />
      <line x1="136" y1="80" x2="116" y2="80" />
      <line x1="198.627" y1="41.373" x2="210.627" y2="29.373" />
      <line x1="153.373" y1="118.627" x2="141.373" y2="130.627" />
      <line x1="198.627" y1="118.627" x2="210.627" y2="130.627" />
      <line x1="153.373" y1="41.373" x2="141.373" y2="29.373" />
    </svg>
  )
}
