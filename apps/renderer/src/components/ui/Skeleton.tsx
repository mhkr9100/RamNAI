import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

export function Skeleton({ className = '', width, height, rounded = 'lg' }: SkeletonProps) {
  const roundedClass: Record<NonNullable<SkeletonProps['rounded']>, string> = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full',
  };

  return (
    <div
      className={`animate-pulse bg-white/[0.06] ${roundedClass[rounded]} ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          className={i === lines - 1 ? 'w-3/5' : i % 2 === 0 ? 'w-full' : 'w-4/5'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-[#141720] p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton width={32} height={32} rounded="lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton height={14} className="w-1/3" />
          <Skeleton height={10} className="w-1/2" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonChatMessage({
  align = 'left',
  className = '',
}: {
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <div className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'} ${className}`}>
      <div
        className={`rounded-2xl border border-white/[0.06] p-4 space-y-2 ${
          align === 'right' ? 'w-[65%] bg-[#7c5cfc]/[0.08]' : 'w-[75%] bg-[#141720]'
        }`}
      >
        <Skeleton height={10} className="w-16" />
        <SkeletonText lines={align === 'right' ? 1 : 3} />
      </div>
    </div>
  );
}

export function SkeletonList({
  count = 4,
  className = '',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#141720] p-3"
        >
          <Skeleton width={28} height={28} rounded="lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton height={12} className={i % 2 === 0 ? 'w-2/5' : 'w-1/3'} />
            <Skeleton height={9} className="w-3/5" />
          </div>
          <Skeleton width={48} height={24} rounded="full" />
        </div>
      ))}
    </div>
  );
}
