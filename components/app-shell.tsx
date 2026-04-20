"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";
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
    { label: "Hồ sơ", href: "/profile" },
    { label: "Dự án", href: "/projects" },
    { label: "User", href: "/admin/users" },
    { label: "Template", href: "/templates" },
  ],
  engineer: [
    { label: "Dashboard", href: "/" },
    { label: "Hồ sơ", href: "/profile" },
    { label: "Dự án của tôi", href: "/projects" },
  ],
  foreman: [
    { label: "Dashboard", href: "/" },
    { label: "Hồ sơ", href: "/profile" },
    { label: "Công việc của đội", href: "/projects" },
  ],
  accountant: [
    { label: "Dashboard", href: "/" },
    { label: "Hồ sơ", href: "/profile" },
    { label: "Dự án", href: "/projects" },
    { label: "Thanh toán", href: "/payments" },
  ],
};

export function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const [openSidebar, setOpenSidebar] = useState(false);

  const menus = useMemo(() => {
    return ROLE_MENUS[user.role] ?? [{ label: "Dashboard", href: "/" }];
  }, [user.role]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="md:hidden"
              onClick={() => setOpenSidebar((v) => !v)}
            >
              Menu
            </Button>
            <div className="font-semibold text-[#1F4E79]">ERP Huỳnh Gia</div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right md:block">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">{user.role}</div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 md:grid-cols-[240px_1fr]">
        <aside
          className={`border-r border-slate-200 bg-white p-3 md:block ${
            openSidebar ? "block" : "hidden"
          }`}
        >
          <nav className="space-y-1">
            {menus.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpenSidebar(false)}
                className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/dev-smoke-test"
              onClick={() => setOpenSidebar(false)}
              className="block rounded-md px-3 py-2 text-xs text-slate-500 hover:bg-slate-100"
            >
              Dev smoke test
            </Link>
          </nav>
        </aside>

        <main className="min-h-[calc(100vh-56px)] p-4 md:p-6">{children}</main>
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-2 text-center text-xs text-slate-500">
        © 2026 ERP Huỳnh Gia · version 0.1.0
      </footer>
    </div>
  );
}
