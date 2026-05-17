"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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

export function NotificationsPageClient({ apiBase }: { apiBase: string }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const url = new URL(apiBase, window.location.origin);
        url.searchParams.set("take", "30");
        if (onlyUnread) url.searchParams.set("unread", "1");
        if (!reset && cursor) url.searchParams.set("cursor", cursor);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return;
        const json: FetchListResult = await res.json();
        setItems((prev) => (reset ? json.items : [...prev, ...json.items]));
        setCursor(json.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [apiBase, cursor, onlyUnread],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyUnread]);

  const markOneRead = useCallback(
    async (id: string) => {
      try {
        await fetch(`${apiBase}/${id}/read`, { method: "POST" });
      } catch {}
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    },
    [apiBase],
  );

  const markAll = useCallback(async () => {
    setMarking(true);
    try {
      await fetch(`${apiBase}/read-all`, { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } finally {
      setMarking(false);
    }
  }, [apiBase]);

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#f0f2ff]">Thông báo</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyUnread((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              onlyUnread
                ? "border-[#f97316] bg-[#f97316]/20 text-[#fb923c]"
                : "border-[#2d3249] bg-[#1a1d2e] text-[#d9def3]"
            }`}
          >
            {onlyUnread ? "Đang lọc: Chưa đọc" : "Chỉ chưa đọc"}
          </button>
          <button
            type="button"
            onClick={markAll}
            disabled={marking}
            className="rounded-full border border-[#2d3249] bg-[#1a1d2e] px-3 py-1 text-xs font-medium text-[#fb923c] disabled:opacity-50"
          >
            {marking ? "..." : "Đã đọc tất cả"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#252840] bg-[#13151f]">
        {items.length === 0 && !loading ? (
          <div className="py-10 text-center text-sm text-[#8892b0]">
            {onlyUnread ? "Không có thông báo chưa đọc" : "Chưa có thông báo"}
          </div>
        ) : (
          <ul className="divide-y divide-[#252840]">
            {items.map((n) => (
              <li key={n.id} className={n.isRead ? "" : "bg-[#1a1d2e]"}>
                <Link
                  href={n.link || "#"}
                  onClick={() => {
                    if (!n.isRead) void markOneRead(n.id);
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
                        <div className="mt-0.5 text-xs text-[#aab2cf]">{n.body}</div>
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

      <div className="flex justify-center py-2">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#8892b0]" />
        ) : cursor ? (
          <button
            type="button"
            onClick={() => load(false)}
            className="rounded-full border border-[#2d3249] bg-[#1a1d2e] px-4 py-2 text-xs font-medium text-[#d9def3]"
          >
            Tải thêm
          </button>
        ) : null}
      </div>
    </div>
  );
}
