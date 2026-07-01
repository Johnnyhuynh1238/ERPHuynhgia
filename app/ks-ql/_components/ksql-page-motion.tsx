"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export function KsQlPageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="ksql-route-in">
      {children}
    </div>
  );
}
