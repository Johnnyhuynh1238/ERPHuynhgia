"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabItem = {
  label: string;
  href: string;
};

export function ProjectTabsNav({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();
  const active = tabs.find((t) => pathname === t.href)?.href || tabs[0]?.href || "";

  return (
    <Tabs value={active}>
      <TabsList>
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href}>
            <TabsTrigger active={tab.href === active}>{tab.label}</TabsTrigger>
          </Link>
        ))}
      </TabsList>
    </Tabs>
  );
}
