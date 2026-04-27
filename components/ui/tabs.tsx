"use client";

import * as React from "react";

type TabsProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

export function Tabs({ value: _value, children, className = "" }: TabsProps) {
  return <div className={className}>{children}</div>;
}

export function TabsList({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`inline-flex flex-wrap gap-2 ${className}`}>{children}</div>;
}

export function TabsTrigger({
  children,
  active,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`rounded-md border px-3 py-2 text-sm transition ${
        active
          ? "border-orange-400/70 bg-orange-500/20 text-orange-100 shadow-[0_0_0_1px_rgba(249,115,22,0.28)]"
          : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
      } ${className}`}
    >
      {children}
    </span>
  );
}
