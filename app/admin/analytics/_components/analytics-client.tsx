"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar,
} from "recharts";

type Range = "24h" | "7d" | "30d";

type ApiData = {
  ok: boolean;
  range: Range;
  since: string;
  summary: { pageviews: number; sessions: number; ctaClicks: number; quoteSaved: number; leads: number };
  timeseries: { bucket: string; pageviews: number; sessions: number }[];
  cta: { kind: string; count: number }[];
  scrollFunnel: { depth: number; sessions: number }[];
  topReferrers: { ref: string | null; sessions: number }[];
  funnel: { pageviews: number; sessions: number; scroll75: number; cta: number; quoteSaved: number; leads: number };
  recent: {
    id: string;
    sessionId: string;
    pageType: string;
    eventType: string;
    payload: Record<string, unknown>;
    referer: string | null;
    createdAt: string;
  }[];
};

type LeadRow = {
  id: string;
  name: string;
  phone: string;
  feeTotal: number | null;
  status: "new" | "contacted" | "signed" | "spam";
  createdAt: string;
};

const RANGE_LABELS: Record<Range, string> = {
  "24h": "24 giờ",
  "7d": "7 ngày",
  "30d": "30 ngày",
};

const CTA_LABELS: Record<string, string> = {
  baogia: "Mở báo giá",
  call: "Gọi điện",
  zalo: "Zalo",
  unknown: "Khác",
};

const STATUS_LABEL: Record<LeadRow["status"], string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  signed: "Đã ký",
  spam: "Spam",
};

const STATUS_CLASS: Record<LeadRow["status"], string> = {
  new: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
  contacted: "bg-blue-500/20 text-blue-300 border border-blue-500/40",
  signed: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  spam: "bg-red-500/20 text-red-300 border border-red-500/40",
};

function fmtBucket(iso: string, range: Range) {
  const d = new Date(iso);
  if (range === "24h") return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function pct(num: number, den: number): string {
  if (!den) return "0%";
  return ((num / den) * 100).toFixed(1) + "%";
}

function fmtVnd(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.00$/, "") + " tỷ";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + " tr";
  return n.toLocaleString("vi-VN") + "đ";
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const AXIS = { stroke: "#3a3f55", tick: { fill: "#8892b0", fontSize: 11 } };
const GRID_STROKE = "#252840";
const TOOLTIP_STYLE = {
  background: "#0f1117",
  border: "1px solid #252840",
  borderRadius: 8,
  color: "#cdd3e1",
  fontSize: 12,
};
const COLORS = { amber: "#f59e0b", blue: "#3b82f6", cyan: "#06b6d4" };

export function AnalyticsClient() {
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/admin/analytics/web-events?range=${range}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.message || "Lỗi tải dữ liệu");
        setData(j as ApiData);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || "Lỗi không xác định");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setLeadsLoading(true);
    fetch(`/api/leads?take=15`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setLeads((j.items ?? []) as LeadRow[]);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLeadsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const ctaChartData = (data?.cta ?? []).map((c) => ({
    name: CTA_LABELS[c.kind] || c.kind,
    count: c.count,
  }));

  const funnelSteps = data ? [
    { name: "Pageview", count: data.funnel.pageviews },
    { name: "Session", count: data.funnel.sessions },
    { name: "Scroll ≥75%", count: data.funnel.scroll75 },
    { name: "Click CTA", count: data.funnel.cta },
    { name: "Quote saved", count: data.funnel.quoteSaved },
    { name: "Lead có SĐT", count: data.funnel.leads },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white">Analytics — Homepage huynhgia6.com</h1>
          <p className="text-xs text-[#5b6478]">Theo dõi traffic, hành vi & chuyển đổi báo giá</p>
        </div>
        <div className="inline-flex rounded-lg border border-[#252840] bg-[#13151f] p-1">
          {(["24h", "7d", "30d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                range === r
                  ? "bg-amber-500 text-black"
                  : "text-[#8892b0] hover:text-white"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-[#252840] bg-[#13151f]" />
          ))}
        </div>
      )}
      {err && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{err}</div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiCard label="Pageviews" value={data.summary.pageviews.toLocaleString("vi-VN")} hint="Lượt xem trang" />
            <KpiCard label="Sessions" value={data.summary.sessions.toLocaleString("vi-VN")} hint="Khách (unique sessionId)" />
            <KpiCard label="Click CTA" value={data.summary.ctaClicks.toLocaleString("vi-VN")} hint="Báo giá / gọi / Zalo" />
            <KpiCard label="Quote saved" value={data.summary.quoteSaved.toLocaleString("vi-VN")} hint="Khách tạo link báo giá riêng" />
            <KpiCard label="Lead có SĐT" value={data.summary.leads.toLocaleString("vi-VN")} hint="Submit form báo giá" />
          </div>

          <Card title="Pageviews & sessions theo thời gian">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.timeseries.map((t) => ({ ...t, label: fmtBucket(t.bucket, data.range) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "#252840" }} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#cdd3e1" }} />
                <Line type="monotone" dataKey="pageviews" stroke={COLORS.amber} strokeWidth={2} dot={false} name="Pageviews" />
                <Line type="monotone" dataKey="sessions" stroke={COLORS.blue} strokeWidth={2} dot={false} name="Sessions" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title="Phân bố CTA click">
              {ctaChartData.length === 0 ? (
                <EmptyState text="Chưa có click CTA nào" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={ctaChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="name" {...AXIS} />
                    <YAxis {...AXIS} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1a1d2a" }} />
                    <Bar dataKey="count" fill={COLORS.amber} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Funnel chuyển đổi">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#252840] text-xs uppercase tracking-wide text-[#8892b0]">
                    <th className="px-1 py-2 text-left font-medium">Bước</th>
                    <th className="px-1 py-2 text-right font-medium">Số lượng</th>
                    <th className="px-1 py-2 text-right font-medium">% session</th>
                  </tr>
                </thead>
                <tbody>
                  {funnelSteps.map((s) => (
                    <tr key={s.name} className="border-b border-[#1a1d2a] last:border-0">
                      <td className="px-1 py-2 text-[#cdd3e1]">{s.name}</td>
                      <td className="px-1 py-2 text-right font-semibold text-white">{s.count.toLocaleString("vi-VN")}</td>
                      <td className="px-1 py-2 text-right text-[#8892b0]">{pct(s.count, data.funnel.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title="Scroll depth (unique sessions)">
              {data.scrollFunnel.length === 0 ? (
                <EmptyState text="Chưa có dữ liệu scroll" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.scrollFunnel.map((s) => ({ name: s.depth + "%", sessions: s.sessions }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="name" {...AXIS} />
                    <YAxis {...AXIS} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1a1d2a" }} />
                    <Bar dataKey="sessions" fill={COLORS.cyan} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Top 10 nguồn truy cập (referrer)">
              {data.topReferrers.length === 0 ? (
                <EmptyState text="Chưa có dữ liệu" />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#252840] text-xs uppercase tracking-wide text-[#8892b0]">
                      <th className="px-1 py-2 text-left font-medium">Nguồn</th>
                      <th className="px-1 py-2 text-right font-medium">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topReferrers.map((r, i) => (
                      <tr key={i} className="border-b border-[#1a1d2a] last:border-0">
                        <td className="max-w-[280px] truncate px-1 py-2 text-[#cdd3e1]">{r.ref || "direct"}</td>
                        <td className="px-1 py-2 text-right font-semibold text-white">{r.sessions.toLocaleString("vi-VN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card
            title="Báo giá khách đã tạo (mới nhất)"
            headerExtra={
              <Link href="/leads" className="text-xs text-amber-300 hover:text-amber-200">
                Xem tất cả →
              </Link>
            }
          >
            {leadsLoading ? (
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded bg-[#1a1d2a]" />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <EmptyState text="Chưa có báo giá nào từ khách" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#252840] text-xs uppercase tracking-wide text-[#8892b0]">
                      <th className="px-2 py-2 text-left font-medium">Thời gian</th>
                      <th className="px-2 py-2 text-left font-medium">Khách</th>
                      <th className="px-2 py-2 text-left font-medium">SĐT</th>
                      <th className="px-2 py-2 text-right font-medium">Báo giá</th>
                      <th className="px-2 py-2 text-left font-medium">Trạng thái</th>
                      <th className="px-2 py-2 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id} className="border-b border-[#1a1d2a] last:border-0 hover:bg-[#1a1d2a]">
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-[#8892b0]">{fmtDateTime(l.createdAt)}</td>
                        <td className="px-2 py-2 text-white">{l.name}</td>
                        <td className="px-2 py-2 font-mono text-xs text-[#cdd3e1]">{l.phone}</td>
                        <td className="px-2 py-2 text-right font-semibold text-amber-300">{fmtVnd(l.feeTotal)}</td>
                        <td className="px-2 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_CLASS[l.status]}`}>
                            {STATUS_LABEL[l.status]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <Link
                            href={`/leads?lead=${l.id}`}
                            className="text-xs text-amber-300 hover:text-amber-200"
                          >
                            Xem chi tiết →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="50 event mới nhất">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#252840] uppercase tracking-wide text-[#8892b0]">
                    <th className="px-1 py-2 text-left font-medium">Time</th>
                    <th className="px-1 py-2 text-left font-medium">Event</th>
                    <th className="px-1 py-2 text-left font-medium">Session</th>
                    <th className="px-1 py-2 text-left font-medium">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((e) => (
                    <tr key={e.id} className="border-b border-[#1a1d2a] last:border-0">
                      <td className="whitespace-nowrap px-1 py-1.5 text-[#8892b0]">{fmtDateTime(e.createdAt)}</td>
                      <td
                        className={`whitespace-nowrap px-1 py-1.5 ${
                          e.eventType === "cta_click" ? "font-semibold text-amber-300" : "text-[#cdd3e1]"
                        }`}
                      >
                        {e.eventType}
                      </td>
                      <td className="px-1 py-1.5 font-mono text-[11px] text-[#5b6478]">{e.sessionId.slice(0, 8)}…</td>
                      <td className="max-w-[420px] truncate px-1 py-1.5 font-mono text-[11px] text-[#8892b0]">
                        {JSON.stringify(e.payload)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-[#252840] bg-[#13151f] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8892b0]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] text-[#5b6478]">{hint}</div>
    </div>
  );
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
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-[#8892b0]">{text}</div>;
}
