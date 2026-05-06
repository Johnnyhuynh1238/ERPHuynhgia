"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { InstallAppBanner } from "./install-app-banner";

type NavItem = { href: string; label: string };

type CustomerPortalShellProps = {
  token: string;
  projectName: string;
  customerName: string;
  children: React.ReactNode;
};

export function CustomerPortalShell({ token, projectName, customerName, children }: CustomerPortalShellProps) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: `/cn/${token}/dashboard`, label: "Tổng quan" },
    { href: `/cn/${token}/timeline`, label: "Tiến độ" },
    { href: `/cn/${token}/payments`, label: "Tài chính" },
    { href: `/cn/${token}/journal`, label: "Nhật ký" },
  ];

  return (
    <div className="app-wrapper owner-portal-v2">
      <div className="bg-glow" />
      <header className="owner-app-bar">
        <div className="owner-app-kicker">Cổng thông tin chủ nhà</div>
        <div className="owner-app-title">{projectName}</div>
        <div className="owner-app-subtitle">Xin chào {customerName}</div>
      </header>
      <nav className="owner-tab-nav" aria-label="Cổng chủ nhà">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`owner-tab-btn${active ? " active" : ""}`}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main className="owner-portal-main">{children}</main>
      <InstallAppBanner />
    </div>
  );
}
