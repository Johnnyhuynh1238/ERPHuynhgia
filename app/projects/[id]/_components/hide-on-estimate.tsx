"use client";

import { usePathname } from "next/navigation";

// Màn Dự toán / Mua hàng / Tổng quan là tài liệu toàn màn (nền ngà, header riêng) —
// ẩn chrome tối của project layout (back-link + card tên dự án) ở các route đó.
// Với admin, màn chi tiết dự án (base /projects/[id]) = màn Tổng quan → cũng ẩn chrome.
export function HideOnEstimate({ children, isAdmin = false }: { children: React.ReactNode; isAdmin?: boolean }) {
  const pathname = usePathname();
  if (pathname && /\/(estimate|du-toan|mua-hang|cong-no|overview)(\/|$)/.test(pathname)) return null;
  if (isAdmin && pathname && /^\/projects\/[^/]+$/.test(pathname)) return null;
  return <>{children}</>;
}
