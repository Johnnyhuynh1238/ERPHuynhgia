"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { ProposalComments } from "./proposal-comments";
import { useCashAccounts, formatCashAccountLabel } from "@/lib/use-cash-accounts";

// Legacy format (AI parse): {ten, sl, dvt}. New format (Phúc giao khoán): {name, qty, unit, task}.
type ParsedItem =
  | { ten: string; sl: number; dvt: string; task?: never; name?: never; qty?: never; unit?: never }
  | { name: string; qty: number; unit: string; task?: string; ten?: never; sl?: never; dvt?: never };

type NormalizedItem = { name: string; qty: number; unit: string; task: string };

function normalizeItem(it: ParsedItem): NormalizedItem {
  if ("name" in it && it.name !== undefined) {
    return { name: it.name, qty: it.qty ?? 0, unit: it.unit ?? "", task: it.task ?? "" };
  }
  return { name: it.ten ?? "", qty: it.sl ?? 0, unit: it.dvt ?? "", task: "" };
}

function poCode(id: string) {
  return `PO-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

type Proposal = {
  id: string;
  description: string;
  status: "pending" | "accepted" | "declined";
  orderStatus: "not_ordered" | "ordered" | "received" | "paid";
  parsedItems: ParsedItem[] | null;
  processedNote: string | null;
  paymentMethod: string | null;
  paymentNote: string | null;
  createdAt: string;
  acceptedAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  paidAt: string | null;
  reminderDueAt: string | null;
  ks: { id: string; fullName: string };
  project: { id: string; code: string; name: string };
  processor: { id: string; fullName: string } | null;
};

const STATUS_LABEL: Record<Proposal["status"], string> = {
  pending: "Chờ duyệt",
  accepted: "Đã duyệt",
  declined: "Từ chối",
};
const STATUS_CHIP: Record<Proposal["status"], string> = {
  pending: "bg-amber-500/15 text-amber-300",
  accepted: "bg-blue-500/15 text-blue-300",
  declined: "bg-red-500/15 text-red-300",
};
const ORDER_LABEL: Record<Proposal["orderStatus"], string> = {
  not_ordered: "Chưa đặt NCC",
  ordered: "Đã đặt NCC",
  received: "Đã nhận hàng",
  paid: "Đã thanh toán",
};
const ORDER_CHIP: Record<Proposal["orderStatus"], string> = {
  not_ordered: "bg-slate-500/15 text-slate-300",
  ordered: "bg-cyan-500/15 text-cyan-300",
  received: "bg-emerald-500/15 text-emerald-300",
  paid: "bg-emerald-600/25 text-emerald-200",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
}

export function ProposalDetailClient({
  proposalId,
  currentUserId,
  currentRole,
}: {
  proposalId: string;
  currentUserId: string;
  currentRole: string;
}) {
  const isAccountantView = currentRole === "accountant" || currentRole === "admin";
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [declineNote, setDeclineNote] = useState("");
  const [showDeclineBox, setShowDeclineBox] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "transfer" | "debt">("cash");
  const [payNote, setPayNote] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const { accounts: cashAccounts } = useCashAccounts();

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/proposals/${proposalId}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) setProposal(data.proposal);
  }, [proposalId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const doAction = async (body: Record<string, unknown>) => {
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || "Lỗi");
      await reload();
      setShowDeclineBox(false);
      setShowPayModal(false);
      setDeclineNote("");
      setPayNote("");
    } catch (e: any) {
      setActionError(e.message || "Lỗi không xác định");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading || !proposal) {
    return (
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">
        Đang tải đề xuất...
      </div>
    );
  }

  const isOwnKs = proposal.ks.id === currentUserId;
  const showKsReceiveBtn =
    (isOwnKs || currentRole === "admin") &&
    proposal.status === "accepted" &&
    proposal.orderStatus === "ordered";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <Link href="/proposals" className="text-xs text-[#8892b0] hover:text-[#fb923c]">
          ‹ Quay lại danh sách
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-[#8892b0]">{proposal.project.code}</div>
            <h1 className="text-xl font-bold text-[#f0f2ff]">{proposal.project.name}</h1>
            <div className="mt-1 text-sm text-[#8892b0]">
              KS: <span className="text-[#f0f2ff]">{proposal.ks.fullName}</span> · Gửi lúc {fmtTime(proposal.createdAt)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_CHIP[proposal.status]}`}>
              {STATUS_LABEL[proposal.status]}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${ORDER_CHIP[proposal.orderStatus]}`}>
              {ORDER_LABEL[proposal.orderStatus]}
            </span>
          </div>
        </div>
      </div>

      <ProposalItemsCard proposal={proposal} />


      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xs uppercase tracking-wide text-[#8892b0]">Timeline</div>
        <div className="mt-2 space-y-1.5 text-sm">
          <TimelineRow label="KS chốt đề xuất" time={proposal.createdAt} active />
          <TimelineRow label="Kế toán duyệt" time={proposal.acceptedAt} active={!!proposal.acceptedAt} />
          {proposal.status === "declined" && (
            <TimelineRow
              label={`Kế toán từ chối${proposal.processedNote ? ` — ${proposal.processedNote}` : ""}`}
              time={proposal.acceptedAt}
              active
              variant="declined"
            />
          )}
          <TimelineRow label="Đã đặt NCC" time={proposal.orderedAt} active={!!proposal.orderedAt} />
          <TimelineRow label="KS nhận hàng tại công trình" time={proposal.receivedAt} active={!!proposal.receivedAt} />
          <TimelineRow
            label={`Đã thanh toán${proposal.paymentMethod ? ` (${paymentLabel(proposal.paymentMethod)})` : ""}`}
            time={proposal.paidAt}
            active={!!proposal.paidAt}
          />
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {actionError}
        </div>
      )}

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xs uppercase tracking-wide text-[#8892b0]">Hành động</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {isAccountantView && proposal.status === "pending" && (
            <>
              <button
                onClick={() => doAction({ action: "accept" })}
                disabled={actionBusy}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-emerald-400 disabled:opacity-50"
              >
                Duyệt
              </button>
              <button
                onClick={() => setShowDeclineBox((v) => !v)}
                disabled={actionBusy}
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                Từ chối
              </button>
            </>
          )}

          {isAccountantView && proposal.status === "accepted" && proposal.orderStatus === "not_ordered" && (
            <button
              onClick={() => doAction({ action: "mark_ordered" })}
              disabled={actionBusy}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-cyan-400 disabled:opacity-50"
            >
              Đã đặt NCC
            </button>
          )}

          {showKsReceiveBtn && (
            <button
              onClick={() => doAction({ action: "mark_received" })}
              disabled={actionBusy}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-emerald-400 disabled:opacity-50"
            >
              Đã nhận hàng tại công trình
            </button>
          )}

          {isAccountantView && proposal.status === "accepted" && proposal.orderStatus === "received" && (
            <button
              onClick={() => setShowPayModal(true)}
              disabled={actionBusy}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-emerald-400 disabled:opacity-50"
            >
              Hoàn tất thanh toán
            </button>
          )}

          {!isAccountantView &&
            !showKsReceiveBtn &&
            proposal.status === "pending" && (
              <div className="text-xs text-[#8892b0]">Đang chờ kế toán duyệt đề xuất.</div>
            )}
          {!isAccountantView &&
            !showKsReceiveBtn &&
            proposal.status === "accepted" &&
            proposal.orderStatus === "not_ordered" && (
              <div className="text-xs text-[#8892b0]">Kế toán đang xử lý đặt NCC.</div>
            )}
          {proposal.status === "declined" && (
            <div className="text-xs text-red-300">Đề xuất đã bị từ chối, kết thúc luồng.</div>
          )}
          {proposal.orderStatus === "paid" && (
            <div className="text-xs text-emerald-300">Đề xuất đã hoàn tất.</div>
          )}
        </div>

        {showDeclineBox && (
          <div className="mt-3 space-y-2 rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              rows={2}
              placeholder="Lý do từ chối (tuỳ chọn)"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => doAction({ action: "decline", note: declineNote.trim() || undefined })}
                disabled={actionBusy}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Xác nhận từ chối
              </button>
              <button
                onClick={() => setShowDeclineBox(false)}
                disabled={actionBusy}
                className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-xs text-[#8892b0]"
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {showPayModal && (
          <div className="mt-3 space-y-2 rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
            <div className="text-xs uppercase tracking-wide text-[#8892b0]">Số tiền đã chi (₫)</div>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="VD: 5500000"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
            <div className="text-xs uppercase tracking-wide text-[#8892b0]">Phương thức thanh toán</div>
            <div className="flex flex-wrap gap-2">
              {(["cash", "transfer", "debt"] as const).map((m) => (
                <label
                  key={m}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs ${
                    payMethod === m
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                      : "border-[#2d3249] bg-[#0b0d16] text-[#8892b0]"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymethod"
                    value={m}
                    checked={payMethod === m}
                    onChange={() => setPayMethod(m)}
                    className="hidden"
                  />
                  {paymentLabel(m)}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-[#5a627a]">
              {payMethod === "debt"
                ? "Công nợ: chưa xuất quỹ, không ghi nhật ký quỹ."
                : "Sau khi xác nhận sẽ tự động ghi vào sổ quỹ (giảm số dư công ty)."}
            </p>
            {payMethod !== "debt" && (
              <>
                <div className="text-xs uppercase tracking-wide text-[#8892b0]">Tài khoản chi *</div>
                <select
                  value={payAccountId}
                  onChange={(e) => setPayAccountId(e.target.value)}
                  className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
                >
                  <option value="">— Chọn tài khoản —</option>
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{formatCashAccountLabel(a)}</option>
                  ))}
                </select>
              </>
            )}
            <textarea
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              rows={2}
              placeholder="Ghi chú (số PT, ngày hẹn trả công nợ, …)"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const amt = Number(payAmount);
                  if (!Number.isFinite(amt) || amt <= 0) {
                    setActionError("Nhập số tiền > 0");
                    return;
                  }
                  if (payMethod !== "debt" && !payAccountId) {
                    setActionError("Chọn tài khoản chi");
                    return;
                  }
                  doAction({
                    action: "mark_paid",
                    paidAmount: amt,
                    paymentMethod: payMethod,
                    paymentNote: payNote.trim() || undefined,
                    ...(payMethod !== "debt" ? { accountId: payAccountId } : {}),
                  });
                }}
                disabled={actionBusy}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-[#0b0d16] disabled:opacity-50"
              >
                Xác nhận
              </button>
              <button
                onClick={() => setShowPayModal(false)}
                disabled={actionBusy}
                className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-xs text-[#8892b0]"
              >
                Hủy
              </button>
            </div>
          </div>
        )}
      </div>

      <ProposalComments proposalId={proposal.id} currentUserId={currentUserId} />
    </div>
  );
}

function ProposalItemsCard({ proposal }: { proposal: Proposal }) {
  const poRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const items: NormalizedItem[] = (proposal.parsedItems || []).map(normalizeItem);
  const hasItems = items.length > 0;
  const code = poCode(proposal.id);

  async function downloadPo() {
    if (!poRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(poRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `${code}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-[#8892b0]">Vật tư đề xuất</div>
            <div className="mt-0.5 text-[11px] text-[#5a627a]">Mã PO: {code}</div>
          </div>
          {hasItems && (
            <button
              type="button"
              onClick={downloadPo}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {downloading ? "Đang tạo..." : "Tải PO gửi NCC"}
            </button>
          )}
        </div>

        {hasItems ? (
          <div className="overflow-x-auto rounded-xl border border-[#252840]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#13151f] text-left text-[11px] uppercase tracking-wide text-[#8892b0]">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Chủng loại</th>
                  <th className="px-3 py-2 text-right w-20">SL</th>
                  <th className="px-3 py-2 w-16">ĐVT</th>
                  <th className="px-3 py-2">Dùng cho công tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-[#252840] text-[#f0f2ff]">
                    <td className="px-3 py-2 text-[#8892b0]">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{it.name || "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#fb923c]">{it.qty.toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-2">{it.unit}</td>
                    <td className="px-3 py-2 text-[#8892b0]">{it.task || <span className="text-[#5a627a]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="whitespace-pre-wrap rounded-xl border border-[#252840] bg-[#13151f] px-3 py-2.5 text-[14px] text-[#f0f2ff]">
            {proposal.description}
          </div>
        )}
      </div>

      {hasItems && (
        <PurchaseOrderTemplate poRef={poRef} code={code} items={items} proposal={proposal} />
      )}
    </>
  );
}

function PurchaseOrderTemplate({
  poRef,
  code,
  items,
  proposal,
}: {
  poRef: React.RefObject<HTMLDivElement>;
  code: string;
  items: NormalizedItem[];
  proposal: Proposal;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: "-9999px",
        width: "800px",
        background: "#ffffff",
        color: "#0f1320",
      }}
    >
      <div
        ref={poRef}
        style={{
          padding: "40px",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#ffffff",
          color: "#0f1320",
        }}
      >
        <div style={{ textAlign: "center", borderBottom: "3px solid #ff8a3d", paddingBottom: "16px", marginBottom: "24px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#ff8a3d", letterSpacing: "1px" }}>
            HUỲNH GIA 6 DECOR
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "8px", color: "#0f1320" }}>
            ĐƠN ĐẶT HÀNG VẬT TƯ
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", fontSize: "14px" }}>
          <div>
            <div><strong>Mã PO:</strong> {code}</div>
            <div><strong>Ngày:</strong> {new Date().toLocaleDateString("vi-VN")}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div><strong>Công trình:</strong> {proposal.project.code}</div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginBottom: "32px" }}>
          <thead>
            <tr style={{ background: "#fff3e6", borderBottom: "2px solid #ff8a3d" }}>
              <th style={{ padding: "10px 8px", textAlign: "left", width: "40px" }}>STT</th>
              <th style={{ padding: "10px 8px", textAlign: "left" }}>Chủng loại vật tư</th>
              <th style={{ padding: "10px 8px", textAlign: "right", width: "100px" }}>Số lượng</th>
              <th style={{ padding: "10px 8px", textAlign: "left", width: "80px" }}>Đơn vị</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "10px 8px" }}>{i + 1}</td>
                <td style={{ padding: "10px 8px", fontWeight: 500 }}>{it.name}</td>
                <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 600 }}>{it.qty.toLocaleString("vi-VN")}</td>
                <td style={{ padding: "10px 8px" }}>{it.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", fontSize: "13px" }}>
          <div style={{ textAlign: "center", width: "45%" }}>
            <div style={{ fontWeight: 600, marginBottom: "60px" }}>NHÀ CUNG CẤP</div>
            <div style={{ borderTop: "1px solid #0f1320", paddingTop: "4px", color: "#666" }}>(Ký, ghi rõ họ tên)</div>
          </div>
          <div style={{ textAlign: "center", width: "45%" }}>
            <div style={{ fontWeight: 600, marginBottom: "60px" }}>BÊN ĐẶT HÀNG</div>
            <div style={{ borderTop: "1px solid #0f1320", paddingTop: "4px", color: "#666" }}>(Ký, ghi rõ họ tên)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  label,
  time,
  active,
  variant = "default",
}: {
  label: string;
  time: string | null;
  active: boolean;
  variant?: "default" | "declined";
}) {
  const dotColor = variant === "declined" ? "bg-red-400" : active ? "bg-emerald-400" : "bg-[#2d3249]";
  const textColor = variant === "declined" ? "text-red-300" : active ? "text-[#f0f2ff]" : "text-[#5a627a]";
  return (
    <div className="flex items-start gap-2">
      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
      <div className="flex-1">
        <div className={`text-[13px] ${textColor}`}>{label}</div>
        <div className="text-[11px] text-[#5a627a]">{fmtTime(time)}</div>
      </div>
    </div>
  );
}

function paymentLabel(method: string) {
  if (method === "cash") return "Tiền mặt";
  if (method === "transfer") return "Chuyển khoản";
  if (method === "debt") return "Ghi công nợ";
  return method;
}
