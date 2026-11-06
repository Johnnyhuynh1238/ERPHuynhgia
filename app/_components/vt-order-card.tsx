"use client";

import { useEffect, useState } from "react";
import { Package } from "lucide-react";

// Card "ĐẶT VẬT TƯ" (SOP-26, kênh dự phòng khi Zalo hỏng): mở màn /vt/ks/ do máy vật tư
// (ai-office vt-web, nginx /vt/) phục vụ — ngoài Next.js nên dùng <a>, không dùng <Link>.
// Card hiện ngay; số "N việc" hiện thêm khi api trả về. Chỉ ẩn khi tài khoản không có
// dự án đặt vật tư (api trả 401/403).
export function VtOrderCard({
  projectId,
  variant = "dashboard",
}: {
  projectId?: string;
  variant?: "dashboard" | "ksql";
}) {
  const [so, setSo] = useState<number | null>(null);
  const [an, setAn] = useState(false);

  useEffect(() => {
    let huy = false;
    fetch("/vt/ks/api/dem", { credentials: "same-origin", cache: "no-store" })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          if (!huy) setAn(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (!huy && d && typeof d.so === "number") setSo(d.so);
      })
      .catch(() => {});
    return () => {
      huy = true;
    };
  }, []);

  if (an) return null;
  const href = projectId ? `/vt/ks/#da=${projectId}` : "/vt/ks/";
  const badge =
    so ? (
      <span className="rounded-full bg-[#ff8a3d] px-2 py-0.5 text-xs font-bold text-[#1a1d2e]">
        {so} việc
      </span>
    ) : null;

  if (variant === "ksql")
    return (
      <a href={href} className="block">
        <div className="ksql-tap flex w-full items-center gap-4 rounded-2xl border-2 border-[#ff8a3d]/40 bg-[#1a1d2e] px-5 py-6 text-left hover:border-[#ff8a3d]">
          <div className="shrink-0 text-orange-300">
            <Package className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xl font-bold text-[#f0f2ff]">
              ĐẶT VẬT TƯ
              {badge}
            </div>
            <div className="mt-1 text-sm text-[#8892b0]">Đề xuất · KH tuần · Tải PO · Nhận hàng</div>
          </div>
        </div>
      </a>
    );

  return (
    <a
      href={href}
      className="flex items-center gap-4 rounded-xl border-2 border-orange-300 bg-orange-50 px-4 py-4 transition hover:border-orange-500"
    >
      <Package className="h-8 w-8 shrink-0 text-orange-600" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900">
          ĐẶT VẬT TƯ
          {badge}
        </div>
        <div className="text-sm text-slate-600">Đề xuất · KH tuần · Tải PO · Nhận hàng</div>
      </div>
    </a>
  );
}
