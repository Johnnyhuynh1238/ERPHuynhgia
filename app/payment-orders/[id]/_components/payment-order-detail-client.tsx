"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCashAccounts, formatCashAccountLabel } from "@/lib/use-cash-accounts";

type Status = "pending" | "approved" | "paid" | "rejected" | "cancelled";

type Item = {
  id: string;
  amount: number;
  debtId: string;
  proposalId: string;
  materialName: string;
  unit: string;
  supplierItemCode: string | null;
  unitPrice: number;
  qty: number;
  note: string | null;
  project: { id: string; code: string; name: string };
};

type Order = {
  id: string;
  code: string;
  status: Status;
  totalAmount: number;
  paymentMethod: "cash" | "transfer" | null;
  note: string | null;
  createdAt: string;
  approvedAt: string | null;
  approvalNote: string | null;
  rejectedAt: string | null;
  rejectionNote: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  supplier: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    bankName: string | null;
    bankAccount: string | null;
    bankAccountName: string | null;
  };
  account: { id: string; code: string; name: string; kind: "cash" | "bank" } | null;
  creator: { id: string; fullName: string } | null;
  approver: { id: string; fullName: string } | null;
  rejecter: { id: string; fullName: string } | null;
  payer: { id: string; fullName: string } | null;
  items: Item[];
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "Chờ admin duyệt",
  approved: "Đã duyệt — chờ chi",
  paid: "Đã chi",
  rejected: "Bị từ chối",
  cancelled: "Đã huỷ",
};
const STATUS_CHIP: Record<Status, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  approved: "bg-blue-500/15 text-blue-300",
  paid: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-red-500/15 text-red-300",
  cancelled: "bg-slate-500/15 text-slate-300",
};

const vnd = (n: number) => n.toLocaleString("vi-VN") + "đ";
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function PaymentOrderDetailClient({
  orderId,
  currentUserId,
  isAdmin,
}: {
  orderId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [approveNote, setApproveNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/payment-orders/${orderId}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) setOrder(json.order);
    else toast.error(json.message || "Lỗi tải");
  }, [orderId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function approve() {
    setBusy(true);
    const res = await fetch(`/api/payment-orders/${orderId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: approveNote.trim() || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(j.message || "Lỗi duyệt");
      return;
    }
    toast.success("Đã duyệt — KT có thể chi");
    setShowApprove(false);
    setApproveNote("");
    reload();
  }

  async function reject() {
    if (!rejectNote.trim()) {
      toast.error("Cần nhập lý do từ chối");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/payment-orders/${orderId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: rejectNote.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(j.message || "Lỗi từ chối");
      return;
    }
    toast.success("Đã từ chối lệnh");
    setShowReject(false);
    setRejectNote("");
    reload();
  }

  async function cancel() {
    if (!window.confirm("Huỷ lệnh thanh toán này?")) return;
    setBusy(true);
    const res = await fetch(`/api/payment-orders/${orderId}/cancel`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(j.message || "Lỗi huỷ");
      return;
    }
    toast.success("Đã huỷ lệnh");
    reload();
  }

  if (loading || !order) {
    return (
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" /> Đang tải…
      </div>
    );
  }

  const isCreator = order.creator?.id === currentUserId;
  const canApproveReject = isAdmin && order.status === "pending";
  const canPay = order.status === "approved"; // KT hoặc admin
  const canCancel = order.status === "pending" && (isCreator || isAdmin);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-mono text-[#8892b0]">{order.code}</div>
            <div className="mt-0.5 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-orange-400" />
              <h1 className="text-lg font-semibold text-[#f0f2ff]">{order.supplier.name}</h1>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_CHIP[order.status]}`}
          >
            {STATUS_LABEL[order.status]}
          </span>
        </div>

        <div className="mt-3 rounded-xl bg-[#13151f] p-3">
          <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">Tổng tiền</div>
          <div className="mt-0.5 text-2xl font-bold text-orange-400">{vnd(order.totalAmount)}</div>
          <div className="text-[11px] text-[#8892b0]">{order.items.length} món vật tư</div>
        </div>

        {(order.supplier.bankName || order.supplier.bankAccount) && (
          <div className="mt-3 grid grid-cols-1 gap-1 rounded-xl border border-[#252840] bg-[#13151f] p-3 text-xs">
            {order.supplier.bankName && (
              <Row label="Ngân hàng" value={order.supplier.bankName} />
            )}
            {order.supplier.bankAccount && (
              <Row label="STK" value={order.supplier.bankAccount} />
            )}
            {order.supplier.bankAccountName && (
              <Row label="Chủ TK" value={order.supplier.bankAccountName} />
            )}
            {order.supplier.phone && <Row label="ĐT" value={order.supplier.phone} />}
          </div>
        )}

        {order.note && (
          <div className="mt-3 rounded-xl border border-[#252840] bg-[#13151f] p-3 text-xs text-[#f0f2ff]">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-[#8892b0]">Ghi chú KT</div>
            {order.note}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xs uppercase tracking-wide text-[#8892b0]">Lịch sử</div>
        <div className="mt-2 space-y-2 text-xs">
          <TimelineRow
            icon={<FileText className="h-3 w-3" />}
            label={`KT tạo lệnh — ${order.creator?.fullName ?? "—"}`}
            time={order.createdAt}
            active
          />
          {order.status !== "cancelled" && (
            <>
              {order.approvedAt && (
                <TimelineRow
                  icon={<CheckCircle2 className="h-3 w-3" />}
                  label={`Admin duyệt — ${order.approver?.fullName ?? "—"}${order.approvalNote ? ` · ${order.approvalNote}` : ""}`}
                  time={order.approvedAt}
                  active
                  variant="ok"
                />
              )}
              {order.rejectedAt && (
                <TimelineRow
                  icon={<XCircle className="h-3 w-3" />}
                  label={`Admin từ chối — ${order.rejecter?.fullName ?? "—"} · ${order.rejectionNote ?? ""}`}
                  time={order.rejectedAt}
                  active
                  variant="error"
                />
              )}
              {order.paidAt && (
                <TimelineRow
                  icon={<Wallet className="h-3 w-3" />}
                  label={`Đã chi — ${order.payer?.fullName ?? "—"}${order.account ? ` · ${order.account.name}` : ""}`}
                  time={order.paidAt}
                  active
                  variant="ok"
                />
              )}
              {order.status === "pending" && (
                <TimelineRow
                  icon={<Clock className="h-3 w-3" />}
                  label="Chờ admin duyệt"
                  time={null}
                  active={false}
                />
              )}
              {order.status === "approved" && (
                <TimelineRow
                  icon={<Clock className="h-3 w-3" />}
                  label="Chờ KT thực hiện chi"
                  time={null}
                  active={false}
                />
              )}
            </>
          )}
          {order.status === "cancelled" && order.cancelledAt && (
            <TimelineRow
              icon={<XCircle className="h-3 w-3" />}
              label="Đã huỷ"
              time={order.cancelledAt}
              active
              variant="error"
            />
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xs uppercase tracking-wide text-[#8892b0]">Chi tiết vật tư</div>
        <div className="mt-2 space-y-2">
          {order.items.map((it) => (
            <div
              key={it.id}
              className="rounded-xl border border-[#252840] bg-[#13151f] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#f0f2ff] break-words">
                    {it.materialName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#8892b0]">
                    {it.qty.toLocaleString("vi-VN")} {it.unit} × {vnd(it.unitPrice)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#8892b0]">
                    <FileText className="h-3 w-3" />
                    <Link
                      href={`/proposals/${it.proposalId}`}
                      className="hover:text-orange-400"
                    >
                      {it.project.code}
                    </Link>
                    {it.supplierItemCode && <span>· Mã NCC: {it.supplierItemCode}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-bold text-orange-400">
                  {vnd(it.amount)}
                </div>
              </div>
              {it.note && (
                <div className="mt-2 rounded bg-[#0b0d16] px-2 py-1 text-[11px] text-[#8892b0]">
                  {it.note}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {(canApproveReject || canPay || canCancel) && (
        <div className="sticky bottom-2 z-10 rounded-2xl border border-orange-400/40 bg-[#1a1d2e] p-3 shadow-lg">
          <div className="text-xs uppercase tracking-wide text-[#8892b0]">Hành động</div>
          <div className="mt-2 flex flex-col gap-2">
            {canApproveReject && (
              <>
                <button
                  type="button"
                  onClick={() => setShowApprove(true)}
                  disabled={busy}
                  className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-[#0b0d16] active:scale-95 disabled:opacity-50"
                >
                  Duyệt lệnh
                </button>
                <button
                  type="button"
                  onClick={() => setShowReject(true)}
                  disabled={busy}
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 active:scale-95 disabled:opacity-50"
                >
                  Từ chối
                </button>
              </>
            )}
            {canPay && (
              <button
                type="button"
                onClick={() => setShowPay(true)}
                disabled={busy}
                className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-[#0b0d16] active:scale-95 disabled:opacity-50"
              >
                Ghi chi quỹ
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="rounded-xl border border-[#2d3249] bg-[#0b0d16] px-4 py-2 text-xs text-[#8892b0] active:scale-95 disabled:opacity-50"
              >
                Huỷ lệnh
              </button>
            )}
          </div>
        </div>
      )}

      {showApprove && (
        <NoteModal
          title="Duyệt lệnh thanh toán"
          desc={`${order.supplier.name} · ${vnd(order.totalAmount)}`}
          note={approveNote}
          setNote={setApproveNote}
          placeholder="Ghi chú duyệt (tuỳ chọn)"
          busy={busy}
          onCancel={() => setShowApprove(false)}
          onSubmit={approve}
          submitLabel="Duyệt"
          submitColor="emerald"
        />
      )}

      {showReject && (
        <NoteModal
          title="Từ chối lệnh"
          desc={`${order.supplier.name} · ${vnd(order.totalAmount)}`}
          note={rejectNote}
          setNote={setRejectNote}
          placeholder="Lý do từ chối (bắt buộc)"
          busy={busy}
          onCancel={() => setShowReject(false)}
          onSubmit={reject}
          submitLabel="Từ chối"
          submitColor="red"
          required
        />
      )}

      {showPay && (
        <PayModal
          totalAmount={order.totalAmount}
          orderCode={order.code}
          suggestedMethod={order.paymentMethod ?? "transfer"}
          onClose={() => setShowPay(false)}
          onPaid={() => {
            setShowPay(false);
            reload();
          }}
          orderId={orderId}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#8892b0]">{label}</span>
      <span className="text-right font-medium text-[#f0f2ff]">{value}</span>
    </div>
  );
}

function TimelineRow({
  icon,
  label,
  time,
  active,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  time: string | null;
  active: boolean;
  variant?: "default" | "ok" | "error";
}) {
  const dotColor =
    variant === "error"
      ? "bg-red-400 text-red-300"
      : variant === "ok"
      ? "bg-emerald-400 text-emerald-300"
      : active
      ? "bg-orange-400 text-orange-300"
      : "bg-[#2d3249] text-[#5a627a]";
  return (
    <div className="flex items-start gap-2">
      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${dotColor}`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className={`text-[12px] ${active ? "text-[#f0f2ff]" : "text-[#5a627a]"}`}>{label}</div>
        <div className="text-[10px] text-[#5a627a]">{time ? fmtTime(time) : ""}</div>
      </div>
    </div>
  );
}

function NoteModal({
  title,
  desc,
  note,
  setNote,
  placeholder,
  busy,
  onCancel,
  onSubmit,
  submitLabel,
  submitColor,
  required,
}: {
  title: string;
  desc: string;
  note: string;
  setNote: (s: string) => void;
  placeholder: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitColor: "emerald" | "red";
  required?: boolean;
}) {
  const colorCls =
    submitColor === "red"
      ? "bg-red-500 text-white"
      : "bg-emerald-500 text-[#0b0d16]";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-[#1a1d2e] p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold text-orange-300">{title}</div>
        <div className="mt-1 text-xs text-[#8892b0]">{desc}</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder={placeholder + (required ? " *" : "")}
          className="mt-3 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-[#2d3249] px-3 py-2 text-sm text-[#8892b0]"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || (required && !note.trim())}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50 ${colorCls}`}
          >
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayModal({
  totalAmount,
  orderCode,
  suggestedMethod,
  orderId,
  onClose,
  onPaid,
}: {
  totalAmount: number;
  orderCode: string;
  suggestedMethod: "cash" | "transfer";
  orderId: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<"cash" | "transfer">(suggestedMethod);
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { accounts, loading } = useCashAccounts();

  const filtered = accounts.filter((a) =>
    method === "transfer" ? a.kind === "bank" : a.kind === "cash",
  );

  async function submit() {
    if (!accountId) {
      toast.error("Chọn tài khoản chi");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/payment-orders/${orderId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        paymentMethod: method,
        paidAmount: totalAmount,
        note: note.trim() || undefined,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error(j.message || "Lỗi ghi chi");
      return;
    }
    toast.success("Đã ghi chi quỹ");
    onPaid();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-[#1a1d2e] p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold text-orange-300">Ghi chi quỹ</div>
        <div className="mt-1 text-xs text-[#8892b0]">
          Lệnh {orderCode} · {vnd(totalAmount)}
        </div>

        <div className="mt-3 text-xs uppercase tracking-wide text-[#8892b0]">Phương thức</div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(["transfer", "cash"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMethod(m);
                setAccountId("");
              }}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                method === m
                  ? "border-orange-400 bg-orange-500/10 text-orange-300"
                  : "border-[#2d3249] bg-[#0b0d16] text-[#8892b0]"
              }`}
            >
              {m === "transfer" ? "Chuyển khoản" : "Tiền mặt"}
            </button>
          ))}
        </div>

        <div className="mt-3 text-xs uppercase tracking-wide text-[#8892b0]">
          Tài khoản chi *
        </div>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          disabled={loading}
          className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
        >
          <option value="">— Chọn tài khoản —</option>
          {filtered.map((a) => (
            <option key={a.id} value={a.id}>
              {formatCashAccountLabel(a)}
            </option>
          ))}
        </select>
        {!loading && filtered.length === 0 && (
          <div className="mt-1 text-[11px] text-amber-300">
            Không có tài khoản {method === "transfer" ? "ngân hàng" : "tiền mặt"} đang hoạt động.
          </div>
        )}

        <div className="mt-3 text-xs uppercase tracking-wide text-[#8892b0]">Ghi chú</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Số UNC, ngày giao dịch…"
          className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-[#2d3249] px-3 py-2 text-sm text-[#8892b0]"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !accountId}
            className="flex-1 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
          >
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Xác nhận chi"}
          </button>
        </div>
      </div>
    </div>
  );
}
