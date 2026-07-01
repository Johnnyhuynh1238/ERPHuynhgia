"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function KetoanBackButton({
  fallback = "/ketoan",
  label = "Quay lại",
  className = "",
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-xs text-[#f0f2ff] transition hover:border-orange-400 ${className}`}
    >
      <ArrowLeft className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
