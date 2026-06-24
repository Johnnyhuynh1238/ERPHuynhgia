"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ProjectOption = { id: string; code: string; name: string };
type CategoryOption = { id: string; code: string; name: string };

type Expense = {
  id: string;
  code: string;
  projectId: string | null;
  categoryId: string;
  amount: number;
  payee: string | null;
  paymentMethod: string | null;
  note: string | null;
  attachmentUrl: string | null;
  status: "pending" | "paid" | "cancelled";
  priority: "normal" | "urgent";
  createdAt: string;
  paidAt: string | null;
  paidAmount: number | null;
  paidNote: string | null;
  paidReceiptUrl: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  project: ProjectOption | null;
  category: CategoryOption;
  creator: { id: string; fullName: string };
  payer: { id: string; fullName: string } | null;
};

function money(v: number | null | undefined) {
  return `${Math.round(v || 0).toLocaleString("vi-VN")} đ`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function statusMeta(s: Expense["status"]) {
  if (s === "pending") return { label: "Chờ chi", cls: "bg-amber-500/15 text-amber-300" };
  if (s === "paid") return { label: "Đã chi", cls: "bg-emerald-500/15 text-emerald-300" };
  return { label: "Đã huỷ", cls: "bg-zinc-500/15 text-zinc-300" };
}

type CreateForm = {
  projectId: string;
  categoryId: string;
  amount: string;
  payee: string;
  paymentMethod: "cash" | "transfer";
  priority: "normal" | "urgent";
  note: string;
  attachmentUrl: string;
};

const emptyCreate: CreateForm = {
  projectId: "",
  categoryId: "",
  amount: "",
  payee: "",
  paymentMethod: "transfer",
  priority: "normal",
  note: "",
  attachmentUrl: "",
};

export function ExpensesClient({
  role,
  projects,
  categories,
}: {
  role: string;
  projects: ProjectOption[];
  categories: CategoryOption[];
}) {
  const isAdmin = role === "admin";
  const canMarkPaid = role === "admin" || role === "accountant";

  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("pending");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [balance, setBalance] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingTotal, setPendingTotal] = useState<number>(0);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreate);
  const [creating, setCreating] = useState(false);

  const [openPay, setOpenPay] = useState<Expense | null>(null);
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [payReceiptUrl, setPayReceiptUrl] = useState("");

  const [openCancel, setOpenCancel] = useState<Expense | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const loadBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/treasury/summary", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setBalance(Number(j.currentBalance ?? 0));
        setPendingCount(Number(j.pendingExpenseCount ?? 0));
        setPendingTotal(Number(j.pendingExpenseTotal ?? 0));
      }
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (projectFilter) qs.set("projectId", projectFilter);
    if (categoryFilter) qs.set("categoryId", categoryFilter);
    if (search.trim()) qs.set("search", search.trim());
    const res = await fetch(`/api/expenses?${qs.toString()}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast.error(j.message || "Không tải được danh sách lệnh chi");
      return;
    }
    setRows(j.rows || []);
  }, [status, projectFilter, categoryFilter, search]);

  useEffect(() => {
    load();
    loadBalance();
  }, [load, loadBalance]);

  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const totalPaid = useMemo(() => rows.reduce((s, r) => s + (r.paidAmount || 0), 0), [rows]);

  const balanceAfterForm = useMemo(() => {
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || balance == null) return null;
    return balance - amt;
  }, [form.amount, balance]);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.categoryId) {
      toast.error("Chọn danh mục");
      return;
    }
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nhập số tiền > 0");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: form.projectId || null,
        categoryId: form.categoryId,
        amount: amt,
        payee: form.payee.trim() || null,
        paymentMethod: form.paymentMethod,
        priority: form.priority,
        note: form.note.trim() || null,
        attachmentUrl: form.attachmentUrl.trim() || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      toast.error(j.message || "Không tạo được lệnh chi");
      return;
    }
    toast.success(j.message || "Đã tạo lệnh chi");
    setShowCreate(false);
    setForm(emptyCreate);
    load();
    loadBalance();
  }

  async function submitPay(e: FormEvent) {
    e.preventDefault();
    if (!openPay) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nhập số tiền > 0");
      return;
    }
    setPaying(true);
    const res = await fetch(`/api/expenses/${openPay.id}/mark-paid`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paidAt: payDate,
        paidAmount: amt,
        paidNote: payNote.trim() || null,
        paidReceiptUrl: payReceiptUrl.trim() || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setPaying(false);
    if (!res.ok) {
      toast.error(j.message || "Không đánh dấu được");
      return;
    }
    toast.success(j.message || "Đã ghi sổ quỹ");
    setOpenPay(null);
    setPayAmount("");
    setPayNote("");
    setPayReceiptUrl("");
    setPayDate(new Date().toISOString().slice(0, 10));
    load();
    loadBalance();
  }

  async function submitCancel() {
    if (!openCancel) return;
    if (!cancelReason.trim()) {
      toast.error("Nhập lý do huỷ");
      return;
    }
    setCancelling(true);
    const res = await fetch(`/api/expenses/${openCancel.id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: cancelReason.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setCancelling(false);
    if (!res.ok) {
      toast.error(j.message || "Không huỷ được");
      return;
    }
    toast.success(j.message || "Đã huỷ");
    setOpenCancel(null);
    setCancelReason("");
    load();
    loadBalance();
  }

  function openPayDialog(e: Expense) {
    setOpenPay(e);
    setPayAmount(String(e.amount));
    setPayNote("");
    setPayReceiptUrl("");
    setPayDate(new Date().toISOString().slice(0, 10));
  }

  const balanceTone =
    balance == null
      ? "text-[#8b95b7]"
      : balance < 5_000_000
        ? "text-red-300"
        : balance < 20_000_000
          ? "text-amber-300"
          : "text-emerald-300";

  return (
    <div className="space-y-3">
      {/* Top bar: balance + actions */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-wide text-[#8892b0]">Số dư quỹ</span>
          <span className={`text-base font-bold ${balanceTone}`}>
            {balance == null ? "…" : money(balance)}
          </span>
        </div>
        {pendingCount > 0 && (
          <div className="text-[11px] text-amber-300">
            · Chờ chi: {pendingCount} lệnh ({money(pendingTotal)})
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded-lg border px-2 py-1 text-xs ${
              showFilters
                ? "border-[#f97316] bg-[#f97316]/15 text-[#fb923c]"
                : "border-[#2d3249] text-[#8b95b7] hover:text-[#f0f2ff]"
            }`}
            title="Bộ lọc"
            aria-label="Bộ lọc"
          >
            ⏷ Lọc
          </button>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="rounded-full border border-[#2d3249] px-2 py-1 text-xs text-[#8b95b7] hover:text-[#f0f2ff]"
            title="Hướng dẫn"
            aria-label="Hướng dẫn"
          >
            ?
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-[#0b0d16]"
            >
              + Lệnh chi
            </button>
          )}
        </div>
      </div>

      {/* Filters (collapsible) */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] p-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
          >
            <option value="pending">Cần chi</option>
            <option value="paid">Đã chi</option>
            <option value="cancelled">Đã huỷ</option>
            <option value="all">Tất cả</option>
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
          >
            <option value="">Tất cả dự án</option>
            <option value="none">Chi chung công ty</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo code/payee/ghi chú"
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff] min-w-[180px] flex-1"
          />
        </div>
      )}

      {/* Create form */}
      {showCreate && isAdmin && (
        <form onSubmit={submitCreate} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 space-y-3">
          <div className="flex flex-wrap items-baseline gap-3 rounded-lg bg-[#0b0d16] px-3 py-2 text-xs">
            <span className="text-[#8892b0]">Số dư quỹ hiện tại:</span>
            <span className={`font-bold ${balanceTone}`}>{balance == null ? "…" : money(balance)}</span>
            {balanceAfterForm != null && Number(form.amount) > 0 && (
              <>
                <span className="text-[#8892b0]">→ sau khi chi:</span>
                <span className={balanceAfterForm < 0 ? "font-bold text-red-300" : "font-semibold text-[#cfd4e8]"}>
                  {money(balanceAfterForm)}
                </span>
                {balanceAfterForm < 0 && <span className="text-red-300">⚠ vượt quỹ</span>}
              </>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Chi cho dự án</span>
              <select
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              >
                <option value="">Chi chung công ty</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Danh mục *</span>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              >
                <option value="">— Chọn —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Số tiền (₫) *</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Người/đơn vị nhận</span>
              <input
                value={form.payee}
                onChange={(e) => setForm({ ...form, payee: e.target.value })}
                placeholder="VD: Cửa hàng VLXD Minh Anh"
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Phương thức</span>
              <select
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm({ ...form, paymentMethod: e.target.value as "cash" | "transfer" })
                }
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              >
                <option value="transfer">Chuyển khoản</option>
                <option value="cash">Tiền mặt</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Link đính kèm (hoá đơn/báo giá)</span>
              <input
                value={form.attachmentUrl}
                onChange={(e) => setForm({ ...form, attachmentUrl: e.target.value })}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
          </div>

          {/* Priority toggle */}
          <div>
            <div className="text-xs text-[#8b95b7] mb-1">Độ khẩn</div>
            <div className="inline-flex rounded-lg border border-[#2d3249] bg-[#0b0d16] p-0.5">
              <button
                type="button"
                onClick={() => setForm({ ...form, priority: "normal" })}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  form.priority === "normal"
                    ? "bg-[#2a2f44] text-[#f0f2ff]"
                    : "text-[#8b95b7]"
                }`}
              >
                Thường (nhắc 15ph/lần)
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, priority: "urgent" })}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  form.priority === "urgent"
                    ? "bg-red-500/20 text-red-200"
                    : "text-[#8b95b7]"
                }`}
              >
                🚨 Gấp (nhắc 1ph/lần)
              </button>
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-[#8b95b7]">Ghi chú</span>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Nội dung chi (vd: mua mực in cho VP, xăng xe đi công trình…)"
              className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
            >
              {creating ? "Đang tạo…" : "Gửi KT thanh toán"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setForm(emptyCreate);
              }}
              className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#8b95b7]"
            >
              Huỷ
            </button>
          </div>
        </form>
      )}

      {/* Card list */}
      {loading && (
        <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-6 text-center text-sm text-[#8892b0]">
          Đang tải…
        </div>
      )}
      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-6 text-center text-sm text-[#8892b0]">
          Chưa có lệnh chi nào.
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const st = statusMeta(r.status);
            const isUrgent = r.priority === "urgent" && r.status === "pending";
            return (
              <div
                key={r.id}
                className={`rounded-xl border bg-[#13151f] p-3 space-y-2 ${
                  isUrgent ? "border-red-400/60 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]" : "border-[#2d3249]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-[#8b95b7]">{r.code}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                      {isUrgent && (
                        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-200">
                          🚨 GẤP
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-[#8b95b7]">
                      {fmtDate(r.createdAt)} · {r.creator.fullName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-[#f0f2ff] whitespace-nowrap">
                      {money(r.amount)}
                    </div>
                    {r.paidAmount != null && r.paidAmount !== r.amount && (
                      <div className="text-[11px] text-emerald-300 whitespace-nowrap">
                        Thực chi {money(r.paidAmount)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-xs text-[#cfd4e8]">
                  <span className="text-[#8b95b7]">{r.category.name}</span>
                  {r.payee && <span> · {r.payee}</span>}
                </div>
                <div className="text-[11px] text-[#8b95b7]">
                  {r.project ? (
                    <>
                      <span className="font-mono">{r.project.code}</span> — {r.project.name}
                    </>
                  ) : (
                    <>Chi chung công ty</>
                  )}
                </div>

                {r.note && (
                  <div className="text-xs text-[#cfd4e8] bg-[#0b0d16] rounded px-2 py-1.5">{r.note}</div>
                )}

                {r.status === "paid" && (
                  <div className="text-[11px] text-emerald-300/80">
                    Đã chi ngày {fmtDate(r.paidAt)}
                    {r.payer ? ` · KT ${r.payer.fullName}` : ""}
                    {r.paidNote ? ` · ${r.paidNote}` : ""}
                  </div>
                )}
                {r.status === "cancelled" && (
                  <div className="text-[11px] text-zinc-400">
                    Huỷ ngày {fmtDate(r.cancelledAt)}
                    {r.cancelledReason ? ` · ${r.cancelledReason}` : ""}
                  </div>
                )}

                <div className="flex flex-wrap gap-1 pt-1">
                  {r.status === "pending" && canMarkPaid && (
                    <button
                      onClick={() => openPayDialog(r)}
                      className="rounded bg-emerald-500/20 text-emerald-300 px-2 py-1 text-xs font-medium"
                    >
                      Đã chi
                    </button>
                  )}
                  {r.status === "pending" && isAdmin && (
                    <button
                      onClick={() => {
                        setOpenCancel(r);
                        setCancelReason("");
                      }}
                      className="rounded bg-red-500/15 text-red-300 px-2 py-1 text-xs"
                    >
                      Huỷ
                    </button>
                  )}
                  {r.attachmentUrl && (
                    <a
                      href={r.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded bg-blue-500/15 text-blue-300 px-2 py-1 text-xs"
                    >
                      Hoá đơn
                    </a>
                  )}
                  {r.paidReceiptUrl && (
                    <a
                      href={r.paidReceiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded bg-emerald-500/15 text-emerald-300 px-2 py-1 text-xs"
                    >
                      Chứng từ
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-[#2d3249] bg-[#0b0d16]/50 px-3 py-2 text-xs text-[#cfd4e8] flex flex-wrap gap-x-3 gap-y-1">
          <span>
            Tổng <b>{rows.length}</b> lệnh · {money(totalAmount)}
          </span>
          {totalPaid > 0 && <span className="text-emerald-300">Đã chi: {money(totalPaid)}</span>}
        </div>
      )}

      {/* Help modal */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-3 rounded-xl border border-[#2d3249] bg-[#13151f] p-4 text-sm text-[#cfd4e8]"
          >
            <div className="text-base font-semibold text-orange-300">Hướng dẫn dùng Lệnh chi</div>
            <div className="space-y-2">
              <p>
                <b>Admin</b> tạo lệnh chi (vật tư, văn phòng, máy móc, …) → KT nhận push +
                bell → KT bấm <b className="text-emerald-300">“Đã chi”</b> sau khi chuyển tiền.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[13px]">
                <li>
                  <b className="text-red-300">🚨 Gấp</b>: nhắc KT mỗi <b>1 phút</b> đến khi xử lý.
                </li>
                <li>
                  <b>Thường</b>: nhắc mỗi <b>15 phút</b>.
                </li>
                <li>
                  Khi tạo, anh thấy ngay <b>số dư quỹ trước/sau</b> để biết có vượt không.
                </li>
                <li>
                  Lệnh đã <b>“Đã chi”</b> sẽ tự trừ vào sổ quỹ — không huỷ được. Sai thì xoá ở
                  /treasury (nguồn).
                </li>
                <li>
                  Lệnh đang <b>chờ chi</b> mới huỷ được, phải nhập lý do.
                </li>
              </ul>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowHelp(false)}
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-[#0b0d16]"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay dialog */}
      {openPay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpenPay(null)}
        >
          <form
            onSubmit={submitPay}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-xl border border-[#2d3249] bg-[#13151f] p-4"
          >
            <div className="text-base font-semibold text-emerald-300">Đánh dấu đã chi</div>
            <div className="text-xs text-[#8b95b7]">
              {openPay.code} — {openPay.category.name} — {money(openPay.amount)}
            </div>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Số tiền thực chi (₫) *</span>
              <input
                type="number"
                min={0}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Ngày chi *</span>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Link chứng từ chi</span>
              <input
                value={payReceiptUrl}
                onChange={(e) => setPayReceiptUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Ghi chú KT</span>
              <textarea
                rows={2}
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <div className="text-[11px] text-amber-300">
              Lưu ý: trừ vào số dư công ty trong sổ quỹ. Không huỷ được sau khi xác nhận.
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={paying}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
              >
                {paying ? "Đang ghi…" : "Xác nhận đã chi"}
              </button>
              <button
                type="button"
                onClick={() => setOpenPay(null)}
                className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#8b95b7]"
              >
                Huỷ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel dialog */}
      {openCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpenCancel(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-xl border border-[#2d3249] bg-[#13151f] p-4"
          >
            <div className="text-base font-semibold text-red-300">Huỷ lệnh chi {openCancel.code}</div>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Lý do huỷ *</span>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={submitCancel}
                disabled={cancelling}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
              >
                {cancelling ? "Đang huỷ…" : "Xác nhận huỷ"}
              </button>
              <button
                onClick={() => setOpenCancel(null)}
                className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-sm text-[#8b95b7]"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
