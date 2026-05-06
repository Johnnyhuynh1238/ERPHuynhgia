"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, CreditCard, Home, NotebookPen } from "lucide-react";
import { InstallAppBanner } from "./install-app-banner";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

export function CustomerPortalShell({ token, children }: { token: string; children: React.ReactNode }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: `/cn/${token}/dashboard`, label: "Tổng quan", icon: Home },
    { href: `/cn/${token}/timeline`, label: "Tiến độ", icon: ClipboardList },
    { href: `/cn/${token}/payments`, label: "Tài chính", icon: CreditCard },
    { href: `/cn/${token}/journal`, label: "Nhật ký", icon: NotebookPen },
  ];

  return (
    <div className="app-wrapper">
      <div className="bg-glow" />
      <main className="relative z-10 min-h-[calc(100vh-56px)] px-4 pb-24 pt-4">{children}</main>
      <InstallAppBanner />
      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-[#252840] bg-[#13151f]/96 px-2 pb-2 pt-2 backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
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
        </div>
      </nav>
    </div>
  );
}
