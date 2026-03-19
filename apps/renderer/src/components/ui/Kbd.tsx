import React from 'react';

interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export function Kbd({ children, className = '' }: KbdProps) {
  return (
    <kbd
      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-[5px] border border-white/[0.12] bg-white/[0.06] px-1.5 font-mono text-[10px] font-medium text-white/45 ${className}`}
    >
      {children}
    </kbd>
  );
}

interface ShortcutProps {
  keys: string[];
  className?: string;
}

export function Shortcut({ keys, className = '' }: ShortcutProps) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {keys.map((key, i) => (
        <Kbd key={i}>{key}</Kbd>
      ))}
    </span>
  );
}
