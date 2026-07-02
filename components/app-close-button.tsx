"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function AppCloseButton({
  userRole,
  fallback,
  className = "",
}: {
  userRole: string;
  fallback?: string;
  className?: string;
}) {
  const router = useRouter();
  const target =
    fallback ?? (userRole === "accountant" ? "/ketoan" : "/admin/dashboard");
  return (
    <button
      type="button"
      onClick={() => router.push(target)}
      aria-label="Đóng"
      title="Đóng"
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-[#2d3249] bg-[#1a1d2e] text-[#d9def3] transition hover:border-[#f97316]/60 hover:text-[#fb923c] ${className}`}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
