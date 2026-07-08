import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AppShell } from "@/components/app-shell";

// Server component dùng để bọc các route cần đăng nhập
export async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const impersonatedBy = (user as { impersonatedBy?: { id: string; name: string } }).impersonatedBy;

  return (
    <AppShell
      user={{
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
      }}
    >
      {impersonatedBy ? (
        <div className="sticky top-0 z-[70] mb-3 flex items-center justify-between gap-3 rounded-xl border-2 border-orange-500/60 bg-orange-500/15 px-3 py-2">
          <span className="text-sm font-semibold text-orange-300">
            👁 Đang xem như {user.name} — thao tác sẽ đứng tên user này
          </span>
          <form action="/api/admin/impersonate/exit" method="POST">
            <button
              type="submit"
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-black"
            >
              Thoát
            </button>
          </form>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
