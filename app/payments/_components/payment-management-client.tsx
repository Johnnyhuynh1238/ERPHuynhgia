"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCashAccounts, formatCashAccountLabel } from "@/lib/use-cash-accounts";

type ProjectOption = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  contractValue: number | null;
};

type Payment = {
  id: string;
  type: "contract" | "addendum";
  installmentNo: number;
  description: string;
  amount: number;
  dueDate: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  paidAt: string | null;
  paidAmount: number | null;
  receiptUrl: string | null;
  paymentNote: string | null;
};

type Drawing = {
  id: string;
  name: string;
  description: string | null;
  fileSizeBytes: number;
  viewUrl: string;
  uploadedAt: string;
  uploader?: { fullName: string } | null;
};

type PaymentForm = {
  type: "contract" | "addendum";
  installmentNo: string;
  description: string;
  amount: string;
  dueDate: string;
};

const emptyPaymentForm: PaymentForm = { type: "contract", installmentNo: "", description: "", amount: "", dueDate: "" };

function money(value: number | null | undefined) {
  return `${Math.round(value || 0).toLocaleString("vi-VN")} đ`;
}

function dateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function statusText(status: Payment["status"]) {
  if (status === "paid") return "Đã thu";
  if (status === "overdue") return "Quá hạn";
  if (status === "cancelled") return "Đã hủy";
  return "Chờ thu";
}

export function PaymentManagementClient({ projects, isAdmin }: { projects: ProjectOption[]; isAdmin: boolean }) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || "");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm);
  const [drawingUploading, setDrawingUploading] = useState(false);
  const { accounts: cashAccounts } = useCashAccounts();

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) || null, [projects, selectedProjectId]);
  const paidTotal = payments.reduce((sum, payment) => sum + (payment.status === "paid" ? payment.paidAmount || payment.amount : 0), 0);
  const scheduleTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const contractValue = selectedProject?.contractValue || scheduleTotal;

  async function loadProject(projectId: string) {
    if (!projectId) return;
    setLoading(true);
    try {
      const [paymentsRes, drawingsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/payment-schedules`, { cache: "no-store" }),
        fetch(`/api/projects/${projectId}/drawings`, { cache: "no-store" }),
      ]);
      const paymentsJson = await paymentsRes.json().catch(() => ({}));
      const drawingsJson = await drawingsRes.json().catch(() => ({}));
      if (!paymentsRes.ok) throw new Error(paymentsJson.message || "Không tải được lịch thanh toán");
      setPayments(paymentsJson.payments || []);
      setDrawings(drawingsRes.ok ? drawingsJson.drawings || [] : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProject(selectedProjectId);
  }, [selectedProjectId]);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;
    const res = await fetch(`/api/projects/${selectedProjectId}/payment-schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: paymentForm.type,
        installmentNo: paymentForm.installmentNo,
        description: paymentForm.description,
        amount: paymentForm.amount,
        dueDate: paymentForm.dueDate,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không tạo được đợt thanh toán");
      return;
    }
    toast.success(json.message || "Đã tạo đợt thanh toán");
    setPaymentForm(emptyPaymentForm);
    await loadProject(selectedProjectId);
  }

  async function deletePayment(payment: Payment) {
    if (!window.confirm(`Xóa đợt ${payment.installmentNo}?`)) return;
    const res = await fetch(`/api/payment-schedules/${payment.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không xóa được đợt thanh toán");
      return;
    }
    toast.success(json.message || "Đã xóa đợt thanh toán");
    await loadProject(selectedProjectId);
  }

  async function editPayment(payment: Payment) {
    const description = window.prompt("Mô tả", payment.description);
    if (description === null) return;
    const amount = window.prompt("Số tiền", String(payment.amount));
    if (amount === null) return;
    const dueDate = window.prompt("Ngày hạn (YYYY-MM-DD)", dateInput(payment.dueDate));
    if (dueDate === null) return;

    const res = await fetch(`/api/payment-schedules/${payment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, amount, dueDate }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không cập nhật được đợt thanh toán");
      return;
    }
    toast.success(json.message || "Đã cập nhật đợt thanh toán");
    await loadProject(selectedProjectId);
  }

  async function markPaid(event: FormEvent<HTMLFormElement>, payment: Payment) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const receipt = formData.get("receipt");
    if (!(receipt instanceof File) || !receipt.name) {
      toast.error("Vui lòng chọn file biên lai");
      return;
    }

    const receiptData = new FormData();
    receiptData.append("receipt", receipt);
    const receiptRes = await fetch(`/api/payment-schedules/${payment.id}/receipt`, { method: "POST", body: receiptData });
    const receiptJson = await receiptRes.json().catch(() => ({}));
    if (!receiptRes.ok) {
      toast.error(receiptJson.message || "Không upload được biên lai");
      return;
    }

    const accountId = formData.get("accountId");
    if (!accountId || typeof accountId !== "string") {
      toast.error("Chọn tài khoản nhận");
      return;
    }
    const res = await fetch(`/api/payment-schedules/${payment.id}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paidAt: formData.get("paidAt"),
        paidAmount: formData.get("paidAmount"),
        receiptUrl: receiptJson.receiptUrl,
        paymentNote: formData.get("paymentNote"),
        accountId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không đánh dấu đã thu được");
      return;
    }
    toast.success(json.message || "Đã đánh dấu đã thu");
    form.reset();
    await loadProject(selectedProjectId);
  }

  async function uploadDrawing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setDrawingUploading(true);
    const formData = new FormData(event.currentTarget);
    const res = await fetch(`/api/projects/${selectedProjectId}/drawings`, { method: "POST", body: formData });
    const json = await res.json().catch(() => ({}));
    setDrawingUploading(false);
    if (!res.ok) {
      toast.error(json.message || "Không upload được bản vẽ");
      return;
    }
    toast.success(json.message || "Đã upload bản vẽ");
    event.currentTarget.reset();
    await loadProject(selectedProjectId);
  }

  async function deleteDrawing(drawing: Drawing) {
    if (!window.confirm(`Xóa bản vẽ ${drawing.name}?`)) return;
    const res = await fetch(`/api/drawings/${drawing.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không xóa được bản vẽ");
      return;
    }
    toast.success(json.message || "Đã xóa bản vẽ");
    await loadProject(selectedProjectId);
  }

  async function editDrawing(drawing: Drawing) {
    const name = window.prompt("Tên bản vẽ", drawing.name);
    if (name === null) return;
    const description = window.prompt("Mô tả", drawing.description || "");
    if (description === null) return;
    const displayOrder = window.prompt("Thứ tự", "0");
    if (displayOrder === null) return;

    const res = await fetch(`/api/drawings/${drawing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, displayOrder }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không cập nhật được bản vẽ");
      return;
    }
    toast.success(json.message || "Đã cập nhật bản vẽ");
    await loadProject(selectedProjectId);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-sm font-semibold text-orange-200">Dự án</div>
        <div className="space-y-2">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => setSelectedProjectId(project.id)}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedProjectId === project.id ? "border-orange-500 bg-orange-500/15 text-orange-100" : "border-[#2d3249] bg-[#13151f] text-[#d9def3]"}`}
            >
              <div className="font-semibold">{project.code}</div>
              <div className="text-xs text-[#8892b0]">{project.name}</div>
              <div className="text-xs text-[#8892b0]">{project.customerName}</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="space-y-4">
        <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#f8fafc]">{selectedProject?.name || "Chọn dự án"}</h2>
              <div className="text-sm text-[#8892b0]">{selectedProject?.customerName}</div>
            </div>
            {loading ? <span className="text-xs text-[#8892b0]">Đang tải...</span> : null}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-[#13151f] p-3 text-sm"><div className="text-[#8892b0]">Giá trị</div><div className="font-semibold text-[#f8fafc]">{money(contractValue)}</div></div>
            <div className="rounded-xl bg-[#13151f] p-3 text-sm"><div className="text-[#8892b0]">Đã thu</div><div className="font-semibold text-emerald-300">{money(paidTotal)}</div></div>
            <div className="rounded-xl bg-[#13151f] p-3 text-sm"><div className="text-[#8892b0]">Còn lại</div><div className="font-semibold text-amber-200">{money(Math.max(0, contractValue - paidTotal))}</div></div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <h3 className="font-semibold text-[#f8fafc]">Tạo đợt thanh toán</h3>
          <form onSubmit={submitPayment} className="mt-3 grid gap-2 md:grid-cols-5">
            <select value={paymentForm.type} onChange={(event) => setPaymentForm((form) => ({ ...form, type: event.target.value as PaymentForm["type"] }))} className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm">
              <option value="contract">Hợp đồng</option>
              <option value="addendum">Phụ lục</option>
            </select>
            <input required placeholder="Đợt" value={paymentForm.installmentNo} onChange={(event) => setPaymentForm((form) => ({ ...form, installmentNo: event.target.value }))} className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
            <input required placeholder="Mô tả" value={paymentForm.description} onChange={(event) => setPaymentForm((form) => ({ ...form, description: event.target.value }))} className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm md:col-span-2" />
            <input required type="date" value={paymentForm.dueDate} onChange={(event) => setPaymentForm((form) => ({ ...form, dueDate: event.target.value }))} className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
            <input required placeholder="Số tiền" value={paymentForm.amount} onChange={(event) => setPaymentForm((form) => ({ ...form, amount: event.target.value }))} className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm md:col-span-4" />
            <button type="submit" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white">Tạo</button>
          </form>
        </section>

        <section className="space-y-3">
          {payments.map((payment) => {
            const editable = payment.status !== "paid";
            return (
              <article key={payment.id} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#8892b0]">{payment.type === "contract" ? "Hợp đồng" : "Phụ lục"} · Đợt {payment.installmentNo}</div>
                    <h3 className="font-semibold text-[#f8fafc]">{payment.description}</h3>
                    <div className="text-sm text-[#d9def3]">{money(payment.amount)} · Hạn {dateInput(payment.dueDate)}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className={payment.status === "paid" ? "text-emerald-300" : "text-amber-200"}>{statusText(payment.status)}</div>
                    {payment.receiptUrl ? <a href={`/api/payment-schedules/${payment.id}/receipt`} target="_blank" className="text-xs text-orange-300 underline">Biên lai</a> : null}
                  </div>
                </div>

                {editable ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void editPayment(payment)} className="rounded-lg border border-[#2d3249] px-3 py-1 text-xs text-[#d9def3]">Sửa</button>
                    <button type="button" onClick={() => void deletePayment(payment)} className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-200">Xóa</button>
                  </div>
                ) : null}

                {editable ? (
                  <form onSubmit={(event) => void markPaid(event, payment)} className="mt-3 grid gap-2 md:grid-cols-4">
                    <input required name="paidAt" type="date" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
                    <input required name="paidAmount" placeholder="Số tiền thu" defaultValue={payment.amount} className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
                    <select required name="accountId" defaultValue="" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm">
                      <option value="">— Tài khoản nhận —</option>
                      {cashAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{formatCashAccountLabel(a)}</option>
                      ))}
                    </select>
                    <input required name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
                    <input name="paymentNote" placeholder="Ghi chú" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm md:col-span-4" />
                    <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white md:col-span-4">Đánh dấu đã thu</button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-[#f8fafc]">Bản vẽ PDF</h3>
            <span className="text-xs text-[#8892b0]">{drawings.length} file</span>
          </div>
          {isAdmin ? (
            <form onSubmit={uploadDrawing} className="mt-3 grid gap-2 md:grid-cols-5">
              <input required name="name" placeholder="Tên bản vẽ" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
              <input name="description" placeholder="Mô tả" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm md:col-span-2" />
              <input name="displayOrder" placeholder="Thứ tự" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
              <input required name="file" type="file" accept="application/pdf" className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm" />
              <button disabled={drawingUploading} type="submit" className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white md:col-span-5">{drawingUploading ? "Đang upload..." : "Upload bản vẽ"}</button>
            </form>
          ) : <div className="mt-2 text-sm text-[#8892b0]">KT chỉ xem danh sách bản vẽ; admin mới được upload/xóa.</div>}

          <div className="mt-3 space-y-2">
            {drawings.map((drawing) => (
              <div key={drawing.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
                <div>
                  <div className="font-semibold text-[#f8fafc]">{drawing.name}</div>
                  <div className="text-xs text-[#8892b0]">{drawing.description || "PDF"} · {Math.round(drawing.fileSizeBytes / 1024).toLocaleString("vi-VN")} KB</div>
                </div>
                <div className="flex gap-2">
                  <a href={drawing.viewUrl} target="_blank" className="rounded-lg border border-[#2d3249] px-3 py-1 text-xs text-orange-200">Xem</a>
                  {isAdmin ? <button type="button" onClick={() => void editDrawing(drawing)} className="rounded-lg border border-[#2d3249] px-3 py-1 text-xs text-[#d9def3]">Sửa</button> : null}
                  {isAdmin ? <button type="button" onClick={() => void deleteDrawing(drawing)} className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-200">Xóa</button> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
