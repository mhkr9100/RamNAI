import React from 'react';

export function AssistantIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M12 3L2 21H22L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.05"
      />
    </svg>
  );
}
