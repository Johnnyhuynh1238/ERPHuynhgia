"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  const [steps, setSteps] = useState<Step[]>(contract.steps);
  const [openQuote, setOpenQuote] = useState(false);
  const [viewVersion, setViewVersion] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const quoteStep = steps.find((s) => s.kind === "du_toan_bao_gia");
  const converted = projectId != null;
  const canConvert = !converted && quoteStep?.status === "approved";

  const loadVersions = useCallback(async () => {
    const r = await fetch(`/api/admin/design-contracts/${contract.id}/quote/versions`, { cache: "no-store" });
    if (r.ok) setVersions(await r.json());
  }, [contract.id]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/bao-gia/${shareToken}` : `/bao-gia/${shareToken}`;

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setMsg("Không copy được, chép tay: " + shareUrl);
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

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 14px 60px", fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <Link href="/admin/contracts" style={{ color: "#9a4b2e", fontSize: 13, textDecoration: "none" }}>‹ Hợp đồng</Link>

      <div style={{ background: "#fbf8f1", border: "1px solid #e7dfce", borderRadius: 12, padding: 16, marginTop: 10 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 19 }}>{contract.customerName}</h2>
        <div style={{ fontSize: 13, color: "#6b6355", display: "flex", gap: 14, flexWrap: "wrap" }}>
          {contract.customerPhone && <span>📞 {contract.customerPhone}</span>}
          <span>Ký: {new Date(contract.signedAt).toLocaleDateString("vi-VN")}</span>
          {grand != null && <span>Báo giá: <b style={{ color: "#9a4b2e" }}>{fmt(grand)} đ</b></span>}
        </div>

        {/* Link công khai khách xem (chỉ đọc) */}
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#8a8172" }}>🔗 Link khách xem:</span>
          <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 180, fontSize: 12, padding: "5px 8px", border: "1px solid #d8cfbb", borderRadius: 6, background: "#fff" }} />
          <button type="button" onClick={copyShare} style={{ fontSize: 12, padding: "6px 10px", border: 0, borderRadius: 6, background: "#9a4b2e", color: "#fff", cursor: "pointer" }}>{copied ? "✓ Đã chép" : "Chép"}</button>
        </div>

        {converted && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            ✅ Đã chuyển HĐ thi công —{" "}
            <Link href={`/projects/${projectId}`} style={{ color: "#9a4b2e", fontWeight: 600 }}>Mở dự án {projectCode} →</Link>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 15, margin: "20px 0 8px" }}>Các bước thiết kế</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {steps.map((s, i) => {
          const isQuote = s.kind === "du_toan_bao_gia";
          return (
            <div key={s.id} style={{ background: isQuote ? "#fdf3ec" : "#fff", border: `1px solid ${isQuote ? "#e8c3ad" : "#e7dfce"}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, background: s.status === "approved" ? "#2e7d4f" : "#c9bfa8", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{STEP_LABEL[s.kind] ?? s.kind}</span>
                <select value={s.status} onChange={(e) => setStatus(s, e.target.value as Step["status"])} disabled={converted} style={{ fontSize: 13, padding: "4px 6px", borderRadius: 6, border: "1px solid #d8cfbb" }}>
                  {STATUS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>

              {isQuote && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={() => { setOpenQuote((v) => !v); setViewVersion(null); }} style={{ background: "#9a4b2e", color: "#fff", border: 0, borderRadius: 8, padding: "8px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    {openQuote ? "▲ Ẩn báo giá" : "📊 Mở Dự toán & Báo giá"}
                  </button>

                  {openQuote && (
                    <>
                      {viewVersion && (
                        <div style={{ margin: "8px 0", fontSize: 13, color: "#9a4b2e" }}>
                          Đang xem phiên bản cũ (chỉ đọc).{" "}
                          <button type="button" onClick={() => setViewVersion(null)} style={{ border: 0, background: "none", color: "#2e7d4f", fontWeight: 600, cursor: "pointer" }}>← Về bản hiện tại</button>
                        </div>
                      )}
                      <iframe key={iframeSrc} title="Dự toán & Báo giá" src={iframeSrc} style={{ width: "100%", height: "82vh", marginTop: 10, border: "1px solid #e7dfce", borderRadius: 10, background: "#fff" }} />
                    </>
                  )}

                  {/* Lịch sử phiên bản */}
                  {versions.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#8a8172", marginBottom: 6 }}>🕘 Lịch sử phiên bản ({versions.length})</div>
                      <div style={{ display: "grid", gap: 5 }}>
                        {versions.map((v) => (
                          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, background: "#fff", border: "1px solid #ece4d3", borderRadius: 7, padding: "6px 9px", flexWrap: "wrap" }}>
                            <b>#{v.seq}</b>
                            <span style={{ color: "#6b6355" }}>{dt(v.createdAt)}</span>
                            {v.grand != null && <span style={{ marginLeft: "auto", color: "#9a4b2e", fontWeight: 600 }}>{fmt(v.grand)} đ</span>}
                            <button type="button" onClick={() => { setOpenQuote(true); setViewVersion(v.id); }} style={{ border: "1px solid #d8cfbb", background: "#faf7f0", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>Xem</button>
                            {!converted && <button type="button" onClick={() => restore(v)} disabled={busy} style={{ border: "1px solid #cdbfa6", background: "#fff", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>Khôi phục</button>}
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

      {msg && <div style={{ marginTop: 14, color: "#b3261e", fontSize: 13 }}>{msg}</div>}

      <div style={{ marginTop: 22 }}>
        <button type="button" onClick={convert} disabled={!canConvert || busy} title={canConvert ? "" : "Cần duyệt bước Dự toán & Báo giá trước"} style={{ width: "100%", padding: "13px", fontSize: 15, fontWeight: 700, borderRadius: 10, border: 0, cursor: canConvert && !busy ? "pointer" : "not-allowed", background: canConvert ? "#2e7d4f" : "#d3cdbf", color: "#fff" }}>
          {busy ? "Đang xử lý…" : converted ? "Đã chuyển HĐ thi công" : "🔨 Chốt giá → Chuyển HĐ thi công"}
        </button>
        {!canConvert && !converted && (
          <div style={{ fontSize: 12, color: "#8a8172", marginTop: 6, textAlign: "center" }}>
            Duyệt bước “Dự toán &amp; Báo giá” (Đã duyệt) mới bật được nút chuyển.
          </div>
        )}
      </div>
    </div>
  );
}
