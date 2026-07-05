"use client";

export function PrintButton({ label = "In / Lưu PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black print:hidden"
    >
      {label}
    </button>
  );
}
