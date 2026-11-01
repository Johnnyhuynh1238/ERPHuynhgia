"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SubLogoutButton() {
  return (
    <button
      type="button"
      aria-label="Đăng xuất"
      onClick={() => {
        if (window.confirm("Đăng xuất khỏi app?")) signOut({ callbackUrl: "/login" });
      }}
      className="inline-flex items-center gap-1.5 rounded-full bg-[#1a1d2e] px-3 py-2 text-sm font-medium text-[#f0f2ff] hover:bg-[#2a1518] hover:text-[#f87171]"
    >
      <LogOut className="h-4 w-4" />
      Thoát
    </button>
  );
}
