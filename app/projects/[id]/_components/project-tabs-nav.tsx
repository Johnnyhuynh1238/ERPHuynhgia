"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabItem = {
  label: string;
  href: string;
};

export function ProjectTabsNav({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-xl border px-3 py-2 text-center text-xs font-medium transition ${
              active
                ? "border-[#f97316] bg-[#f97316]/20 text-[#fb923c]"
                : "border-[#2d3249] bg-[#13151f] text-[#8892b0]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
