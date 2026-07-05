"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Filter, Plus, Receipt as ReceiptIcon, Search, X } from "lucide-react";
import { MoneyInput } from "@/components/money-input";
import { toast } from "sonner";
import { useCashAccounts, formatCashAccountLabel } from "@/lib/use-cash-accounts";

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
  status: "awaiting_approval" | "pending" | "received" | "cancelled";
  createdAt: string;
  receivedAt: string | null;
  receivedAmount: number | null;
  receivedNote: string | null;
  receivedReceiptUrl: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  project: ProjectOption | null;
  paymentSchedule: {
    id: string;
    phaseNumber: number;
    milestoneDescription: string;
    description: string | null;
  } | null;
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

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "Chờ thu" },
  { key: "awaiting_approval", label: "Chờ duyệt" },
  { key: "received", label: "Đã thu" },
  { key: "cancelled", label: "Đã huỷ" },
  { key: "", label: "Tất cả" },
];

function money(v: number | null | undefined) {
  return `${(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function statusMeta(s: Receipt["status"]) {
  if (s === "awaiting_approval") return { label: "Chờ admin duyệt", cls: "bg-violet-500/15 text-violet-300" };
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
  const isKt = role === "accountant";
  const canCreate = role === "admin" || role === "accountant";
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
  const [recvAccountId, setRecvAccountId] = useState("");
  const [uploadingRecvReceipt, setUploadingRecvReceipt] = useState(false);
  const { accounts: cashAccounts } = useCashAccounts();
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
  const pendingCount = useMemo(() => rows.filter((r) => r.status === "pending").length, [rows]);

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
    if (!recvAccountId) {
      toast.error("Chọn tài khoản nhận");
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
        accountId: recvAccountId,
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
    setRecvAccountId("");
    setRecvDate(new Date().toISOString().slice(0, 10));
    load();
  }

  async function submitCancel() {
    if (!openCancel) return;
    if (!cancelReason.trim()) {
      toast.error("Nhập lý do huỷ");
      return;
    }
    if (!await confirmDialog(`Huỷ lệnh thu ${openCancel.code}?`)) return;
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
    <div className="space-y-5">
      {/* HERO */}
      <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#13151f] to-[#1a1d2e] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f97316]/20 text-[#fb923c]">
            <ReceiptIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-[#f0f2ff]">Lệnh thu</h1>
            <p className="mt-0.5 text-xs text-[#8892b0]">
              {isKt
                ? "KT tạo lệnh thu → admin duyệt → KT xác nhận đã thu, ghi vào sổ quỹ."
                : "Ghi nhận khoản thu từ khách hàng, hoàn ứng, vay và các nguồn khác. KT xác nhận đã thu sẽ ghi vào sổ quỹ."}
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#f97316] px-4 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-[#fb923c]"
            >
              <Plus className="h-4 w-4" /> Lệnh thu mới
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <HeroStat label="Tổng trong bộ lọc" value={money(totalAmount)} tone="orange" />
          <HeroStat label="Đã thu" value={money(totalReceived)} tone="emerald" />
          <HeroStat label="Chờ thu" value={String(pendingCount)} sub="lệnh" tone="amber" />
        </div>
      </div>

      {/* MAIN PANEL */}
      <div className="overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e]">
        {/* Toolbar: status tabs + search + filter toggle */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#252840] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_TABS.map((t) => {
              const active = status === t.key;
              return (
                <button
                  key={t.key || "all"}
                  type="button"
                  onClick={() => setStatus(t.key)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? "bg-[#f97316]/15 text-[#fb923c]"
                      : "text-[#8892b0] hover:bg-[#252840] hover:text-[#f0f2ff]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5a627a]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm code / người nộp / ghi chú"
                className="w-52 rounded-lg border border-[#2d3249] bg-[#0b0d16] py-1.5 pl-7 pr-2 text-xs text-[#f0f2ff] placeholder:text-[#5a627a] focus:border-[#f97316]/40 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition ${
                showFilters
                  ? "border-[#f97316]/40 bg-[#f97316]/10 text-[#fb923c]"
                  : "border-[#2d3249] text-[#8892b0] hover:text-[#f0f2ff]"
              }`}
            >
              <Filter className="h-3.5 w-3.5" /> Lọc
            </button>
          </div>
        </div>

        {/* Optional sub-filters */}
        {showFilters && (
          <div className="grid gap-2 border-b border-[#252840] px-3 py-2.5 sm:grid-cols-2">
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
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-[#8892b0]">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[#8892b0]">
            Chưa có lệnh thu nào trong bộ lọc này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#13151f] text-[11px] uppercase tracking-wide text-[#8892b0]">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Nguồn</th>
                  <th className="px-3 py-2 font-medium">Người nộp / Dự án</th>
                  <th className="px-3 py-2 text-right font-medium">Số tiền</th>
                  <th className="px-3 py-2 font-medium">Trạng thái</th>
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
                        className={`cursor-pointer border-t border-[#252840] transition ${
                          expanded ? "bg-[#13151f]" : "hover:bg-[#13151f]/60"
                        }`}
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-[#fb923c]">{r.code}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${SOURCE_CLS[r.source]}`}>
                            {SOURCE_LABEL[r.source]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[#cfd4e8]">
                          <div className="text-[13px]">{r.payer || "—"}</div>
                          {r.project && (
                            <div className="text-[11px] text-[#8892b0]">
                              {r.project.code} — {r.project.name}
                            </div>
                          )}
                          {r.paymentSchedule && (
                            <div className="mt-0.5 inline-block rounded bg-[#f97316]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#fb923c]">
                              Đợt {r.paymentSchedule.phaseNumber} — {r.paymentSchedule.milestoneDescription}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-emerald-300">{money(r.amount)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${sm.cls}`}>{sm.label}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#8892b0]">
                          <ChevronDown className={`inline h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t border-[#252840] bg-[#0b0d16]/40">
                          <td colSpan={6} className="px-4 py-3 text-xs text-[#cfd4e8]">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1.5">
                                <div>
                                  <span className="text-[#8892b0]">Tạo bởi: </span>
                                  {r.creator.fullName} · {fmtDate(r.createdAt)}
                                </div>
                                <div>
                                  <span className="text-[#8892b0]">Phương thức: </span>
                                  {r.paymentMethod === "cash" ? "Tiền mặt" : r.paymentMethod === "transfer" ? "Chuyển khoản" : "—"}
                                </div>
                                {r.note && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard?.writeText(r.note!);
                                      toast.success("Đã copy ghi chú");
                                    }}
                                    className="w-full rounded px-1 py-0.5 text-left hover:bg-[#13151f]"
                                    title="Bấm để copy"
                                  >
                                    <span className="text-[#8892b0]">Ghi chú: </span>
                                    {r.note} <span className="text-[#fb923c]">⧉</span>
                                  </button>
                                )}
                                {r.payer && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard?.writeText(r.payer!);
                                      toast.success("Đã copy tên người nộp");
                                    }}
                                    className="w-full rounded px-1 py-0.5 text-left hover:bg-[#13151f]"
                                    title="Bấm để copy"
                                  >
                                    <span className="text-[#8892b0]">Người nộp: </span>
                                    {r.payer} <span className="text-[#fb923c]">⧉</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard?.writeText(String(Math.round(r.amount)));
                                    toast.success("Đã copy số tiền");
                                  }}
                                  className="w-full rounded px-1 py-0.5 text-left hover:bg-[#13151f]"
                                  title="Bấm để copy"
                                >
                                  <span className="text-[#8892b0]">Số tiền: </span>
                                  <span className="font-semibold text-emerald-300">{money(r.amount)}</span>{" "}
                                  <span className="text-[#fb923c]">⧉</span>
                                </button>
                                {r.attachmentUrl && (
                                  <div>
                                    <a
                                      href={`/api/receipts/${r.id}/file?type=attachment`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[#fb923c] underline"
                                    >
                                      📎 Xem chứng từ
                                    </a>
                                  </div>
                                )}
                              </div>
                              <div className="space-y-1.5">
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
                                          className="text-[#fb923c] underline"
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

                            {r.status === "awaiting_approval" && (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <div className="text-[11px] text-violet-300/80">
                                  KT {r.creator?.fullName ?? ""} tạo · chờ admin duyệt
                                </div>
                                {isAdmin && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!await confirmDialog(`Duyệt lệnh thu ${r.code}?`)) return;
                                        const res = await fetch(`/api/receipts/${r.id}/approve`, { method: "POST" });
                                        const j = await res.json().catch(() => ({}));
                                        if (!res.ok) {
                                          toast.error(j.message || "Không duyệt được");
                                          return;
                                        }
                                        toast.success(j.message || "Đã duyệt");
                                        load();
                                      }}
                                      className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
                                    >
                                      ✓ Duyệt
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const reason = window.prompt(`Lý do từ chối lệnh thu ${r.code}:`);
                                        if (!reason || reason.trim().length < 3) {
                                          if (reason !== null) toast.error("Lý do tối thiểu 3 ký tự");
                                          return;
                                        }
                                        const res = await fetch(`/api/receipts/${r.id}/reject`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ reason: reason.trim() }),
                                        });
                                        const j = await res.json().catch(() => ({}));
                                        if (!res.ok) {
                                          toast.error(j.message || "Không từ chối được");
                                          return;
                                        }
                                        toast.success(j.message || "Đã từ chối");
                                        load();
                                      }}
                                      className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300"
                                    >
                                      ✕ Từ chối
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            {r.status === "pending" && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {canMarkReceived && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openReceiveDialog(r);
                                    }}
                                    className="rounded-lg bg-[#f97316] px-3 py-1.5 text-xs font-semibold text-[#0b0d16] hover:bg-[#fb923c]"
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
      </div>

      {/* CREATE MODAL */}
      {showCreate && canCreate && (
        <ModalShell
          title="Tạo lệnh thu mới"
          onClose={() => {
            setShowCreate(false);
            setForm(emptyCreate);
          }}
        >
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <FieldSelect
                label="Nguồn *"
                value={form.source}
                onChange={(v) => setForm({ ...form, source: v as ReceiptSource })}
                options={(Object.keys(SOURCE_LABEL) as ReceiptSource[]).map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
              />
              <FieldSelect
                label={form.source === "customer" ? "Dự án *" : "Dự án (tuỳ chọn)"}
                value={form.projectId}
                onChange={(v) => setForm({ ...form, projectId: v })}
                options={[
                  { value: "", label: "— Không gắn dự án —" },
                  ...projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
                ]}
              />
              <label className="block">
                <span className="text-xs text-[#8892b0]">Số tiền (₫) *</span>
                <MoneyInput
                  value={form.amount}
                  onChange={(raw) => setForm({ ...form, amount: raw })}
                  required
                  className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
                />
              </label>
              <FieldInput
                label="Người/đơn vị nộp"
                value={form.payer}
                onChange={(v) => setForm({ ...form, payer: v })}
                placeholder={
                  form.source === "customer"
                    ? "Tên chủ nhà"
                    : form.source === "loan"
                      ? "Bên cho vay"
                      : form.source === "advance_return"
                        ? "TPTC / KS hoàn ứng"
                        : "Người nộp"
                }
              />
              <FieldSelect
                label="Phương thức"
                value={form.paymentMethod}
                onChange={(v) => setForm({ ...form, paymentMethod: v as "cash" | "transfer" })}
                options={[
                  { value: "transfer", label: "Chuyển khoản" },
                  { value: "cash", label: "Tiền mặt" },
                ]}
              />
              <div>
                <label className="text-xs text-[#8892b0]">Ảnh chứng từ (tuỳ chọn)</label>
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
              <span className="text-xs text-[#8892b0]">Ghi chú</span>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                placeholder="VD: Thu đợt 2 hoàn thiện thô / Tạm vay anh A trả lương / TPTC trả ứng dư PC-2026-001"
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            {isKt && (
              <div className="rounded-lg bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
                Lệnh thu do KT tạo sẽ chờ admin duyệt trước khi xác nhận thu.
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-[#0b0d16] hover:bg-[#fb923c] disabled:opacity-50"
              >
                {creating ? "Đang lưu…" : isKt ? "Gửi admin duyệt" : "Tạo lệnh thu"}
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
        </ModalShell>
      )}

      {/* MARK RECEIVED MODAL */}
      {openReceive && (
        <ModalShell
          title="Xác nhận đã thu"
          subtitle={`${openReceive.code} · ${SOURCE_LABEL[openReceive.source]}${openReceive.payer ? ` · ${openReceive.payer}` : ""}`}
          onClose={() => setOpenReceive(null)}
        >
          <form onSubmit={submitReceive} className="space-y-3">
            <label className="block">
              <span className="text-xs text-[#8892b0]">Ngày thu *</span>
              <input
                type="date"
                value={recvDate}
                onChange={(e) => setRecvDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8892b0]">Số tiền đã thu (₫) *</span>
              <MoneyInput
                value={recvAmount}
                onChange={setRecvAmount}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#8892b0]">Tài khoản nhận *</span>
              <select
                value={recvAccountId}
                onChange={(e) => setRecvAccountId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              >
                <option value="">— Chọn tài khoản —</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{formatCashAccountLabel(a)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-[#8892b0]">Ghi chú (tuỳ chọn)</span>
              <textarea
                value={recvNote}
                onChange={(e) => setRecvNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <div>
              <span className="text-xs text-[#8892b0]">Phiếu thu / ảnh sao kê (tuỳ chọn)</span>
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
                  className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-xs font-medium text-[#cfd4e8] disabled:opacity-50"
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
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={receiving}
                className="flex-1 rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-[#0b0d16] hover:bg-[#fb923c] disabled:opacity-50"
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
        </ModalShell>
      )}

      {/* CANCEL MODAL */}
      {openCancel && (
        <ModalShell
          title="Huỷ lệnh thu"
          subtitle={openCancel.code}
          tone="red"
          onClose={() => setOpenCancel(null)}
        >
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs text-[#8892b0]">Lý do huỷ *</span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitCancel}
                disabled={cancelling}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
        </ModalShell>
      )}
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "orange" | "emerald" | "amber";
}) {
  const toneCls =
    tone === "orange"
      ? "text-[#fb923c]"
      : tone === "emerald"
        ? "text-emerald-300"
        : "text-amber-300";
  return (
    <div className="rounded-xl border border-[#252840] bg-[#0b0d16]/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">{label}</div>
      <div className={`mt-0.5 truncate text-base font-bold ${toneCls}`}>
        {value}
        {sub && <span className="ml-1 text-[10px] font-normal text-[#8892b0]">{sub}</span>}
      </div>
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  tone = "default",
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "default" | "red";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleCls = tone === "red" ? "text-red-300" : "text-[#fb923c]";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 md:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e] shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-[#252840] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className={`text-sm font-semibold ${titleCls}`}>{title}</div>
            {subtitle && <div className="mt-0.5 truncate text-[11px] text-[#8892b0]">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#8892b0] hover:bg-[#252840] hover:text-[#f0f2ff]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="text-xs text-[#8892b0]">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
      />
    </label>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[#8892b0]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
