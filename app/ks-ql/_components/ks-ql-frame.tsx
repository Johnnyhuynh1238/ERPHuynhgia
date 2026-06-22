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

  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => isTabActive(pathname, t.href)),
  );

  return (
    <div className="min-h-screen bg-[#0d0b09] text-[#f5ede4]">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-72"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 0%, rgba(224,184,85,0.12), rgba(210,122,82,0.06) 40%, transparent 70%)",
        }}
      />

      <header className="sticky top-0 z-30 border-b border-[#2a221c] bg-[#0d0b09]/85 backdrop-blur supports-[backdrop-filter]:bg-[#0d0b09]/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/ks-ql/today" className="flex items-center gap-2.5 min-w-0">
            <span
              className="grid h-9 w-9 place-items-center rounded-xl text-sm font-bold text-[#1a120a] shadow-lg shadow-[#D27A52]/30 transition-transform hover:scale-105"
              style={{ background: "linear-gradient(135deg, #E0B855 0%, #D27A52 100%)" }}
            >
              KS
            </span>
            <div className="min-w-0">
              <div
                className="truncate text-[15px] font-semibold leading-tight tracking-tight"
                style={{
                  background: "linear-gradient(90deg, #f5ede4 0%, #E0B855 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                App KS Quản Lý
              </div>
              <div className="truncate text-[11px] text-[#9a8f80]">Huỳnh Gia · SOP 11</div>
            </div>
          </Link>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Thông báo"
              className="relative grid h-9 w-9 place-items-center rounded-full border border-[#2a221c] bg-[#181410] text-[#d4c8b8] transition-all hover:scale-105 hover:border-[#E0B855]/40 hover:bg-[#221b15] hover:text-[#f5ede4]"
            >
              <Bell className="h-4 w-4" />
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full border border-[#2a221c] bg-[#181410] py-1 pl-1 pr-2 transition-all hover:border-[#E0B855]/40 hover:bg-[#221b15]"
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-[#0d0b09]"
                  style={{ background: "linear-gradient(135deg, #6FA677 0%, #4d8a6b 100%)" }}
                >
                  {initials}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-[#9a8f80] transition-transform duration-200 ${
                    menuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-[#2a221c] bg-[#181410] shadow-2xl transition-all duration-200 ${
                  menuOpen
                    ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none -translate-y-1 scale-95 opacity-0"
                }`}
              >
                <div className="border-b border-[#2a221c] px-3 py-2.5">
                  <div className="truncate text-sm font-medium text-[#f5ede4]">{user.name}</div>
                  <div className="truncate text-xs text-[#9a8f80]">{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-[#d4c8b8] transition-colors hover:bg-[#221b15] hover:text-[#f5ede4]"
                >
                  Về ERP cũ
                </button>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#d4c8b8] transition-colors hover:bg-[#221b15] hover:text-[#f5ede4]"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-28 pt-4 sm:px-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#2a221c] bg-[#0d0b09]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0d0b09]/80">
        <div className="relative mx-auto grid max-w-3xl grid-cols-3">
          <div
            className="pointer-events-none absolute left-0 top-0 h-full transition-transform duration-300 ease-out"
            style={{
              width: "33.333%",
              transform: `translateX(${activeIndex * 100}%)`,
              background:
                "radial-gradient(60% 70% at 50% 100%, rgba(224,184,85,0.18), rgba(210,122,82,0.08) 50%, transparent 80%)",
            }}
          />
          {TABS.map((t) => {
            const active = isTabActive(pathname, t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`relative flex flex-col items-center gap-0.5 px-2 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-[#E0B855]" : "text-[#9a8f80] hover:text-[#f5ede4]"
                }`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-xl transition-all ${
                    active ? "scale-110" : "scale-100"
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
