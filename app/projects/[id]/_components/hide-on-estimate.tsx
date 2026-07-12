"use client";

import { usePathname } from "next/navigation";

// Màn Dự toán là tài liệu toàn màn (nền ngà, header riêng) — ẩn chrome tối
// của project layout (back-link + card tên dự án) ở route /estimate và /du-toan.
export function HideOnEstimate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && /\/(estimate|du-toan)(\/|$)/.test(pathname)) return null;
  return <>{children}</>;
}
