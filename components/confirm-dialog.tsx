"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

type ConfirmOptions = {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
};

type Pending = Required<Pick<ConfirmOptions, "message">> &
  ConfirmOptions & { resolve: (ok: boolean) => void };

let pushPending: ((p: Pending) => void) | null = null;

/**
 * Thay thế window.confirm — trả Promise<boolean>, UI dark-theme đồng bộ app.
 * Dùng: `if (!(await confirmDialog("Xoá mục này?"))) return;`
 * Fallback về window.confirm nếu ConfirmHost chưa mount (an toàn tuyệt đối).
 */
export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === "string" ? { message: opts } : opts;
  if (!pushPending) {
    return Promise.resolve(window.confirm(o.message));
  }
  return new Promise<boolean>((resolve) => pushPending!({ ...o, resolve }));
}

/** Mount 1 lần ở root layout. */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    pushPending = (p) => {
      setPending((cur) => {
        // Đang có dialog khác → từ chối cái mới để tránh chồng
        if (cur) {
          p.resolve(false);
          return cur;
        }
        return p;
      });
    };
    return () => {
      pushPending = null;
    };
  }, []);

  useEffect(() => {
    if (pending) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function close(ok: boolean) {
    if (!pending) return;
    pending.resolve(ok);
    setVisible(false);
    setTimeout(() => setPending(null), 150);
  }

  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      onClick={() => close(false)}
    >
      <div
        className="absolute inset-0 transition-opacity duration-150"
        style={{
          background: "rgba(11,13,22,0.62)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: visible ? 1 : 0,
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-[#252840] bg-[#13151f] p-4 shadow-2xl transition-all duration-150"
        style={{
          transform: visible ? "scale(1)" : "scale(0.92)",
          opacity: visible ? 1 : 0,
        }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            {pending.title ? (
              <div className="mb-1 text-[15px] font-bold text-[#f0f2ff]">{pending.title}</div>
            ) : null}
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#cfd4e8]">
              {pending.message}
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="flex-1 rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-4 py-2.5 text-sm font-semibold text-[#8892b0] transition hover:bg-[#252840]"
          >
            {pending.cancelText ?? "Huỷ"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className="flex-1 rounded-xl bg-[#ff8a3d] px-4 py-2.5 text-sm font-bold text-[#1a120a] transition hover:bg-[#fb923c]"
          >
            {pending.confirmText ?? "Xác nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}
