"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  FolderKanban,
  Home,
  ListChecks,
  MoreHorizontal,
  Receipt,
  Settings,
  Target,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";

type AppUser = {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
};

type MenuItem = {
  label: string;
  href: string;
};

const ROLE_MENUS: Record<string, MenuItem[]> = {
  admin: [
    { label: "Dashboard", href: "/" },
    { label: "Dự án", href: "/projects" },
    { label: "Thầu phụ", href: "/subcontractors" },
    { label: "HĐ thầu phụ", href: "/sub-contracts" },
    { label: "Chi thầu phụ", href: "/sub-payments" },
    { label: "Báo cáo", href: "/reports" },
    { label: "KPI tổng", href: "/admin/kpi" },
    { label: "Cài đặt KPI", href: "/admin/kpi-settings" },
    { label: "Lương KS", href: "/admin/engineers/salary" },
    { label: "Việc TPTC", href: "/tptc/assignments" },
    { label: "Chấm Đóng góp", href: "/tptc/contribution-rating" },
    { label: "User", href: "/admin/users" },
    { label: "Template", href: "/admin/templates" },
    { label: "Chuyên môn", href: "/admin/specialties" },
    { label: "Tiêu chí TP", href: "/admin/evaluation-criteria" },
  ],
  engineer: [
    { label: "Dashboard", href: "/" },
    { label: "Dự án của tôi", href: "/projects" },
    { label: "Nhiệm Vụ", href: "/reports" },
    { label: "KPI/Lương", href: "/me/kpi" },
  ],
  foreman: [
    { label: "Dashboard", href: "/" },
    { label: "Công việc của đội", href: "/projects" },
    { label: "Thầu phụ", href: "/subcontractors" },
  ],
  accountant: [
    { label: "Dashboard", href: "/" },
    { label: "Dự án", href: "/projects" },
    { label: "Thầu phụ", href: "/subcontractors" },
    { label: "HĐ thầu phụ", href: "/sub-contracts" },
    { label: "Chi thầu phụ", href: "/sub-payments" },
    { label: "Thanh toán", href: "/payments" },
    { label: "KPI tổng", href: "/admin/kpi" },
  ],
  construction_manager: [
    { label: "Dashboard", href: "/" },
    { label: "Dự án", href: "/projects" },
    { label: "Thầu phụ", href: "/subcontractors" },
    { label: "HĐ thầu phụ", href: "/sub-contracts" },
    { label: "Báo cáo", href: "/reports" },
    { label: "KPI của tôi", href: "/my-kpi" },
    { label: "Việc TPTC", href: "/tptc/assignments" },
    { label: "Chấm Đóng góp", href: "/tptc/contribution-rating" },
    { label: "KPI tổng", href: "/admin/kpi" },
    { label: "Chuyên môn", href: "/admin/specialties" },
    { label: "Tiêu chí TP", href: "/admin/evaluation-criteria" },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  construction_manager: "TPTC",
  engineer: "Kỹ sư",
  foreman: "Foreman",
  accountant: "Kế toán",
};

export function getInitials(name?: string | null) {
  const words = (name || "User")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "U";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function navIcon(href: string, label: string) {
  if (href === "/") return Home;
  if (href.includes("projects")) return FolderKanban;
  if (href.includes("reports")) return BarChart3;
  if (href.includes("tasks")) return ListChecks;
  if (href.includes("kpi")) return Target;
  if (href.includes("users")) return Users;
  if (href.includes("templates")) return Settings;
  if (href.includes("payments")) return Receipt;
  if (href.includes("subcontractors")) return Users;
  if (label.toLowerCase().includes("kpi")) return Target;
  return Home;
}

export function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [openMore, setOpenMore] = useState(false);

  const menus = useMemo(() => {
    return ROLE_MENUS[user.role] ?? [{ label: "Dashboard", href: "/" }];
  }, [user.role]);

  const primaryMenus = menus.slice(0, 4);
  const moreMenus = menus.slice(4);
  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const pageTitle = menus.find((item) => isActive(pathname, item.href))?.label || "Dashboard";

  const displayName = user.name || user.email || "Người dùng";

  return (
    <div className="app-wrapper min-h-screen bg-[var(--bg)] md:max-w-none">
      <div className="bg-glow" />

      <aside className="hidden md:fixed md:left-0 md:top-0 md:z-50 md:flex md:h-screen md:w-60 md:flex-col md:border-r md:border-[#252840] md:bg-[#13151f]">
        <div className="border-b border-[#252840] p-5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/a6-logo.png" alt="A6" className="h-10 w-10 object-contain" />
            <div className="min-w-0">
              <div className="text-base font-bold text-[#f97316] leading-tight">Huỳnh Gia ERP</div>
              <div className="mt-0.5 text-xs text-[#8892b0]">{roleLabel}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {menus.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = navIcon(item.href, item.label);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-[#f97316]/20 text-[#fb923c]"
                    : "text-[#8892b0] hover:bg-[#1a1d2e] hover:text-[#f0f2ff]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-[#252840] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#f97316] text-sm font-bold text-black">
              {getInitials(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[#f0f2ff]">{displayName}</div>
              <div className="truncate text-xs text-[#8892b0]">{roleLabel}</div>
            </div>
            <Link href="/profile" className="text-lg text-[#8892b0] hover:text-[#f0f2ff]">
              ⚙
            </Link>
          </div>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center justify-center rounded-xl bg-red-500/20 px-3 py-2 text-sm font-medium text-red-300"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="relative z-10 md:ml-60 md:min-h-screen">
        <header className="sticky top-0 z-30 border-b border-[#252840] bg-[#0f1015]/90 backdrop-blur-xl md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/a6-logo.png" alt="A6" className="h-8 w-8 object-contain" />
              <div>
                <div className="text-sm font-bold text-[#f0f2ff]">ERP Huỳnh Gia</div>
                <div className="text-[11px] text-[#8892b0]">{user.role}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <NotificationsBell
                apiBase="/api/notifications"
                listHref="/notifications"
                triggerClassName="relative rounded-full border border-[#2d3249] bg-[#1a1d2e] p-2 text-[#d9def3]"
              />

              <Link href="/profile" className="flex items-center gap-2 rounded-full bg-[#1a1d2e] px-2 py-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f97316] text-xs font-bold text-black">
                  {getInitials(user.name)}
                </span>
                <span className="max-w-[120px] truncate text-xs text-[#f0f2ff]">{displayName}</span>
              </Link>
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-40 hidden items-center justify-between border-b border-[#252840] bg-[#0f1015]/90 px-6 py-4 backdrop-blur-xl md:flex">
          <h1 className="text-lg font-bold text-[#f0f2ff]">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <NotificationsBell apiBase="/api/notifications" listHref="/notifications" />
          </div>
        </div>

        <div className="min-h-[calc(100vh-56px)] px-4 pb-24 pt-4 md:p-6 md:pb-6 md:pt-6">
          <div key={pathname} className="slide-up">
            {children}
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-[#252840] bg-[#13151f]/96 px-2 pb-2 pt-2 backdrop-blur-xl md:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${primaryMenus.length + (moreMenus.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}>
          {primaryMenus.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = navIcon(item.href, item.label);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center rounded-xl px-2 py-2 text-[10px] font-medium ${
                  active ? "bg-[#f97316]/20 text-[#fb923c]" : "text-[#8892b0]"
                }`}
              >
                <Icon className="mb-1 h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          {moreMenus.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpenMore(true)}
              className={`flex flex-col items-center justify-center rounded-xl px-2 py-2 text-[10px] font-medium ${
                openMore ? "bg-[#f97316]/20 text-[#fb923c]" : "text-[#8892b0]"
              }`}
            >
              <MoreHorizontal className="mb-1 h-4 w-4" />
              <span>Thêm</span>
            </button>
          ) : null}
        </div>
      </nav>

      {openMore ? (
        <div className="fixed inset-0 z-50 bg-black/60 md:hidden">
          <button type="button" className="h-full w-full" aria-label="Đóng" onClick={() => setOpenMore(false)} />
          <div className="absolute bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 rounded-t-2xl border border-[#252840] bg-[#13151f] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-[#f0f2ff]">Menu</div>
              <Button variant="outline" size="sm" onClick={() => setOpenMore(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              {moreMenus.map((item) => {
                const Icon = navIcon(item.href, item.label);
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpenMore(false)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                      active ? "bg-[#f97316]/20 text-[#fb923c]" : "bg-[#1a1d2e] text-[#f0f2ff]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <Link
                href="/profile"
                onClick={() => setOpenMore(false)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                  pathname.startsWith("/profile") ? "bg-[#f97316]/20 text-[#fb923c]" : "bg-[#1a1d2e] text-[#f0f2ff]"
                }`}
              >
                <User className="h-4 w-4" />
                <span>Hồ sơ của tôi</span>
              </Link>

              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center justify-center rounded-xl bg-red-500/20 px-3 py-2 text-sm font-medium text-red-300"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
