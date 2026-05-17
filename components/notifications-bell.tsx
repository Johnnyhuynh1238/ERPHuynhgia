"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2 } from "lucide-react";

type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string;
  actorName: string | null;
  isRead: boolean;
  createdAt: string;
  projectId?: string | null;
  refType?: string | null;
  refId?: string | null;
};

type FetchListResult = {
  items: NotificationItem[];
  nextCursor: string | null;
};

type NotificationsBellProps = {
  /** Base API path, e.g. "/api/notifications" or "/api/customer/<token>/notifications" */
  apiBase: string;
  /** Where the "Xem tất cả" link points to */
  listHref: string;
  /** ms between unread-count polls */
  pollMs?: number;
  /** Optional className override for the trigger button */
  triggerClassName?: string;
  /** Hide the trigger entirely if not applicable */
  hidden?: boolean;
};

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = Math.max(0, Date.now() - d.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày trước`;
  return d.toLocaleDateString("vi-VN");
}

export function NotificationsBell({
  apiBase,
  listHref,
  pollMs = 30000,
  triggerClassName,
  hidden = false,
}: NotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/unread-count`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setUnread(Number(json.count || 0));
    } catch {}
  }, [apiBase]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}?take=10`, { cache: "no-store" });
      if (!res.ok) return;
      const json: FetchListResult = await res.json();
      setItems(json.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (hidden) return;
    fetchUnread();
    const t = setInterval(fetchUnread, pollMs);
    return () => clearInterval(t);
  }, [fetchUnread, pollMs, hidden]);

  useEffect(() => {
    if (!open) return;
    fetchList();
  }, [open, fetchList]);

  useEffect(() => {
    if (!open) return;

    const measure = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const top = rect.bottom + 8;

      if (vw < 768) {
        // Mobile: full-width centered with 8px side padding, anchored under bell
        setPopoverStyle({
          position: "fixed",
          top,
          left: 8,
          right: 8,
          width: "auto",
          maxWidth: "none",
        });
      } else {
        // Desktop: right edge aligned to bell's right edge, but kept inside viewport
        const desiredWidth = 360;
        const rightOffset = Math.max(8, vw - rect.right);
        setPopoverStyle({
          position: "fixed",
          top,
          right: rightOffset,
          width: desiredWidth,
          maxWidth: `calc(100vw - ${rightOffset + 8}px)`,
        });
      }
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markOneRead = useCallback(
    async (id: string) => {
      try {
        await fetch(`${apiBase}/${id}/read`, { method: "POST" });
      } catch {}
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
    },
    [apiBase],
  );

  const markAll = useCallback(async () => {
    setMarking(true);
    try {
      await fetch(`${apiBase}/read-all`, { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } finally {
      setMarking(false);
    }
  }, [apiBase]);

  if (hidden) return null;

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div className="relative">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Thông báo"
        className={
          triggerClassName ??
          "relative flex h-9 w-9 items-center justify-center rounded-xl border border-[#2d3249] bg-[#1a1d2e] text-base text-[#d9def3]"
        }
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[#f97316] px-1 text-[10px] font-bold text-black">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="z-50 overflow-hidden rounded-2xl border border-[#252840] bg-[#13151f] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[#252840] px-3 py-2">
            <div className="text-sm font-semibold text-[#f0f2ff]">Thông báo</div>
            <button
              type="button"
              onClick={markAll}
              disabled={marking || unread === 0}
              className="text-xs font-medium text-[#fb923c] disabled:opacity-50"
            >
              {marking ? "Đang xử lý..." : "Đánh dấu đã đọc"}
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-[#8892b0]">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#8892b0]">Chưa có thông báo</div>
            ) : (
              <ul className="divide-y divide-[#252840]">
                {items.map((n) => (
                  <li key={n.id} className={n.isRead ? "" : "bg-[#1a1d2e]"}>
                    <Link
                      href={n.link || "#"}
                      onClick={() => {
                        if (!n.isRead) void markOneRead(n.id);
                        setOpen(false);
                      }}
                      className="block px-3 py-3 hover:bg-[#1a1d2e]"
                    >
                      <div className="flex items-start gap-2">
                        {!n.isRead ? (
                          <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#fb923c]" />
                        ) : (
                          <span className="mt-1.5 h-2 w-2 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[#f0f2ff]">{n.title}</div>
                          {n.body ? (
                            <div className="mt-0.5 truncate text-xs text-[#aab2cf]">{n.body}</div>
                          ) : null}
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-[#8892b0]">
                            {formatRelative(n.createdAt)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-[#252840] px-3 py-2 text-center">
            <Link
              href={listHref}
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-[#fb923c]"
            >
              Xem tất cả
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
