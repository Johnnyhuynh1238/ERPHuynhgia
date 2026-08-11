"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "../../_components/contracts.css";
import { EstimateDetailSection } from "./estimate-detail-section";
import { EMPTY_ESTIMATE_DETAIL, type EstimateDetail } from "@/lib/estimate-detail";

const plexSans = IBM_Plex_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

type Step = {
  id: string;
  kind: string;
  status: "pending" | "in_progress" | "customer_review" | "approved";
  approvedAt: string | null;
  notes: string | null;
};
type Contract = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  signedAt: string;
  totalValue: number | null;
  status: string;
  steps: Step[];
  estimateDetail?: unknown;
};
type Version = { id: string; seq: number; grand: number | null; note: string | null; createdAt: string };

const STEP_LABEL: Record<string, string> = {
  mat_bang: "Mặt bằng",
  mat_tien_3d: "Mặt tiền / 3D",
  noi_that: "Nội thất",
  shop_drawing: "Shop drawing",
  du_toan_bao_gia: "Dự toán & Báo giá",
};
const STATUS: { v: Step["status"]; l: string }[] = [
  { v: "pending", l: "Chờ" },
  { v: "in_progress", l: "Đang làm" },
  { v: "customer_review", l: "Khách duyệt" },
  { v: "approved", l: "Đã duyệt" },
];
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const dt = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function DesignContractDetailClient({
  contract,
  projectId,
  projectCode,
  grand,
  shareToken,
}: {
  contract: Contract;
  projectId: string | null;
  projectCode: string | null;
  grand: number | null;
  shareToken: string;
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [steps, setSteps] = useState<Step[]>(contract.steps);
  const [openQuote, setOpenQuote] = useState(false);
  const [openEstimate, setOpenEstimate] = useState(false);
  const estimateDetail = (contract.estimateDetail ?? EMPTY_ESTIMATE_DETAIL) as EstimateDetail;
  const hasEstimate = Array.isArray(estimateDetail.items) && estimateDetail.items.length > 0;
  const [viewVersion, setViewVersion] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<"share" | "edit" | null>(null);

  useEffect(() => {
    const t = (typeof window !== "undefined" && localStorage.getItem("cx-theme")) as "light" | "dark" | null;
    if (t) setTheme(t);
  }, []);
  function toggleTheme() {
    setTheme((p) => {
      const n = p === "light" ? "dark" : "light";
      try { localStorage.setItem("cx-theme", n); } catch { /* ignore */ }
      return n;
    });
  }

  const quoteStep = steps.find((s) => s.kind === "du_toan_bao_gia");
  const converted = projectId != null;
  const canConvert = !converted && quoteStep?.status === "approved";

  const loadVersions = useCallback(async () => {
    const r = await fetch(`/api/admin/design-contracts/${contract.id}/quote/versions`, { cache: "no-store" });
    if (r.ok) setVersions(await r.json());
  }, [contract.id]);
  useEffect(() => { loadVersions(); }, [loadVersions]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Link khách qua domain chính huynhgia6.com (/bg proxy sang ERP) — khách còn xem được trang chủ.
  const shareUrl = `https://huynhgia6.com/bg/${shareToken}`;
  // Link sửa nội bộ: cần đăng nhập ERP (admin) mới vào được — full chức năng sửa.
  const editUrl = `${origin}/bao-gia-app.html?contract=${contract.id}${converted ? "&ro=1" : ""}`;

  async function copy(which: "share" | "edit", url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setMsg("Không copy được, chép tay: " + url);
    }
  }

  async function setStatus(step: Step, status: Step["status"]) {
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status } : s)));
    const r = await fetch(`/api/admin/design-contracts/${contract.id}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status: step.status } : s)));
      setMsg("Lỗi cập nhật bước");
    }
  }

  async function restore(v: Version) {
    if (!confirm(`Khôi phục phiên bản #${v.seq} (${dt(v.createdAt)})? Báo giá hiện tại sẽ bị ghi đè.`)) return;
    setBusy(true);
    setMsg(null);
    const rv = await fetch(`/api/admin/design-contracts/${contract.id}/quote/versions/${v.id}`, { cache: "no-store" });
    if (!rv.ok) { setBusy(false); setMsg("Không đọc được phiên bản"); return; }
    const data = (await rv.json()).data;
    const rp = await fetch(`/api/admin/design-contracts/${contract.id}/quote`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteData: data }),
    });
    setBusy(false);
    if (!rp.ok) { setMsg("Khôi phục thất bại"); return; }
    setViewVersion(null);
    await loadVersions();
    router.refresh();
    setMsg(`Đã khôi phục phiên bản #${v.seq}`);
  }

  async function convert() {
    if (!confirm("Chuyển HĐ thiết kế này sang HĐ thi công? Sẽ tạo dự án mới mang theo khách hàng + báo giá.")) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/admin/design-contracts/${contract.id}/convert`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.message || "Chuyển thất bại"); return; }
    router.push(`/projects/${d.projectId}`);
  }

  const iframeSrc =
    `/bao-gia-app.html?contract=${contract.id}` +
    (converted ? "&ro=1" : "") +
    (viewVersion ? `&version=${viewVersion}` : "");

  const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
    approved: { bg: "color-mix(in srgb,var(--ok) 16%,transparent)", fg: "var(--ok)" },
    customer_review: { bg: "color-mix(in srgb,var(--sky) 16%,transparent)", fg: "var(--sky)" },
    in_progress: { bg: "color-mix(in srgb,var(--gold) 20%,transparent)", fg: "var(--terra)" },
    pending: { bg: "var(--track)", fg: "var(--mut)" },
  };

  return (
    <div className={`cxdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="cxwrap">
        <div className="cx-head">
          <div>
            <div className="cx-eyebrow">HĐ thiết kế</div>
            <h1 className="cx-h1">{contract.customerName}</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="cx-iconbtn" onClick={toggleTheme} title="Đổi nền">◐</button>
          </div>
        </div>

        <div style={{ marginTop: 6 }}>
          <Link href="/admin/contracts" className="cx-link">‹ Về danh sách hợp đồng</Link>
        </div>

        {/* Thông tin nhanh */}
        <div className="cx-stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="cx-tile"><div className="k">SĐT</div><div className="v num">{contract.customerPhone || "—"}</div></div>
          <div className="cx-tile"><div className="k">Ngày ký</div><div className="v num">{new Date(contract.signedAt).toLocaleDateString("vi-VN")}</div></div>
          <div className="cx-tile"><div className="k">Báo giá</div><div className="v num" style={{ color: "var(--terra)" }}>{grand != null ? fmt(grand) : "—"}</div></div>
        </div>

        {/* Link khách xem (công khai, chỉ đọc) */}
        <div style={{ marginTop: 12, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "11px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".06em", minWidth: 116 }}>🔗 Link khách xem</span>
          <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="num" style={{ flex: 1, minWidth: 170, fontSize: 12, padding: "7px 9px", border: "1px solid var(--line2)", borderRadius: 9, background: "var(--card2)", color: "var(--text)" }} />
          <button type="button" className="cx-btn primary" onClick={() => copy("share", shareUrl)}>{copied === "share" ? "✓ Đã chép" : "Chép"}</button>
        </div>

        {/* Link sửa nội bộ (cần đăng nhập, full sửa) */}
        <div style={{ marginTop: 8, background: "var(--card)", border: "1px solid color-mix(in srgb,var(--orange) 30%,var(--line))", borderRadius: 12, padding: "11px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--terra)", textTransform: "uppercase", letterSpacing: ".06em", minWidth: 116 }}>🔧 Link sửa (nội bộ)</span>
          <input readOnly value={editUrl} onFocus={(e) => e.currentTarget.select()} className="num" style={{ flex: 1, minWidth: 170, fontSize: 12, padding: "7px 9px", border: "1px solid var(--line2)", borderRadius: 9, background: "var(--card2)", color: "var(--text)" }} />
          <button type="button" className="cx-btn ghost" onClick={() => copy("edit", editUrl)}>{copied === "edit" ? "✓ Đã chép" : "Chép"}</button>
          <a href={editUrl} target="_blank" rel="noopener noreferrer" className="cx-btn primary" style={{ textDecoration: "none" }}>Mở sửa ↗</a>
        </div>
        {converted && <div style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 5 }}>Đã chuyển thi công → báo giá khoá, link sửa chỉ xem.</div>}

        {converted && (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--ok)" }}>
            ✅ Đã chuyển HĐ thi công — <Link href={`/projects/${projectId}`} className="cx-link">Mở dự án {projectCode} →</Link>
          </div>
        )}

        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".1em", margin: "22px 0 9px" }}>Các bước thiết kế</h2>
        <div className="cx-list">
          {steps.map((s, i) => {
            const isQuote = s.kind === "du_toan_bao_gia";
            const b = STATUS_BADGE[s.status];
            return (
              <div key={s.id} style={{ background: "var(--card)", border: `1px solid ${isQuote ? "color-mix(in srgb,var(--orange) 45%,var(--line2))" : "var(--line)"}`, borderRadius: 13, padding: "11px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
                  <span className="num" style={{ width: 24, height: 24, borderRadius: 12, background: s.status === "approved" ? "var(--ok)" : "var(--track)", color: s.status === "approved" ? "#fff" : "var(--mut)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{STEP_LABEL[s.kind] ?? s.kind}{isQuote && <span className="cx-badge" style={{ marginLeft: 8, background: "color-mix(in srgb,var(--orange) 15%,transparent)", color: "var(--orange)" }}>bước cuối</span>}</span>
                  <span className="cx-badge" style={{ background: b.bg, color: b.fg }}>{STATUS.find((o) => o.v === s.status)?.l}</span>
                  <select value={s.status} onChange={(e) => setStatus(s, e.target.value as Step["status"])} disabled={converted} style={{ fontSize: 12.5, padding: "6px 8px", borderRadius: 9, border: "1px solid var(--line2)", background: "var(--card2)", color: "var(--text)", fontFamily: "inherit" }}>
                    {STATUS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>

                {isQuote && (
                  <div style={{ marginTop: 11 }}>
                    <button type="button" className="cx-btn primary" onClick={() => { setOpenQuote((v) => !v); setViewVersion(null); }}>
                      {openQuote ? "▲ Ẩn báo giá" : "📊 Mở Dự toán & Báo giá"}
                    </button>

                    {openQuote && (
                      <>
                        {viewVersion && (
                          <div style={{ margin: "9px 0", fontSize: 12.5, color: "var(--terra)" }}>
                            Đang xem phiên bản cũ (chỉ đọc). <button type="button" className="cx-link" onClick={() => setViewVersion(null)} style={{ border: 0, background: "none", cursor: "pointer" }}>← Về bản hiện tại</button>
                          </div>
                        )}
                        <iframe key={iframeSrc} title="Dự toán & Báo giá" src={iframeSrc} style={{ width: "100%", height: "82vh", marginTop: 10, border: "1px solid var(--line2)", borderRadius: 12, background: "#fff" }} />
                      </>
                    )}

                    {versions.length > 0 && (
                      <div style={{ marginTop: 13 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mut)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>🕘 Lịch sử phiên bản ({versions.length})</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {versions.map((v) => (
                            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 9, padding: "7px 10px", flexWrap: "wrap" }}>
                              <b className="num">#{v.seq}</b>
                              <span className="num" style={{ color: "var(--mut)" }}>{dt(v.createdAt)}</span>
                              {v.grand != null && <span className="num" style={{ marginLeft: "auto", color: "var(--terra)", fontWeight: 600 }}>{fmt(v.grand)}</span>}
                              <button type="button" className="cx-btn ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => { setOpenQuote(true); setViewVersion(v.id); }}>Xem</button>
                              {!converted && <button type="button" className="cx-btn ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => restore(v)} disabled={busy}>Khôi phục</button>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {hasEstimate && (
          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              className="cx-btn primary"
              onClick={() => setOpenEstimate((v) => !v)}
              style={{ fontSize: 14 }}
            >
              {openEstimate ? "▲ Ẩn dự toán chi tiết" : "📐 Mở Dự toán chi tiết (có bản vẽ)"}
            </button>
            {openEstimate && (
              <div style={{ marginTop: 12 }}>
                <EstimateDetailSection contractId={contract.id} detail={estimateDetail} />
              </div>
            )}
          </div>
        )}

        {msg && <div className="cx-warn" style={{ marginTop: 14 }}>{msg}</div>}

        <div style={{ marginTop: 22 }}>
          <button type="button" className="cx-btn primary block" onClick={convert} disabled={!canConvert || busy} title={canConvert ? "" : "Cần duyệt bước Dự toán & Báo giá trước"} style={{ width: "100%", padding: "14px", fontSize: 15, background: canConvert ? "var(--ok)" : "var(--track)", color: canConvert ? "#fff" : "var(--mut)" }}>
            {busy ? "Đang xử lý…" : converted ? "Đã chuyển HĐ thi công" : "🔨 Chốt giá → Chuyển HĐ thi công"}
          </button>
          {!canConvert && !converted && (
            <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 7, textAlign: "center" }}>
              Duyệt bước “Dự toán &amp; Báo giá” (Đã duyệt) mới bật được nút chuyển.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
