"use client";

import * as React from "react";

type ProgressProps = {
  value?: number;
  className?: string;
};

export function Progress({ value = 0, className = "" }: ProgressProps) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div
        className="h-full bg-[#1F4E79] transition-all"
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}
