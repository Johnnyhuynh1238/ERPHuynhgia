import { getCurrentUser } from "@/lib/auth-helpers";

// Banner "đang đóng vai" — render ở root layout để hiện trên MỌI trang
// (kể cả trang không dùng ProtectedLayout như /ks-ql, /reports).
export async function ImpersonationBanner() {
  const user = await getCurrentUser().catch(() => null);
  const impersonatedBy = (user as { impersonatedBy?: { id: string; name: string } } | null)?.impersonatedBy;
  if (!user || !impersonatedBy) return null;

  return (
    <div className="sticky top-0 z-[80] flex items-center justify-between gap-3 border-b-2 border-orange-500 bg-[#2a1a08] px-3 py-2">
      <span className="min-w-0 truncate text-sm font-semibold text-orange-300">
        👁 Đang xem như {user.name}
      </span>
      <a
        href="/api/admin/impersonate/exit"
        className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-black"
      >
        Thoát vai
      </a>
    </div>
  );
}
