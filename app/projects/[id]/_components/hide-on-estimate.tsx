"use client";

import { usePathname } from "next/navigation";

// Màn Dự toán là tài liệu toàn màn (nền ngà, header riêng) — ẩn chrome tối
// của project layout (back-link + card tên dự án) khi ở route /estimate.
export function HideOnEstimate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && /\/estimate(\/|$)/.test(pathname)) return null;
  return <>{children}</>;
}
