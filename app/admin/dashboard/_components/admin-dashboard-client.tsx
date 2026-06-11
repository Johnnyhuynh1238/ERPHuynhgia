"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Level = "red" | "yellow";
type CardRow = {
  id: string;
  level: Level;
  title: string;
  subtitle?: string;
  href?: string;
  amount?: number;
  daysOverdue?: number;
  dueLabel?: string;
};
type InboxRow = {
  id: string;
  content: string;
  source: string;
  createdAt: string;
};
type Dashboard5 = {
  generatedAt: string;
  cards: {
    sale: { designStageCount: number; thin: boolean; rows: CardRow[]; more: number };
    money: { rows: CardRow[]; more: number };
    construction: { rows: CardRow[]; more: number };
    design: { rows: CardRow[]; more: number };
    inbox: { rows: InboxRow[] };
  };
};

function formatVnd(n: number | undefined | null) {
  if (n == null) return "";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.00$/, "") + " tỷ";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + " tr";
  return n.toLocaleString("vi-VN") + "đ";
}

function relTime(iso: string) {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

const DOT: Record<Level, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-400",
};

const BORDER: Record<Level, string> = {
  red: "border-l-red-500",
  yellow: "border-l-yellow-400",
};

function RowLine({ row }: { row: CardRow }) {
  const content = (
    <div className={`flex items-start gap-2 border-l-2 px-2 py-1.5 ${BORDER[row.level]} hover:bg-[#1a1d2a] transition rounded-r`}>
      <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${DOT[row.level]}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white truncate">{row.title}</div>
        {row.subtitle && (
          <div className="text-xs text-[#8892b0] truncate">
            {row.subtitle}
            {row.amount != null && row.amount > 0 ? ` · ${formatVnd(row.amount)}` : ""}
          </div>
        )}
      </div>
    </div>
  );
  if (row.href) {
    return (
      <Link href={row.href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-2 py-4 text-center text-sm text-[#8892b0]">{text}</div>;
}

function Card({
  title,
  headerExtra,
  children,
}: {
  title: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#252840] bg-[#13151f] p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#cdd3e1]">{title}</h2>
        {headerExtra}
      </header>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function SaleCard({ data, onMore }: { data: Dashboard5["cards"]["sale"]; onMore: () => void }) {
  const badgeClass = data.thin
    ? "bg-red-500/20 text-red-300 border border-red-500/40"
    : "bg-[#1a1d2a] text-[#cdd3e1] border border-[#252840]";
  return (
    <Card
      title="Sale"
      headerExtra={
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${badgeClass}`}>
          {data.thin ? `Pipeline mỏng! Chỉ ${data.designStageCount} HĐ TK` : `${data.designStageCount} HĐ TK đang vẽ`}
        </span>
      }
    >
      {data.rows.length === 0 ? (
        <EmptyState text="Pipeline đang chạy đều 👌" />
      ) : (
        <>
          {data.rows.map((r) => (
            <RowLine key={r.id} row={r} />
          ))}
          {data.more > 0 && (
            <button onClick={onMore} className="mt-1 w-full rounded px-2 py-1 text-xs text-[#8892b0] hover:bg-[#1a1d2a]">
              Xem thêm ({data.more})
            </button>
          )}
        </>
      )}
    </Card>
  );
}

function MoneyCard({ data }: { data: Dashboard5["cards"]["money"] }) {
  return (
    <Card title="Tiền">
      {data.rows.length === 0 ? (
        <EmptyState text="Không có mốc tiền nào cần lo 👌" />
      ) : (
        <>
          {data.rows.map((r) => (
            <RowLine key={r.id} row={r} />
          ))}
          {data.more > 0 && (
            <div className="mt-1 px-2 text-xs text-[#8892b0]">
              <Link href="/payments" className="hover:text-amber-300">Xem thêm ({data.more}) →</Link>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ConstructionCard({ data }: { data: Dashboard5["cards"]["construction"] }) {
  return (
    <Card title="Thi công">
      {data.rows.length === 0 ? (
        <EmptyState text="Công trường êm 👌" />
      ) : (
        <>
          {data.rows.map((r) => (
            <RowLine key={r.id} row={r} />
          ))}
          {data.more > 0 && (
            <div className="mt-1 px-2 text-xs text-[#8892b0]">Xem thêm ({data.more})</div>
          )}
        </>
      )}
    </Card>
  );
}

function DesignCard({ data }: { data: Dashboard5["cards"]["design"] }) {
  return (
    <Card title="Thiết kế & Dự toán">
      {data.rows.length === 0 ? (
        <EmptyState text="Bản vẽ & dự toán đúng nhịp 👌" />
      ) : (
        <>
          {data.rows.map((r) => (
            <RowLine key={r.id} row={r} />
          ))}
          {data.more > 0 && (
            <div className="mt-1 px-2 text-xs text-[#8892b0]">Xem thêm ({data.more})</div>
          )}
        </>
      )}
    </Card>
  );
}

type CustomerHit = {
  customerKey: string;
  customerName: string;
  customerPhone: string;
  stage: number;
  stageLabel: string;
};

function ConvertModal({
  item,
  onClose,
  onDone,
}: {
  item: InboxRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [nextAction, setNextAction] = useState(item.content.slice(0, 200));
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customer-pipeline?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("search failed");
        const json = await res.json();
        if (!cancelled) setHits((json.items ?? []).slice(0, 8));
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [q]);

  async function submit() {
    if (!picked) {
      toast.error("Chưa chọn khách");
      return;
    }
    if (!nextAction.trim() || !due) {
      toast.error("Nhập nextAction + ngày hạn");
      return;
    }
    setSaving(true);
    try {
      const r1 = await fetch("/api/admin/customer-pipeline/meta", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: picked.customerName,
          customerPhone: picked.customerPhone,
          nextAction: nextAction.trim(),
          nextActionDue: due,
        }),
      });
      if (!r1.ok) throw new Error(await r1.text());
      const r2 = await fetch(`/api/admin/inbox/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done", convertedTo: `${picked.customerName} (${picked.customerPhone})` }),
      });
      if (!r2.ok) throw new Error(await r2.text());
      onDone();
      onClose();
    } catch (e) {
      toast.error("Lỗi: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-[#252840] bg-[#13151f] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-white">Chuyển inbox thành việc cần làm</h3>
          <button onClick={onClose} className="text-[#8892b0] hover:text-white">✕</button>
        </div>
        <div className="mb-3 rounded-lg bg-[#0f1117] px-3 py-2 text-sm text-[#cdd3e1]">{item.content}</div>

        <label className="mb-1 block text-xs text-[#8892b0]">Chọn khách (tên hoặc SĐT)</label>
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPicked(null); }}
          placeholder="Gõ tên hoặc số điện thoại..."
          className="w-full rounded-lg border border-[#2d3249] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#5b6478]"
        />
        {picked ? (
          <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            ✓ {picked.customerName} — {picked.customerPhone} · {picked.stageLabel}
            <button onClick={() => setPicked(null)} className="ml-2 text-xs text-[#8892b0] hover:text-white">đổi</button>
          </div>
        ) : (
          <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-[#252840]">
            {searching ? (
              <div className="px-3 py-2 text-xs text-[#8892b0]">Đang tìm...</div>
            ) : hits.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[#5b6478]">{q.trim().length < 2 ? "Gõ ≥ 2 ký tự" : "Không tìm thấy"}</div>
            ) : (
              hits.map((h) => (
                <button
                  key={h.customerKey}
                  onClick={() => setPicked(h)}
                  className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-[#1a1d2a]"
                >
                  <div>{h.customerName}</div>
                  <div className="text-[11px] text-[#8892b0]">{h.customerPhone} · {h.stageLabel}</div>
                </button>
              ))
            )}
          </div>
        )}

        <label className="mt-3 mb-1 block text-xs text-[#8892b0]">Việc kế tiếp</label>
        <input
          type="text"
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          maxLength={300}
          className="w-full rounded-lg border border-[#2d3249] bg-[#0f1117] px-3 py-2 text-sm text-white"
        />

        <label className="mt-3 mb-1 block text-xs text-[#8892b0]">Hạn</label>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="w-full rounded-lg border border-[#2d3249] bg-[#0f1117] px-3 py-2 text-sm text-white"
        />

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button
            onClick={submit}
            disabled={saving || !picked || !nextAction.trim() || !due}
            className="bg-amber-500 text-black hover:bg-amber-400"
          >
            {saving ? "Đang lưu..." : "Chuyển + DONE"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InboxCard({ data, onChange }: { data: Dashboard5["cards"]["inbox"]; onChange: () => void }) {
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);
  const [convertItem, setConvertItem] = useState<InboxRow | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const content = adding.trim();
    if (!content) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAdding("");
      onChange();
    } catch (e) {
      toast.error("Lỗi: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setSaving(false);
    }
  }

  async function markDone(id: string) {
    try {
      const res = await fetch(`/api/admin/inbox/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      if (!res.ok) throw new Error(await res.text());
      onChange();
    } catch (e) {
      toast.error("Lỗi: " + (e instanceof Error ? e.message : "unknown"));
    }
  }

  return (
    <Card title="Inbox">
      <form onSubmit={add} className="mb-2 flex gap-2">
        <input
          type="text"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Ghi nhanh việc cần làm..."
          maxLength={500}
          className="flex-1 rounded-lg border border-[#2d3249] bg-[#0f1117] px-3 py-1.5 text-sm text-white placeholder:text-[#5b6478]"
        />
        <Button type="submit" disabled={saving || !adding.trim()} className="h-8 bg-amber-500 px-3 text-xs text-black hover:bg-amber-400">
          Thêm
        </Button>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState text="Inbox trống — não được phép nghỉ 😴" />
      ) : (
        <ul className="space-y-1">
          {data.rows.map((it) => (
            <li key={it.id} className="group flex items-start gap-2 rounded px-2 py-1.5 hover:bg-[#1a1d2a]">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white">{it.content}</div>
                <div className="text-[11px] text-[#5b6478]">
                  {it.source === "openclaw" ? "🤖 OpenClaw · " : ""}
                  {relTime(it.createdAt)}
                </div>
              </div>
              <button
                onClick={() => setConvertItem(it)}
                className="rounded p-1 text-[#8892b0] hover:bg-amber-500/20 hover:text-amber-300"
                title="Chuyển thành việc cần làm"
              >
                →
              </button>
              <button
                onClick={() => markDone(it.id)}
                className="rounded p-1 text-[#8892b0] hover:bg-emerald-500/20 hover:text-emerald-300"
                title="Đánh dấu xong"
              >
                ✓
              </button>
            </li>
          ))}
        </ul>
      )}
      {convertItem && (
        <ConvertModal
          item={convertItem}
          onClose={() => setConvertItem(null)}
          onDone={onChange}
        />
      )}
    </Card>
  );
}

export function AdminDashboardClient() {
  const [data, setData] = useState<Dashboard5 | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard5", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const json: Dashboard5 = await res.json();
      setData(json);
    } catch {
      toast.error("Không tải được dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-[#252840] bg-[#13151f]" />
        ))}
      </div>
    );
  }
  if (!data) {
    return <div className="rounded-2xl border border-[#252840] bg-[#13151f] p-6 text-center text-[#8892b0]">Không tải được dashboard.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard GĐ</h1>
          <p className="text-xs text-[#5b6478]">Cập nhật {relTime(data.generatedAt)}</p>
        </div>
        <Button variant="outline" onClick={load} className="h-9">
          ↻ Làm mới
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SaleCard data={data.cards.sale} onMore={() => { window.location.href = "/customer-pipeline"; }} />
        <MoneyCard data={data.cards.money} />
        <ConstructionCard data={data.cards.construction} />
        <DesignCard data={data.cards.design} />
        <div className="lg:col-span-2">
          <InboxCard data={data.cards.inbox} onChange={load} />
        </div>
      </div>
    </div>
  );
}
