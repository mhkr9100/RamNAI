import React from 'react';

export function UserMapIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="6" r="3" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="M10.5 8.5 L7 15.5" />
      <path d="M13.5 8.5 L17 15.5" />
      <path d="M7.5 18 L16.5 18" strokeDasharray="2 2" />
    </svg>
  );
}
