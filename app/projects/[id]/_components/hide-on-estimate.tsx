"use client";

import { usePathname } from "next/navigation";

// Màn Dự toán / Mua hàng / Tổng quan là tài liệu toàn màn (nền ngà, header riêng) —
// ẩn chrome tối của project layout (back-link + card tên dự án) ở các route đó.
// Với admin, màn chi tiết dự án (base /projects/[id]) = màn Tổng quan → cũng ẩn chrome.
// hideOnBase: màn base /projects/[id] cũng là tài liệu toàn màn (admin = Tổng quan,
// kế toán = màn Mua hàng ngà) → ẩn chrome tối.
export function HideOnEstimate({ children, hideOnBase = false }: { children: React.ReactNode; hideOnBase?: boolean }) {
  const pathname = usePathname();
  if (pathname && /\/(estimate|du-toan|mua-hang|cong-no|overview|tien-do)(\/|$)/.test(pathname)) return null;
  if (hideOnBase && pathname && /^\/projects\/[^/]+$/.test(pathname)) return null;
  return <>{children}</>;
}
