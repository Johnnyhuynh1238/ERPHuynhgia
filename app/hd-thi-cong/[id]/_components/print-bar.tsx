"use client";

import Link from "next/link";
import { useEffect } from "react";

// Mở từ nút "In cho giám sát" (?in=1) → tự bật hộp thoại in.
export function PrintBar({ backHref, label }: { backHref: string; label: string }) {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("in") !== "1") return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="cg-bar">
      <Link href={backHref} className="cg-back">
        ‹ {label}
      </Link>
      <button type="button" className="cg-print" onClick={() => window.print()}>
        In tài liệu
      </button>
    </div>
  );
}
