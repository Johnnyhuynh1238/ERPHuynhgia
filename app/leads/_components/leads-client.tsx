"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type LeadStatus = "new" | "contacted" | "signed" | "spam";

type LeadListItem = {
  id: string;
  name: string;
  phone: string;
  feeTotal: number | null;
  status: LeadStatus;
  createdAt: string;
  contactedAt: string | null;
};

type LeadDetail = LeadListItem & {
  source: string;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  adminNotes: string | null;
  payload: Record<string, unknown>;
  updatedAt: string;
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  signed: "Đã ký",
  spam: "Spam",
};

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: "bg-amber-500/15 text-amber-300",
  contacted: "bg-blue-500/15 text-blue-300",
  signed: "bg-emerald-500/15 text-emerald-300",
  spam: "bg-rose-500/15 text-rose-300",
};

const TABS: { value: "all" | LeadStatus; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "new", label: "Mới" },
  { value: "contacted", label: "Đã liên hệ" },
  { value: "signed", label: "Đã ký" },
  { value: "spam", label: "Spam" },
];

function formatVnd(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("vi-VN") + "đ";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

export function LeadsClient() {
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [counts, setCounts] = useState<Partial<Record<LeadStatus, number>>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | LeadStatus>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== "all") params.set("status", tab);
      if (search) params.set("q", search);
      const res = await fetch(`/api/leads?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setItems(data.items);
      setCounts(data.counts || {});
    } catch {
      toast.error("Không tải được danh sách lead");
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 30s — picks up new leads while admin watches the page
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const totalUnread = counts.new ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lead báo giá web</h1>
          <p className="text-sm text-[#8892b0]">
            Lead từ form trang báo giá huynhgia6.com — auto refresh 30 giây.
            {totalUnread > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                {totalUnread} chưa liên hệ
              </span>
            )}
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Tìm tên / SĐT"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline" className="h-9">Tìm</Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#252840]">
        {TABS.map((t) => {
          const c = t.value === "all" ? Object.values(counts).reduce((a, b) => a + (b ?? 0), 0) : (counts[t.value] ?? 0);
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`relative -mb-px border-b-2 px-4 py-2 text-sm transition ${
                active
                  ? "border-amber-400 text-amber-300"
                  : "border-transparent text-[#8892b0] hover:text-white"
              }`}
            >
              {t.label}
              <span className="ml-1 text-xs opacity-70">({c})</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#252840]">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[#252840] bg-[#171a27] text-left text-[#8892b0]">
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">SĐT</th>
              <th className="px-3 py-2">Phí thiết kế</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2">Thời gian</th>
              <th className="px-3 py-2">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[#8892b0]">Đang tải…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[#8892b0]">Chưa có lead nào.</td>
              </tr>
            ) : (
              items.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className="cursor-pointer border-b border-[#252840] last:border-b-0 hover:bg-[#171a27]"
                >
                  <td className="px-3 py-2 font-medium">{lead.name}</td>
                  <td className="px-3 py-2">{lead.phone}</td>
                  <td className="px-3 py-2">{formatVnd(lead.feeTotal)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_BADGE[lead.status]}`}>
                      {STATUS_LABEL[lead.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#8892b0]" title={formatDate(lead.createdAt)}>
                    {timeAgo(lead.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <a
                        href={`tel:${lead.phone}`}
                        className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                      >
                        Gọi
                      </a>
                      <a
                        href={`https://zalo.me/${lead.phone}`}
                        target="_blank"
                        rel="noopener"
                        className="rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
                      >
                        Zalo
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <LeadDetailDrawer
          leadId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function LeadDetailDrawer({
  leadId,
  onClose,
  onChanged,
}: {
  leadId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leads/${leadId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLead(data.lead);
        setNotes(data.lead?.adminNotes ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Không tải được chi tiết lead");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function updateStatus(status: LeadStatus) {
    if (!lead) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLead(data.lead);
      toast.success(`Đã đổi trạng thái → ${STATUS_LABEL[status]}`);
      onChanged();
    } catch {
      toast.error("Cập nhật thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    if (!lead) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: notes }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLead(data.lead);
      toast.success("Đã lưu ghi chú");
    } catch {
      toast.error("Lưu ghi chú thất bại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-[560px] overflow-y-auto bg-[#0e1018] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#252840] pb-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#8892b0]">Lead báo giá</div>
            <div className="mt-1 text-xl font-semibold">{lead?.name ?? "—"}</div>
            <div className="mt-0.5 text-sm text-[#8892b0]">{lead?.phone}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-[#2d3249] px-3 py-1 text-sm">
            Đóng
          </button>
        </div>

        {loading || !lead ? (
          <div className="py-10 text-center text-[#8892b0]">Đang tải…</div>
        ) : (
          <div className="space-y-5 pt-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <a
                href={`tel:${lead.phone}`}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-center font-medium text-emerald-300 hover:bg-emerald-500/20"
              >
                📞 Gọi {lead.phone}
              </a>
              <a
                href={`https://zalo.me/${lead.phone}`}
                target="_blank"
                rel="noopener"
                className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-center font-medium text-blue-300 hover:bg-blue-500/20"
              >
                💬 Nhắn Zalo
              </a>
            </div>

            <section>
              <div className="mb-2 text-xs uppercase tracking-wider text-[#8892b0]">Trạng thái</div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => {
                  const active = lead.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={saving}
                      onClick={() => updateStatus(s)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        active ? STATUS_BADGE[s] : "border border-[#2d3249] text-[#8892b0] hover:text-white"
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-2 text-xs uppercase tracking-wider text-[#8892b0]">Thông tin</div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <dt className="text-[#8892b0]">Phí thiết kế</dt>
                <dd className="col-span-2">{formatVnd(lead.feeTotal)}</dd>
                <dt className="text-[#8892b0]">Đăng ký lúc</dt>
                <dd className="col-span-2">{formatDate(lead.createdAt)}</dd>
                {lead.contactedAt && (
                  <>
                    <dt className="text-[#8892b0]">Đã liên hệ lúc</dt>
                    <dd className="col-span-2">{formatDate(lead.contactedAt)}</dd>
                  </>
                )}
                <dt className="text-[#8892b0]">IP</dt>
                <dd className="col-span-2 break-all">{lead.ipAddress ?? "—"}</dd>
                <dt className="text-[#8892b0]">Referer</dt>
                <dd className="col-span-2 break-all">{lead.referer ?? "—"}</dd>
                <dt className="text-[#8892b0]">User agent</dt>
                <dd className="col-span-2 break-all text-xs text-[#8892b0]">{lead.userAgent ?? "—"}</dd>
              </dl>
            </section>

            <section>
              <div className="mb-2 text-xs uppercase tracking-wider text-[#8892b0]">Hành trình xem báo giá</div>
              <BaogiaPayload payload={lead.payload} />
            </section>

            <section>
              <div className="mb-2 text-xs uppercase tracking-wider text-[#8892b0]">Ghi chú admin</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Ví dụ: gọi 2 lần không bắt máy, hẹn gọi lại 16h…"
                className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              />
              <div className="mt-2 flex justify-end">
                <Button type="button" onClick={saveNotes} disabled={saving} variant="outline" className="h-9">
                  Lưu ghi chú
                </Button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function BaogiaPayload({ payload }: { payload: Record<string, unknown> }) {
  const wizard = payload.wizard as Record<string, unknown> | undefined;
  const budget = payload.budget as Record<string, unknown> | undefined;
  const screensSeen = payload.screensSeen as string[] | undefined;
  const timeOnPageSec = payload.timeOnPageSec as number | undefined;
  const sessionStartedAt = payload.sessionStartedAt as string | undefined;
  const userAgentBrowser = payload.userAgentBrowser as string | undefined;
  const referrer = payload.referrer as string | undefined;

  const wizardEntries = wizard ? Object.entries(wizard).filter(([, v]) => v != null && v !== "") : [];
  const budgetEntries = budget ? Object.entries(budget).filter(([, v]) => v != null && v !== "") : [];

  return (
    <div className="space-y-3">
      {wizardEntries.length > 0 && (
        <SubSection title="Câu trả lời wizard">
          <KeyValueList entries={wizardEntries} />
        </SubSection>
      )}
      {budgetEntries.length > 0 && (
        <SubSection title="Lựa chọn ngân sách">
          <KeyValueList entries={budgetEntries} />
        </SubSection>
      )}
      {screensSeen && screensSeen.length > 0 && (
        <SubSection title={`Đã xem ${screensSeen.length} màn`}>
          <div className="flex flex-wrap gap-1.5">
            {screensSeen.map((s) => (
              <span key={s} className="rounded-full bg-[#171a27] px-2 py-0.5 text-xs text-[#8892b0]">{s}</span>
            ))}
          </div>
        </SubSection>
      )}
      {(timeOnPageSec != null || sessionStartedAt || referrer || userAgentBrowser) && (
        <SubSection title="Phiên truy cập">
          <KeyValueList
            entries={[
              ...(timeOnPageSec != null ? [["Thời gian trên trang", `${Math.round(timeOnPageSec)} giây`]] : []),
              ...(sessionStartedAt ? [["Bắt đầu", new Date(sessionStartedAt).toLocaleString("vi-VN")]] : []),
              ...(referrer ? [["Nguồn", referrer]] : []),
              ...(userAgentBrowser ? [["Trình duyệt", userAgentBrowser]] : []),
            ] as [string, unknown][]}
          />
        </SubSection>
      )}
      {wizardEntries.length === 0 && budgetEntries.length === 0 && (!screensSeen || screensSeen.length === 0) && (
        <div className="rounded-lg border border-dashed border-[#2d3249] p-3 text-xs text-[#8892b0]">
          Không có dữ liệu hành trình. Khách có thể đã vào thẳng form mà chưa qua wizard.
        </div>
      )}
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#252840] bg-[#13151f] p-3">
      <div className="mb-1.5 text-xs font-medium text-[#8892b0]">{title}</div>
      {children}
    </div>
  );
}

function KeyValueList({ entries }: { entries: [string, unknown][] }) {
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[#8892b0]">{k}</dt>
          <dd className="col-span-2 break-words">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
