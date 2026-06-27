"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type ProjectOption = { id: string; code: string; name: string };

type ReceiptSource = "customer" | "loan" | "advance_return" | "other";

type Receipt = {
  id: string;
  code: string;
  source: ReceiptSource;
  projectId: string | null;
  amount: number;
  payer: string | null;
  paymentMethod: string | null;
  note: string | null;
  attachmentUrl: string | null;
  status: "pending" | "received" | "cancelled";
  createdAt: string;
  receivedAt: string | null;
  receivedAmount: number | null;
  receivedNote: string | null;
  receivedReceiptUrl: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  project: ProjectOption | null;
  creator: { id: string; fullName: string };
  receiver: { id: string; fullName: string } | null;
};

const SOURCE_LABEL: Record<ReceiptSource, string> = {
  customer: "Khách hàng",
  loan: "Vay",
  advance_return: "Hoàn ứng",
  other: "Khác",
};

const SOURCE_CLS: Record<ReceiptSource, string> = {
  customer: "bg-emerald-500/15 text-emerald-300",
  loan: "bg-violet-500/15 text-violet-300",
  advance_return: "bg-sky-500/15 text-sky-300",
  other: "bg-zinc-500/15 text-zinc-300",
};

function money(v: number | null | undefined) {
  return `${(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function statusMeta(s: Receipt["status"]) {
  if (s === "pending") return { label: "Chờ thu", cls: "bg-amber-500/15 text-amber-300" };
  if (s === "received") return { label: "Đã thu", cls: "bg-emerald-500/15 text-emerald-300" };
  return { label: "Đã huỷ", cls: "bg-zinc-500/15 text-zinc-300" };
}

type CreateForm = {
  source: ReceiptSource;
  projectId: string;
  amount: string;
  payer: string;
  paymentMethod: "cash" | "transfer";
  note: string;
  attachmentUrl: string;
};

const emptyCreate: CreateForm = {
  source: "customer",
  projectId: "",
  amount: "",
  payer: "",
  paymentMethod: "transfer",
  note: "",
  attachmentUrl: "",
};

export function ReceiptsClient({
  role,
  projects,
}: {
  role: string;
  projects: ProjectOption[];
}) {
  const isAdmin = role === "admin";
  const canMarkReceived = role === "admin" || role === "accountant";

  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("pending");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreate);
  const [creating, setCreating] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [openReceive, setOpenReceive] = useState<Receipt | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [recvAmount, setRecvAmount] = useState("");
  const [recvDate, setRecvDate] = useState(new Date().toISOString().slice(0, 10));
  const [recvNote, setRecvNote] = useState("");
  const [recvReceiptUrl, setRecvReceiptUrl] = useState("");
  const [uploadingRecvReceipt, setUploadingRecvReceipt] = useState(false);
  const recvReceiptInputRef = useRef<HTMLInputElement | null>(null);

  const [openCancel, setOpenCancel] = useState<Receipt | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (sourceFilter) qs.set("source", sourceFilter);
    if (projectFilter) qs.set("projectId", projectFilter);
    if (search.trim()) qs.set("search", search.trim());
    const res = await fetch(`/api/receipts?${qs.toString()}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast.error(j.message || "Không tải được danh sách lệnh thu");
      return;
    }
    setRows(j.rows || []);
  }, [status, sourceFilter, projectFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const totalReceived = useMemo(() => rows.reduce((s, r) => s + (r.receivedAmount || 0), 0), [rows]);

  async function uploadFile(file: File, kind: "attachment" | "received", setter: (url: string) => void, setLoading: (b: boolean) => void) {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Chỉ hỗ trợ ảnh hoặc PDF");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File quá lớn (tối đa 8MB)");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/receipts/upload-receipt", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.message || "Upload thất bại");
        return;
      }
      setter(j.url);
      toast.success("Đã tải file");
    } finally {
      setLoading(false);
    }
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nhập số tiền > 0");
      return;
    }
    if (form.source === "customer" && !form.projectId) {
      toast.error("Thu từ khách phải chọn dự án");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: form.source,
        projectId: form.projectId || null,
        amount: amt,
        payer: form.payer.trim() || null,
        paymentMethod: form.paymentMethod,
        note: form.note.trim() || null,
        attachmentUrl: form.attachmentUrl.trim() || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      toast.error(j.message || "Không tạo được lệnh thu");
      return;
    }
    toast.success(j.message || "Đã tạo lệnh thu");
    setShowCreate(false);
    setForm(emptyCreate);
    load();
  }

  async function submitReceive(e: FormEvent) {
    e.preventDefault();
    if (!openReceive) return;
    const amt = Number(recvAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nhập số tiền > 0");
      return;
    }
    setReceiving(true);
    const res = await fetch(`/api/receipts/${openReceive.id}/mark-received`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        receivedAt: recvDate,
        receivedAmount: amt,
        receivedNote: recvNote.trim() || null,
        receivedReceiptUrl: recvReceiptUrl.trim() || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setReceiving(false);
    if (!res.ok) {
      toast.error(j.message || "Không xác nhận được");
      return;
    }
    toast.success(j.message || "Đã ghi sổ quỹ");
    setOpenReceive(null);
    setRecvAmount("");
    setRecvNote("");
    setRecvReceiptUrl("");
    setRecvDate(new Date().toISOString().slice(0, 10));
    load();
  }

  async function submitCancel() {
    if (!openCancel) return;
    if (!cancelReason.trim()) {
      toast.error("Nhập lý do huỷ");
      return;
    }
    if (!window.confirm(`Huỷ lệnh thu ${openCancel.code}?`)) return;
    setCancelling(true);
    const res = await fetch(`/api/receipts/${openCancel.id}/cancel`, {
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

  function openReceiveDialog(r: Receipt) {
    setOpenReceive(r);
    setRecvAmount(String(r.amount));
    setRecvNote("");
    setRecvReceiptUrl("");
    setRecvDate(new Date().toISOString().slice(0, 10));
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2">
        <div className="text-xs">
          <span className="text-[#8892b0]">Tổng theo bộ lọc: </span>
          <span className="font-bold text-emerald-300">{money(totalAmount)}</span>
          {totalReceived > 0 && (
            <>
              <span className="ml-2 text-[#8892b0]">· đã thu: </span>
              <span className="font-semibold text-[#cfd4e8]">{money(totalReceived)}</span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded-lg border px-2 py-1 text-xs ${
              showFilters
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                : "border-[#2d3249] text-[#8b95b7] hover:text-[#f0f2ff]"
            }`}
          >
            ⏷ Lọc
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-[#0b0d16]"
            >
              + Lệnh thu
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] p-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
          >
            <option value="pending">Chờ thu</option>
            <option value="received">Đã thu</option>
            <option value="cancelled">Đã huỷ</option>
            <option value="">Tất cả</option>
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
          >
            <option value="">Tất cả nguồn</option>
            {(Object.keys(SOURCE_LABEL) as ReceiptSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
          >
            <option value="">Tất cả dự án</option>
            <option value="none">Không gắn dự án</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm code / người nộp / ghi chú"
            className="min-w-[180px] flex-1 rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-sm text-[#f0f2ff]"
          />
        </div>
      )}

      {/* Create form */}
      {showCreate && isAdmin && (
        <form onSubmit={submitCreate} className="space-y-3 rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Nguồn *</span>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as ReceiptSource })}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              >
                {(Object.keys(SOURCE_LABEL) as ReceiptSource[]).map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">
                Dự án {form.source === "customer" ? "*" : "(tuỳ chọn)"}
              </span>
              <select
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              >
                <option value="">— Không gắn dự án —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
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
              <span className="text-xs text-[#8b95b7]">Người/đơn vị nộp</span>
              <input
                value={form.payer}
                onChange={(e) => setForm({ ...form, payer: e.target.value })}
                placeholder={
                  form.source === "customer"
                    ? "Tên chủ nhà"
                    : form.source === "loan"
                      ? "Bên cho vay"
                      : form.source === "advance_return"
                        ? "TPTC / KS hoàn ứng"
                        : "Người nộp"
                }
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Phương thức</span>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as "cash" | "transfer" })}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              >
                <option value="transfer">Chuyển khoản</option>
                <option value="cash">Tiền mặt</option>
              </select>
            </label>
            <div className="block">
              <span className="text-xs text-[#8b95b7]">Ảnh chứng từ (tuỳ chọn)</span>
              <input
                ref={attachmentInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    uploadFile(
                      f,
                      "attachment",
                      (url) => setForm((p) => ({ ...p, attachmentUrl: url })),
                      setUploadingAttachment,
                    ).finally(() => {
                      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
                    });
                }}
              />
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={uploadingAttachment}
                  className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-xs font-medium text-[#cfd4e8] disabled:opacity-50"
                >
                  {uploadingAttachment ? "Đang tải…" : form.attachmentUrl ? "📎 Đổi" : "📷 Chọn"}
                </button>
                {form.attachmentUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, attachmentUrl: "" })}
                      className="text-[11px] text-red-300 hover:text-red-200"
                    >
                      Xoá
                    </button>
                    <span className="text-[11px] text-emerald-300">✓ đã đính kèm</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <label className="block">
            <span className="text-xs text-[#8b95b7]">Ghi chú</span>
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={2}
              placeholder="VD: Thu đợt 2 hoàn thiện thô / Tạm vay anh A trả lương / TPTC trả ứng dư PC-2026-001"
              className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
            >
              {creating ? "Đang lưu…" : "Tạo lệnh thu"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setForm(emptyCreate);
              }}
              className="rounded-lg border border-[#2d3249] px-4 py-2 text-sm text-[#cfd4e8]"
            >
              Huỷ
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-6 text-center text-sm text-[#8b95b7]">
          Đang tải…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-6 text-center text-sm text-[#8b95b7]">
          Chưa có lệnh thu nào trong bộ lọc này.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#2d3249]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#13151f] text-xs uppercase tracking-wide text-[#8892b0]">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Nguồn</th>
                <th className="px-3 py-2">Người nộp / Dự án</th>
                <th className="px-3 py-2 text-right">Số tiền</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sm = statusMeta(r.status);
                const expanded = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="cursor-pointer border-t border-[#2d3249] bg-[#0b0d16] hover:bg-[#13151f]"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-emerald-200">{r.code}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${SOURCE_CLS[r.source]}`}>
                          {SOURCE_LABEL[r.source]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[#cfd4e8]">
                        <div>{r.payer || "—"}</div>
                        {r.project && (
                          <div className="text-[11px] text-[#8b95b7]">
                            {r.project.code} — {r.project.name}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-300">{money(r.amount)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${sm.cls}`}>{sm.label}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-[#8892b0]">{expanded ? "▲" : "▼"}</td>
                    </tr>
                    {expanded && (
                      <tr className="border-t border-[#2d3249] bg-[#13151f]">
                        <td colSpan={6} className="px-3 py-3 text-xs text-[#cfd4e8]">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <div>
                                <span className="text-[#8892b0]">Tạo bởi: </span>
                                {r.creator.fullName} · {fmtDate(r.createdAt)}
                              </div>
                              <div>
                                <span className="text-[#8892b0]">Phương thức: </span>
                                {r.paymentMethod === "cash" ? "Tiền mặt" : r.paymentMethod === "transfer" ? "Chuyển khoản" : "—"}
                              </div>
                              {r.note && (
                                <div>
                                  <span className="text-[#8892b0]">Ghi chú: </span>
                                  {r.note}
                                </div>
                              )}
                              {r.attachmentUrl && (
                                <div>
                                  <a
                                    href={`/api/receipts/${r.id}/file?type=attachment`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-300 underline"
                                  >
                                    📎 Xem chứng từ
                                  </a>
                                </div>
                              )}
                            </div>
                            <div className="space-y-1">
                              {r.status === "received" && (
                                <>
                                  <div>
                                    <span className="text-[#8892b0]">Đã thu: </span>
                                    <span className="font-semibold text-emerald-300">{money(r.receivedAmount)}</span> ·{" "}
                                    {fmtDate(r.receivedAt)}
                                  </div>
                                  {r.receiver && (
                                    <div>
                                      <span className="text-[#8892b0]">Người xác nhận: </span>
                                      {r.receiver.fullName}
                                    </div>
                                  )}
                                  {r.receivedNote && (
                                    <div>
                                      <span className="text-[#8892b0]">Ghi chú thu: </span>
                                      {r.receivedNote}
                                    </div>
                                  )}
                                  {r.receivedReceiptUrl && (
                                    <div>
                                      <a
                                        href={`/api/receipts/${r.id}/file?type=received`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-emerald-300 underline"
                                      >
                                        🧾 Xem phiếu thu
                                      </a>
                                    </div>
                                  )}
                                </>
                              )}
                              {r.status === "cancelled" && r.cancelledReason && (
                                <div>
                                  <span className="text-[#8892b0]">Lý do huỷ: </span>
                                  {r.cancelledReason}
                                </div>
                              )}
                            </div>
                          </div>

                          {r.status === "pending" && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {canMarkReceived && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openReceiveDialog(r);
                                  }}
                                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-[#0b0d16]"
                                >
                                  ✓ Xác nhận đã thu
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenCancel(r);
                                    setCancelReason("");
                                  }}
                                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300"
                                >
                                  Huỷ
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mark received modal */}
      {openReceive && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 md:items-center"
          onClick={() => setOpenReceive(null)}
        >
          <form
            onSubmit={submitReceive}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-xl border border-[#2d3249] bg-[#0b0d16] p-4"
          >
            <div>
              <div className="text-sm font-semibold text-emerald-300">Xác nhận đã thu</div>
              <div className="text-xs text-[#8b95b7]">
                {openReceive.code} · {SOURCE_LABEL[openReceive.source]}
                {openReceive.payer ? ` · ${openReceive.payer}` : ""}
              </div>
            </div>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Ngày thu *</span>
              <input
                type="date"
                value={recvDate}
                onChange={(e) => setRecvDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Số tiền đã thu (₫) *</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={recvAmount}
                onChange={(e) => setRecvAmount(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Ghi chú (tuỳ chọn)</span>
              <textarea
                value={recvNote}
                onChange={(e) => setRecvNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <div className="block">
              <span className="text-xs text-[#8b95b7]">Phiếu thu / ảnh sao kê (tuỳ chọn)</span>
              <input
                ref={recvReceiptInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    uploadFile(f, "received", setRecvReceiptUrl, setUploadingRecvReceipt).finally(() => {
                      if (recvReceiptInputRef.current) recvReceiptInputRef.current.value = "";
                    });
                }}
              />
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => recvReceiptInputRef.current?.click()}
                  disabled={uploadingRecvReceipt}
                  className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-xs font-medium text-[#cfd4e8] disabled:opacity-50"
                >
                  {uploadingRecvReceipt ? "Đang tải…" : recvReceiptUrl ? "📎 Đổi" : "📷 Chọn"}
                </button>
                {recvReceiptUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() => setRecvReceiptUrl("")}
                      className="text-[11px] text-red-300 hover:text-red-200"
                    >
                      Xoá
                    </button>
                    <span className="text-[11px] text-emerald-300">✓ đã đính kèm</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={receiving}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
              >
                {receiving ? "Đang ghi…" : "Xác nhận + ghi sổ quỹ"}
              </button>
              <button
                type="button"
                onClick={() => setOpenReceive(null)}
                className="rounded-lg border border-[#2d3249] px-4 py-2 text-sm text-[#cfd4e8]"
              >
                Huỷ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel modal */}
      {openCancel && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 md:items-center"
          onClick={() => setOpenCancel(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-xl border border-[#2d3249] bg-[#0b0d16] p-4"
          >
            <div>
              <div className="text-sm font-semibold text-red-300">Huỷ lệnh thu</div>
              <div className="text-xs text-[#8b95b7]">{openCancel.code}</div>
            </div>
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Lý do huỷ *</span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitCancel}
                disabled={cancelling}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
              >
                {cancelling ? "Đang huỷ…" : "Xác nhận huỷ"}
              </button>
              <button
                type="button"
                onClick={() => setOpenCancel(null)}
                className="rounded-lg border border-[#2d3249] px-4 py-2 text-sm text-[#cfd4e8]"
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
