"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, CreditCard, Home, NotebookPen } from "lucide-react";
import { InstallAppBanner } from "./install-app-banner";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

type CustomerPortalShellProps = {
  token: string;
  projectName: string;
  customerName: string;
  children: React.ReactNode;
};

export function CustomerPortalShell({ token, projectName, customerName, children }: CustomerPortalShellProps) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: `/cn/${token}/dashboard`, label: "Tổng quan", icon: Home },
    { href: `/cn/${token}/timeline`, label: "Tiến độ", icon: ClipboardList },
    { href: `/cn/${token}/payments`, label: "Tài chính", icon: CreditCard },
    { href: `/cn/${token}/journal`, label: "Nhật ký", icon: NotebookPen },
  ];

  return (
    <div className="app-wrapper owner-portal-v2">
      <div className="bg-glow" />
      <header className="owner-app-bar">
        <div className="owner-app-title">{projectName}</div>
        <div className="owner-app-subtitle">Xin chào {customerName}</div>
      </header>
      <main className="owner-portal-main">{children}</main>
      <InstallAppBanner />
      <nav className="owner-bottom-nav" aria-label="Cổng chủ nhà">
        <div className="owner-bottom-nav-grid">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`owner-tab-btn${active ? " active" : ""}`}>
                <Icon className="mb-1 h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
