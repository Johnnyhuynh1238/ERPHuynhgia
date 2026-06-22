"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Bell, CalendarCheck2, ChevronDown, FolderOpen, LogOut, User as UserIcon } from "lucide-react";

type FrameUser = { id: string; name: string; email: string; role: string };

const TABS = [
  { href: "/ks-ql/today", label: "Hôm nay", icon: CalendarCheck2 },
  { href: "/ks-ql/projects", label: "Dự án", icon: FolderOpen },
  { href: "/ks-ql/me", label: "Tôi", icon: UserIcon },
];

function isTabActive(pathname: string, href: string) {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export function KsQlFrame({ user, children }: { user: FrameUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const initials = (user.name || user.email || "K")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#0a0c14] text-white">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-72"
        style={{
          background: "radial-gradient(80% 60% at 50% 0%, rgba(249,115,22,0.10), transparent 70%)",
        }}
      />

      <header className="sticky top-0 z-30 border-b border-[#1a1f2e] bg-[#0a0c14]/85 backdrop-blur supports-[backdrop-filter]:bg-[#0a0c14]/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/ks-ql/today" className="flex items-center gap-2.5 min-w-0">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-sm font-bold shadow-lg shadow-orange-500/30">
              KS
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-tight tracking-tight">App KS Quản Lý</div>
              <div className="truncate text-[11px] text-[#7b8499]">Huỳnh Gia · SOP 11</div>
            </div>
          </Link>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Thông báo"
              className="relative grid h-9 w-9 place-items-center rounded-full border border-[#1f2536] bg-[#131722] text-[#a0aec0] transition-colors hover:bg-[#1a1f2e] hover:text-white"
            >
              <Bell className="h-4 w-4" />
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full border border-[#1f2536] bg-[#131722] py-1 pl-1 pr-2 transition-colors hover:bg-[#1a1f2e]"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-bold">
                  {initials}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-[#7b8499]" />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-[#1f2536] bg-[#131722] shadow-2xl">
                  <div className="border-b border-[#1f2536] px-3 py-2.5">
                    <div className="truncate text-sm font-medium">{user.name}</div>
                    <div className="truncate text-xs text-[#7b8499]">{user.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-[#a0aec0] hover:bg-[#1a1f2e] hover:text-white"
                  >
                    Về ERP cũ
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#a0aec0] hover:bg-[#1a1f2e] hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                    Đăng xuất
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-28 pt-4 sm:px-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#1a1f2e] bg-[#0a0c14]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0a0c14]/80">
        <div className="mx-auto grid max-w-3xl grid-cols-3">
          {TABS.map((t) => {
            const active = isTabActive(pathname, t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-orange-400" : "text-[#7b8499] hover:text-white"
                }`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-xl transition-colors ${
                    active ? "bg-orange-500/15 text-orange-400" : ""
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
