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
function statusLabel(s: Expense["status"]) {
  if (s === "pending") return "Chờ chi";
  if (s === "paid") return "Đã chi";
  return "Đã huỷ";
}
function statusClass(s: Expense["status"]) {
  if (s === "pending") return "bg-amber-500/15 text-amber-300";
  if (s === "paid") return "bg-emerald-500/15 text-emerald-300";
  return "bg-zinc-500/15 text-zinc-300";
}

type CreateForm = {
  projectId: string;
  categoryId: string;
  amount: string;
  payee: string;
  paymentMethod: "cash" | "transfer";
  note: string;
  attachmentUrl: string;
};

const emptyCreate: CreateForm = {
  projectId: "",
  categoryId: "",
  amount: "",
  payee: "",
  paymentMethod: "transfer",
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
  }, [load]);

  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const totalPaid = useMemo(() => rows.reduce((s, r) => s + (r.paidAmount || 0), 0), [rows]);

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
  }

  function openPayDialog(e: Expense) {
    setOpenPay(e);
    setPayAmount(String(e.amount));
    setPayNote("");
    setPayReceiptUrl("");
    setPayDate(new Date().toISOString().slice(0, 10));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
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
          className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff] min-w-[200px]"
        />
        <div className="ml-auto flex gap-2">
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

      {showCreate && isAdmin && (
        <form onSubmit={submitCreate} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-4 space-y-3">
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

      <div className="rounded-xl border border-[#2d3249] bg-[#13151f] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#0b0d16]/60 text-[#8892b0]">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Ngày tạo</th>
              <th className="px-3 py-2 text-left">Dự án</th>
              <th className="px-3 py-2 text-left">Danh mục</th>
              <th className="px-3 py-2 text-right">Số tiền</th>
              <th className="px-3 py-2 text-left">Payee</th>
              <th className="px-3 py-2 text-left">Ghi chú</th>
              <th className="px-3 py-2 text-left">Người tạo</th>
              <th className="px-3 py-2 text-left">Trạng thái</th>
              <th className="px-3 py-2 text-left">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-[#8892b0]">
                  Đang tải…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-[#8892b0]">
                  Chưa có lệnh chi nào.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#2d3249]">
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2">
                  {r.project ? (
                    <span>
                      <span className="font-mono text-xs text-[#8b95b7]">{r.project.code}</span>{" "}
                      {r.project.name}
                    </span>
                  ) : (
                    <span className="text-[#8b95b7]">Chi chung</span>
                  )}
                </td>
                <td className="px-3 py-2">{r.category.name}</td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                  {money(r.amount)}
                  {r.paidAmount != null && r.paidAmount !== r.amount && (
                    <div className="text-xs text-emerald-300">Thực chi: {money(r.paidAmount)}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-[#cfd4e8]">{r.payee || "—"}</td>
                <td className="px-3 py-2 text-[#cfd4e8] max-w-[260px]">
                  <div className="truncate" title={r.note ?? ""}>
                    {r.note || "—"}
                  </div>
                  {r.paidNote && (
                    <div className="text-xs text-[#8b95b7] truncate" title={r.paidNote}>
                      KT: {r.paidNote}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-[#8b95b7]">{r.creator.fullName}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(r.status)}`}>
                    {statusLabel(r.status)}
                  </span>
                  {r.status === "paid" && r.paidAt && (
                    <div className="text-[10px] text-[#8b95b7] mt-1">{fmtDate(r.paidAt)}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.status === "pending" && canMarkPaid && (
                      <button
                        onClick={() => openPayDialog(r)}
                        className="rounded bg-emerald-500/15 text-emerald-300 px-2 py-1 text-xs"
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
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-[#0b0d16]/40 text-[#cfd4e8]">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right font-semibold">
                  Tổng {rows.length} lệnh:
                </td>
                <td className="px-3 py-2 text-right font-semibold">
                  {money(totalAmount)}
                  {totalPaid > 0 && (
                    <div className="text-xs text-emerald-300">Đã chi: {money(totalPaid)}</div>
                  )}
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

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
