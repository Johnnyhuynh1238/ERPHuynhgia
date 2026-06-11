"use client";

import { useEffect, useState } from "react";
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
  summary: { pageviews: number; sessions: number; ctaClicks: number; leads: number };
  timeseries: { bucket: string; pageviews: number; sessions: number }[];
  cta: { kind: string; count: number }[];
  scrollFunnel: { depth: number; sessions: number }[];
  topReferrers: { ref: string | null; sessions: number }[];
  funnel: { pageviews: number; sessions: number; scroll75: number; cta: number; leads: number };
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

function fmtBucket(iso: string, range: Range) {
  const d = new Date(iso);
  if (range === "24h") return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function pct(num: number, den: number): string {
  if (!den) return "0%";
  return ((num / den) * 100).toFixed(1) + "%";
}

export function AnalyticsClient() {
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  const ctaChartData = (data?.cta ?? []).map((c) => ({
    name: CTA_LABELS[c.kind] || c.kind,
    count: c.count,
  }));

  const funnelSteps = data ? [
    { name: "Pageview", count: data.funnel.pageviews },
    { name: "Session", count: data.funnel.sessions },
    { name: "Scroll ≥75%", count: data.funnel.scroll75 },
    { name: "Click CTA", count: data.funnel.cta },
    { name: "Lead có SĐT", count: data.funnel.leads },
  ] : [];

  return (
    <div style={{ padding: "16px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Analytics — Homepage huynhgia6.com</h1>
        <div style={{ display: "flex", gap: 4, padding: 4, background: "#f3f4f6", borderRadius: 8 }}>
          {(["24h", "7d", "30d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
                background: range === r ? "#fff" : "transparent",
                color: range === r ? "#111" : "#666",
                boxShadow: range === r ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Đang tải…</div>}
      {err && <div style={{ padding: 16, background: "#fee", color: "#900", borderRadius: 8 }}>{err}</div>}

      {data && !loading && (
        <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
            <KpiCard label="Pageviews" value={data.summary.pageviews.toLocaleString("vi-VN")} hint="Lượt xem trang" />
            <KpiCard label="Sessions" value={data.summary.sessions.toLocaleString("vi-VN")} hint="Khách (unique sessionId)" />
            <KpiCard label="Click CTA" value={data.summary.ctaClicks.toLocaleString("vi-VN")} hint="Báo giá / gọi / Zalo" />
            <KpiCard label="Lead có SĐT" value={data.summary.leads.toLocaleString("vi-VN")} hint="Submit form báo giá" />
          </div>

          {/* Timeseries */}
          <Card title="Pageviews & sessions theo thời gian">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.timeseries.map((t) => ({ ...t, label: fmtBucket(t.bucket, data.range) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="pageviews" stroke="#b25c3a" strokeWidth={2} dot={false} name="Pageviews" />
                <Line type="monotone" dataKey="sessions" stroke="#2e7da8" strokeWidth={2} dot={false} name="Sessions" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* CTA + Funnel side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 12, marginBottom: 12 }}>
            <Card title="Phân bố CTA click">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ctaChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#b25c3a" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Funnel chuyển đổi">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #eee", color: "#666" }}>
                    <th style={{ textAlign: "left", padding: "8px 4px" }}>Bước</th>
                    <th style={{ textAlign: "right", padding: "8px 4px" }}>Số lượng</th>
                    <th style={{ textAlign: "right", padding: "8px 4px" }}>% session</th>
                  </tr>
                </thead>
                <tbody>
                  {funnelSteps.map((s) => (
                    <tr key={s.name} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "8px 4px" }}>{s.name}</td>
                      <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600 }}>{s.count.toLocaleString("vi-VN")}</td>
                      <td style={{ padding: "8px 4px", textAlign: "right", color: "#666" }}>{pct(s.count, data.funnel.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Scroll depth + Referrers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 12, marginBottom: 12 }}>
            <Card title="Scroll depth (unique sessions)">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.scrollFunnel.map((s) => ({ name: s.depth + "%", sessions: s.sessions }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="sessions" fill="#2e7da8" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Top 10 nguồn truy cập (referrer)">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #eee", color: "#666" }}>
                    <th style={{ textAlign: "left", padding: "6px 4px" }}>Nguồn</th>
                    <th style={{ textAlign: "right", padding: "6px 4px" }}>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topReferrers.length === 0 && (
                    <tr><td colSpan={2} style={{ padding: 12, textAlign: "center", color: "#999" }}>Chưa có dữ liệu</td></tr>
                  )}
                  {data.topReferrers.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "6px 4px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ref || "direct"}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 600 }}>{r.sessions.toLocaleString("vi-VN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Recent events */}
          <Card title="50 event mới nhất">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #eee", color: "#666" }}>
                    <th style={{ textAlign: "left", padding: "6px 4px" }}>Time</th>
                    <th style={{ textAlign: "left", padding: "6px 4px" }}>Event</th>
                    <th style={{ textAlign: "left", padding: "6px 4px" }}>Session</th>
                    <th style={{ textAlign: "left", padding: "6px 4px" }}>Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString("vi-VN")}</td>
                      <td style={{ padding: "6px 4px", whiteSpace: "nowrap", color: e.eventType === "cta_click" ? "#b25c3a" : "#333", fontWeight: e.eventType === "cta_click" ? 600 : 400 }}>{e.eventType}</td>
                      <td style={{ padding: "6px 4px", fontFamily: "monospace", fontSize: 11 }}>{e.sessionId.slice(0, 8)}…</td>
                      <td style={{ padding: "6px 4px", fontFamily: "monospace", fontSize: 11, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{JSON.stringify(e.payload)}</td>
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
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{hint}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#333" }}>{title}</div>
      {children}
    </div>
  );
}
