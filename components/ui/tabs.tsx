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
        active ? "border-[#1F4E79] bg-[#1F4E79] text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"
      } ${className}`}
    >
      {children}
    </span>
  );
}
