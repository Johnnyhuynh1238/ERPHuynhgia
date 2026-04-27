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
  MessageSquare,
  MoreHorizontal,
  Receipt,
  Settings,
  Target,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
    { label: "Báo cáo", href: "/reports" },
    { label: "KPI tổng", href: "/admin/kpi" },
    { label: "User", href: "/admin/users" },
    { label: "Template", href: "/admin/templates" },
    { label: "Chuyên môn", href: "/admin/specialties" },
    { label: "Tiêu chí TP", href: "/admin/evaluation-criteria" },
  ],
  engineer: [
    { label: "Dashboard", href: "/" },
    { label: "Dự án của tôi", href: "/projects" },
    { label: "Thầu phụ", href: "/subcontractors" },
    { label: "Báo cáo", href: "/reports" },
    { label: "KPI của tôi", href: "/my-kpi" },
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
    { label: "Thanh toán", href: "/payments" },
    { label: "KPI tổng", href: "/admin/kpi" },
  ],
  construction_manager: [
    { label: "Dashboard", href: "/" },
    { label: "Dự án", href: "/projects" },
    { label: "Thầu phụ", href: "/subcontractors" },
    { label: "Báo cáo", href: "/reports" },
    { label: "KPI của tôi", href: "/my-kpi" },
    { label: "KPI tổng", href: "/admin/kpi" },
    { label: "Chuyên môn", href: "/admin/specialties" },
    { label: "Tiêu chí TP", href: "/admin/evaluation-criteria" },
  ],
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
  const [commentUnread, setCommentUnread] = useState(0);

  const menus = useMemo(() => {
    return ROLE_MENUS[user.role] ?? [{ label: "Dashboard", href: "/" }];
  }, [user.role]);

  const primaryMenus = menus.slice(0, 4);
  const moreMenus = menus.slice(4);

  const displayName = user.name || user.email || "Người dùng";
  const canViewCommentInbox = ["admin", "construction_manager", "engineer"].includes(user.role);

  useEffect(() => {
    if (!canViewCommentInbox) return;

    let stop = false;
    const run = async () => {
      const res = await fetch("/api/customer-comments/unread-count", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!stop && res.ok) {
        setCommentUnread(Number(json.count || 0));
      }
    };

    run();
    const timer = setInterval(run, 30000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [canViewCommentInbox]);

  return (
    <div className="app-wrapper">
      <div className="bg-glow" />

      <header className="sticky top-0 z-30 border-b border-[#252840] bg-[#0f1015]/90 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-4">
          <div>
            <div className="text-sm font-bold text-[#f0f2ff]">ERP Huỳnh Gia</div>
            <div className="text-[11px] text-[#8892b0]">{user.role}</div>
          </div>

          <div className="flex items-center gap-2">
            {canViewCommentInbox ? (
              <Link href="/projects" className="relative rounded-full border border-[#2d3249] bg-[#1a1d2e] p-2 text-[#d9def3]">
                <MessageSquare className="h-4 w-4" />
                {commentUnread > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[#f97316] px-1 text-[10px] font-bold text-black">
                    {commentUnread > 99 ? "99+" : commentUnread}
                  </span>
                ) : null}
              </Link>
            ) : null}

            <Link href="/profile" className="flex items-center gap-2 rounded-full bg-[#1a1d2e] px-2 py-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f97316] text-xs font-bold text-black">
                {getInitials(user.name)}
              </span>
              <span className="max-w-[120px] truncate text-xs text-[#f0f2ff]">{displayName}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-[calc(100vh-56px)] px-4 pb-24 pt-4">
        <div key={pathname} className="slide-up">{children}</div>
      </main>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-[#252840] bg-[#13151f]/96 px-2 pb-2 pt-2 backdrop-blur-xl">
        <div className="grid grid-cols-5 gap-1">
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
        </div>
      </nav>

      {openMore ? (
        <div className="fixed inset-0 z-50 bg-black/60">
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
