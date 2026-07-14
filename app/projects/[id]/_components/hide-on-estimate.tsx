"use client";

import { usePathname } from "next/navigation";

// Màn Dự toán / Mua hàng là tài liệu toàn màn (nền ngà, header riêng) — ẩn chrome
// tối của project layout (back-link + card tên dự án) ở các route đó.
export function HideOnEstimate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && /\/(estimate|du-toan|mua-hang|cong-no|overview)(\/|$)/.test(pathname)) return null;
  return <>{children}</>;
}
