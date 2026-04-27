"use client";

import * as React from "react";

type ProgressProps = {
  value?: number;
  className?: string;
};

export function Progress({ value = 0, className = "" }: ProgressProps) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-zinc-700/70 ${className}`}>
      <div
        className="h-full bg-orange-500 transition-all duration-300 ease-out"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}
