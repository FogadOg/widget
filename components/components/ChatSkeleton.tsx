'use client';

import React from 'react';

// Simple chat skeleton loader. Skeleton color is derived from the configured
// text color so it stays visible on dark/branded backgrounds.
export function ChatSkeleton({ skeletonColor }: { skeletonColor: string }) {
  return (
    <div className="flex flex-col gap-4 p-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          <div className="h-6 w-2/3 rounded-lg" style={{ minWidth: 120, backgroundColor: skeletonColor }} />
        </div>
      ))}
    </div>
  );
}
