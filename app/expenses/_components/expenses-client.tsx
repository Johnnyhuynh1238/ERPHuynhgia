"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { VN_BANKS, findBankByBin, buildVietQrDeepLink } from "@/lib/vn-banks";
import { buildVietQrImageUrl, parseVietQrString } from "@/lib/vietqr";
import { TreasuryClient } from "@/app/treasury/_components/treasury-client";
import { useCashAccounts, formatCashAccountLabel } from "@/lib/use-cash-accounts";

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
  attachmentUrls: string[];
  status: "pending" | "paid" | "cancelled";
  priority: "normal" | "urgent";
  createdAt: string;
  paidAt: string | null;
  paidAmount: number | null;
  paidNote: string | null;
  paidReceiptUrl: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  payeeBankBin: string | null;
  payeeAccountNumber: string | null;
  payeeAccountName: string | null;
  payeeQrUrl: string | null;
  project: ProjectOption | null;
  category: CategoryOption;
  creator: { id: string; fullName: string };
  payer: { id: string; fullName: string } | null;
};

function money(v: number | null | undefined) {
  return `${(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
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
  attachmentUrls: string[];
  payeeBankBin: string;
  payeeAccountNumber: string;
  payeeAccountName: string;
};

const emptyCreate: CreateForm = {
  projectId: "",
  categoryId: "",
  amount: "",
  payee: "",
  paymentMethod: "transfer",
  priority: "normal",
  note: "",
  attachmentUrls: [],
  payeeBankBin: "",
  payeeAccountNumber: "",
  payeeAccountName: "",
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

  const [showTreasury, setShowTreasury] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreate);
  const [creating, setCreating] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const qrInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [openPay, setOpenPay] = useState<Expense | null>(null);
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [payReceiptUrl, setPayReceiptUrl] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const { accounts: cashAccounts } = useCashAccounts();

  const [openCancel, setOpenCancel] = useState<Expense | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [viewer, setViewer] = useState<{ urls: string[]; index: number; expenseId: string; type: "attachment" | "receipt" } | null>(null);
  useEffect(() => {
    if (!viewer) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewer(null);
      if (e.key === "ArrowRight") setViewer((v) => (v ? { ...v, index: (v.index + 1) % v.urls.length } : v));
      if (e.key === "ArrowLeft") setViewer((v) => (v ? { ...v, index: (v.index - 1 + v.urls.length) % v.urls.length } : v));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewer]);

  function attachmentList(r: Expense): string[] {
    if (r.attachmentUrls?.length) return r.attachmentUrls;
    return r.attachmentUrl ? [r.attachmentUrl] : [];
  }

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

  async function uploadOne(file: File): Promise<string | null> {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error(`${file.name}: Chỉ hỗ trợ ảnh hoặc PDF`);
      return null;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error(`${file.name}: File quá lớn (tối đa 8MB)`);
      return null;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "attachment");
    const res = await fetch("/api/expenses/upload-receipt", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.message || `${file.name}: Upload thất bại`);
      return null;
    }
    return j.url as string;
  }

  async function uploadAttachments(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    const remaining = 20 - form.attachmentUrls.length;
    if (remaining <= 0) {
      toast.error("Đã đính kèm tối đa 20 ảnh");
      return;
    }
    const slice = arr.slice(0, remaining);
    if (slice.length < arr.length) {
      toast.warning(`Chỉ thêm ${slice.length}/${arr.length} ảnh (giới hạn 20)`);
    }
    setUploadingAttachment(true);
    try {
      const results = await Promise.all(slice.map(uploadOne));
      const urls = results.filter((u): u is string => !!u);
      if (urls.length) {
        setForm((f) => ({ ...f, attachmentUrls: [...f.attachmentUrls, ...urls] }));
        toast.success(`Đã tải ${urls.length} ảnh hoá đơn`);
      }
    } finally {
      setUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  function removeAttachment(index: number) {
    setForm((f) => ({ ...f, attachmentUrls: f.attachmentUrls.filter((_, i) => i !== index) }));
  }

  async function decodeQrFile(file: File) {
    setDecoding(true);
    try {
      if (!file.type.startsWith("image/")) {
        toast.error("File không phải ảnh. Chọn JPG/PNG nhé");
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("Không decode được ảnh — có thể format HEIC, chuyển JPG nhé"));
        im.src = dataUrl;
      });

      const jsQR = (await import("jsqr")).default;

      const tryAt = (targetW: number): string | null => {
        const scale = Math.min(1, targetW / img.naturalWidth);
        const w = Math.max(64, Math.round(img.naturalWidth * scale));
        const h = Math.max(64, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const code = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
        return code?.data || null;
      };

      // Thử nhiều scale: ảnh chụp 4K thường fail ở native, nhưng pass khi downscale
      const targets = [1280, 800, 1920, 2400, img.naturalWidth];
      let raw: string | null = null;
      for (const t of targets) {
        raw = tryAt(t);
        if (raw) break;
      }

      if (!raw) {
        toast.error(`Không đọc được QR (${img.naturalWidth}x${img.naturalHeight}). Thử ảnh cận hơn hoặc screenshot nhé`);
        return;
      }
      const parsed = parseVietQrString(raw);
      if (!parsed) {
        toast.error("QR đọc được nhưng không phải chuẩn VietQR. Nhập tay STK nhé");
        return;
      }
      const bank = findBankByBin(parsed.bankBin);
      setForm((f) => ({
        ...f,
        payeeBankBin: parsed.bankBin,
        payeeAccountNumber: parsed.accountNumber,
        amount: parsed.amount && parsed.amount > 0 ? String(parsed.amount) : f.amount,
      }));
      toast.success(`Đã đọc QR: ${bank?.shortName ?? parsed.bankBin} · ${parsed.accountNumber}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Lỗi đọc QR");
    } finally {
      setDecoding(false);
      if (qrInputRef.current) qrInputRef.current.value = "";
    }
  }

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
    if ((form.payeeBankBin && !form.payeeAccountNumber.trim()) || (!form.payeeBankBin && form.payeeAccountNumber.trim())) {
      toast.error("Chọn ngân hàng và nhập STK hoặc bỏ trống cả 2");
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
        attachmentUrls: form.attachmentUrls,
        payeeBankBin: form.payeeBankBin || null,
        payeeAccountNumber: form.payeeAccountNumber.trim() || null,
        payeeAccountName: form.payeeAccountName.trim() || null,
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
    if (!payAccountId) {
      toast.error("Chọn tài khoản quỹ");
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
        accountId: payAccountId,
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
    setPayAccountId("");
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
        <button
          type="button"
          onClick={() => setShowTreasury(true)}
          className="flex items-baseline gap-2 rounded-lg px-1 -mx-1 text-left transition active:scale-[0.99]"
          title="Bấm để xem chi tiết sổ quỹ"
        >
          <span className="text-[11px] uppercase tracking-wide text-[#8892b0]">Số dư quỹ</span>
          <span className={`text-base font-bold ${balanceTone}`}>
            {balance == null ? "…" : money(balance)}
          </span>
          <span className="text-[10px] text-[#8b95b7]">› chi tiết</span>
        </button>
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
            <div className="block">
              <span className="text-xs text-[#8b95b7]">
                Ảnh hoá đơn / báo giá {form.attachmentUrls.length > 0 && `(${form.attachmentUrls.length}/20)`}
              </span>
              <input
                ref={attachmentInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) uploadAttachments(e.target.files);
                }}
              />
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={uploadingAttachment || form.attachmentUrls.length >= 20}
                  className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-xs font-medium text-[#cfd4e8] disabled:opacity-50"
                >
                  {uploadingAttachment ? "Đang tải…" : form.attachmentUrls.length ? "📎 Thêm ảnh" : "📷 Chọn ảnh"}
                </button>
              </div>
              {form.attachmentUrls.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {form.attachmentUrls.map((url, i) => {
                    const isPdf = url.toLowerCase().endsWith(".pdf");
                    const previewSrc = url.startsWith("minio://")
                      ? `/api/expenses/upload-preview?url=${encodeURIComponent(url)}`
                      : url;
                    return (
                      <div
                        key={`${url}-${i}`}
                        className="group relative aspect-square overflow-hidden rounded-lg border border-[#2d3249] bg-[#0b0d16]"
                      >
                        {isPdf ? (
                          <div className="flex h-full w-full items-center justify-center text-xs text-[#8b95b7]">
                            📄 PDF
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewSrc} alt={`bill-${i + 1}`} className="h-full w-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="absolute right-1 top-1 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-red-500"
                          title="Xoá ảnh"
                        >
                          ✕
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
                          #{i + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Bank info for KT to "Chuyển khoản" */}
          <div className="rounded-lg border border-[#2d3249] bg-[#0b0d16] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[#cfd4e8]">Tài khoản nhận (để KT bấm “Chuyển khoản”)</div>
              <div className="flex items-center gap-2">
                <input
                  ref={qrInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) decodeQrFile(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => qrInputRef.current?.click()}
                  disabled={decoding}
                  className="rounded-lg border border-[#f97316]/40 bg-[#f97316]/10 px-2 py-1 text-[11px] font-semibold text-[#fb923c] disabled:opacity-50"
                  title="Tải ảnh QR để tự động điền"
                >
                  {decoding ? "Đang đọc QR…" : "📷 Tải ảnh QR"}
                </button>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="block">
                <span className="text-[11px] text-[#8b95b7]">Ngân hàng</span>
                <select
                  value={form.payeeBankBin}
                  onChange={(e) => setForm({ ...form, payeeBankBin: e.target.value })}
                  className="mt-0.5 w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-2 py-1.5 text-xs text-[#f0f2ff]"
                >
                  <option value="">— Chọn ngân hàng —</option>
                  {VN_BANKS.map((b) => (
                    <option key={b.bin} value={b.bin}>
                      {b.shortName} ({b.name})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-[#8b95b7]">Số tài khoản</span>
                <input
                  value={form.payeeAccountNumber}
                  onChange={(e) =>
                    setForm({ ...form, payeeAccountNumber: e.target.value.replace(/[^0-9A-Za-z]/g, "") })
                  }
                  placeholder="VD: 0123456789"
                  className="mt-0.5 w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-2 py-1.5 text-xs text-[#f0f2ff]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-[#8b95b7]">Tên chủ TK</span>
                <input
                  value={form.payeeAccountName}
                  onChange={(e) => setForm({ ...form, payeeAccountName: e.target.value })}
                  placeholder="Hiện trên QR (tuỳ chọn)"
                  className="mt-0.5 w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-2 py-1.5 text-xs text-[#f0f2ff]"
                />
              </label>
            </div>
            {form.payeeBankBin && form.payeeAccountNumber && (
              <div className="text-[11px] text-emerald-300">
                ✓ KT sẽ thấy nút “Chuyển khoản” mở thẳng app ngân hàng
              </div>
            )}
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
            const isUrgent = r.priority === "urgent" && r.status === "pending";
            const canQuickTransfer = r.status === "pending" && !!r.payeeBankBin && !!r.payeeAccountNumber && canMarkPaid;
            const isExpanded = expandedId === r.id;
            const toggle = () => setExpandedId((prev) => (prev === r.id ? null : r.id));
            const bank = r.payeeBankBin ? findBankByBin(r.payeeBankBin) : null;

            const statusBadge =
              r.status === "pending"
                ? { label: "Chờ chi", chip: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30" }
                : r.status === "paid"
                  ? { label: "Đã chi", chip: "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30" }
                  : { label: "Đã huỷ", chip: "bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30" };

            const cardBorder = isUrgent
              ? "border-red-500/60 shadow-[0_0_0_1px_rgba(248,113,113,0.20),0_4px_16px_-6px_rgba(248,113,113,0.3)]"
              : r.status === "paid"
                ? "border-emerald-500/20"
                : r.status === "cancelled"
                  ? "border-zinc-700/40 opacity-80"
                  : "border-[#2d3249]";

            return (
              <div
                key={r.id}
                onClick={canQuickTransfer ? toggle : undefined}
                role={canQuickTransfer ? "button" : undefined}
                tabIndex={canQuickTransfer ? 0 : undefined}
                aria-expanded={canQuickTransfer ? isExpanded : undefined}
                onKeyDown={
                  canQuickTransfer
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle();
                        }
                      }
                    : undefined
                }
                className={`rounded-2xl border bg-gradient-to-br from-[#13151f] to-[#0f111a] p-4 flex flex-col gap-3 ${cardBorder} ${
                  canQuickTransfer ? "cursor-pointer transition hover:border-orange-400/40 active:scale-[0.995]" : ""
                } ${isExpanded ? "md:col-span-2 xl:col-span-3 ring-1 ring-orange-400/30" : ""}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge.chip}`}>
                      {statusBadge.label}
                    </span>
                    {isUrgent && (
                      <span className="rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-bold text-red-200 ring-1 ring-red-400/40">
                        🚨 GẤP
                      </span>
                    )}
                    <span className="font-mono text-[10px] tracking-wider text-[#6b7299]">{r.code}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-extrabold leading-none tracking-tight text-[#f5f7ff] whitespace-nowrap">
                      {money(r.amount)}
                    </div>
                    {r.paidAmount != null && r.paidAmount !== r.amount && (
                      <div className="mt-1 text-[10px] font-medium text-emerald-300 whitespace-nowrap">
                        Thực chi {money(r.paidAmount)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Meta: category + project + creator */}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-[#e5e7f5]">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400/80 shrink-0" aria-hidden />
                    <span className="font-medium truncate">{r.category.name}</span>
                    {r.payee && <span className="text-[#8b95b7] truncate">· {r.payee}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#8b95b7]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3a4264] shrink-0" aria-hidden />
                    {r.project ? (
                      <span className="truncate">
                        <span className="font-mono text-[#a1a8c8]">{r.project.code}</span> — {r.project.name}
                      </span>
                    ) : (
                      <span>Chi chung công ty</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#6b7299]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3a4264]/60 shrink-0" aria-hidden />
                    <span>{fmtDate(r.createdAt)} · {r.creator.fullName}</span>
                  </div>
                </div>

                {/* Note */}
                {r.note && (
                  <div className="rounded-lg bg-[#0b0d16]/80 border border-[#2d3249]/50 px-3 py-2 text-xs text-[#cfd4e8] italic">
                    &ldquo;{r.note}&rdquo;
                  </div>
                )}

                {/* Bank info */}
                {bank && r.payeeAccountNumber && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-[#0b0d16] border border-[#2d3249]/60 px-3 py-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-300 text-[10px] font-bold">
                      {bank.shortName.slice(0, 3).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-[#f0f2ff] truncate">{bank.shortName}</div>
                      <div className="font-mono text-[11px] text-[#cfd4e8] truncate">{r.payeeAccountNumber}</div>
                    </div>
                    {r.payeeAccountName && (
                      <div className="text-right text-[10px] font-medium uppercase tracking-wide text-[#8b95b7] truncate max-w-[140px]">
                        {r.payeeAccountName}
                      </div>
                    )}
                  </div>
                )}

                {/* Status meta */}
                {r.status === "paid" && (
                  <div className="flex items-start gap-1.5 text-[11px] text-emerald-300/80">
                    <span aria-hidden>✓</span>
                    <span>
                      Đã chi {fmtDate(r.paidAt)}
                      {r.payer ? ` · KT ${r.payer.fullName}` : ""}
                      {r.paidNote ? ` · ${r.paidNote}` : ""}
                    </span>
                  </div>
                )}
                {r.status === "cancelled" && (
                  <div className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                    <span aria-hidden>✕</span>
                    <span>
                      Huỷ {fmtDate(r.cancelledAt)}
                      {r.cancelledReason ? ` · ${r.cancelledReason}` : ""}
                    </span>
                  </div>
                )}

                {/* Actions */}
                {(canQuickTransfer ||
                  (r.status === "pending" && canMarkPaid && !canQuickTransfer) ||
                  (r.status === "pending" && isAdmin) ||
                  attachmentList(r).length > 0 ||
                  r.paidReceiptUrl) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#2d3249]/40" onClick={(e) => e.stopPropagation()}>
                    {canQuickTransfer && (
                      <button
                        onClick={toggle}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          isExpanded
                            ? "bg-[#2d3249] text-[#cfd4e8] hover:bg-[#373d57]"
                            : "bg-orange-500 text-[#0b0d16] hover:bg-orange-400"
                        }`}
                      >
                        {isExpanded ? "⌃ Thu gọn" : "💸 Chuyển khoản"}
                      </button>
                    )}
                    {r.status === "pending" && canMarkPaid && !canQuickTransfer && (
                      <button
                        onClick={() => openPayDialog(r)}
                        className="rounded-lg bg-emerald-500/20 text-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-500/30"
                      >
                        Ghi nhận đã chi
                      </button>
                    )}
                    {r.status === "pending" && isAdmin && (
                      <button
                        onClick={() => {
                          setOpenCancel(r);
                          setCancelReason("");
                        }}
                        className="rounded-lg bg-red-500/15 text-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-500/25"
                      >
                        Huỷ
                      </button>
                    )}
                    {(() => {
                      const atts = attachmentList(r);
                      if (atts.length === 0 && !r.paidReceiptUrl) return null;
                      return (
                        <div className="ml-auto flex gap-1.5">
                          {atts.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewer({ urls: atts, index: 0, expenseId: r.id, type: "attachment" });
                              }}
                              className="rounded-lg bg-blue-500/15 text-blue-300 px-3 py-1.5 text-xs font-medium hover:bg-blue-500/25"
                            >
                              📎 {atts.length > 1 ? `${atts.length} hoá đơn` : "Hoá đơn"}
                            </button>
                          )}
                          {r.paidReceiptUrl && (
                            <a
                              href={r.paidReceiptUrl.startsWith("minio://") ? `/api/expenses/${r.id}/file?type=receipt` : r.paidReceiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg bg-emerald-500/15 text-emerald-300 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500/25"
                            >
                              📄 Chứng từ
                            </a>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Expanded transfer details */}
                {canQuickTransfer && isExpanded && (
                  <div className="slide-up rounded-lg bg-[#0b0d16]/60 border border-[#2d3249]/60 p-3 mt-1" onClick={(e) => e.stopPropagation()}>
                    <TransferDetails
                      expense={r}
                      canMarkPaid={canMarkPaid}
                      onPaid={() => {
                        setExpandedId(null);
                        load();
                        loadBalance();
                      }}
                    />
                  </div>
                )}
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

      {/* Pay dialog (for cash / non-bank expenses) */}
      {openPay && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-6"
          onClick={() => setOpenPay(null)}
        >
          <form
            onSubmit={submitPay}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-xl border border-[#2d3249] bg-[#13151f] p-4"
          >
            <div className="text-base font-semibold text-emerald-300">Ghi nhận đã chi</div>
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
            <ReceiptFilePicker value={payReceiptUrl} onChange={setPayReceiptUrl} />
            <label className="block">
              <span className="text-xs text-[#8b95b7]">Tài khoản quỹ *</span>
              <select
                value={payAccountId}
                onChange={(e) => setPayAccountId(e.target.value)}
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
              <span className="text-xs text-[#8b95b7]">Ghi chú KT</span>
              <textarea
                rows={2}
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </label>
            <div className="text-[11px] text-amber-300">
              Lưu ý: trừ vào số dư tài khoản đã chọn. Không huỷ được sau khi xác nhận.
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

      {showTreasury && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-2 pt-4"
          onClick={() => setShowTreasury(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl rounded-xl border border-[#2d3249] bg-[#0b0d16] shadow-xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-[#2d3249] bg-[#13151f] px-4 py-2.5">
              <div className="text-base font-semibold text-orange-300">Sổ quỹ — chi tiết</div>
              <button
                onClick={() => setShowTreasury(false)}
                className="rounded-lg px-2 py-1 text-[#8b95b7] hover:bg-[#0b0d16] hover:text-[#f0f2ff]"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="p-3">
              <TreasuryClient projects={projects} categories={categories} />
            </div>
          </div>
        </div>
      )}

      {/* Lightbox xem ảnh hoá đơn (multi) */}
      {viewer && (() => {
        const url = viewer.urls[viewer.index];
        const src = url.startsWith("minio://")
          ? `/api/expenses/${viewer.expenseId}/file?type=${viewer.type}${viewer.type === "attachment" ? `&index=${viewer.index}` : ""}`
          : url;
        const isPdf = url.toLowerCase().endsWith(".pdf");
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setViewer(null)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewer(null);
              }}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-2xl text-white hover:bg-black/80"
              aria-label="Đóng"
            >
              ✕
            </button>
            {viewer.urls.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewer((v) => (v ? { ...v, index: (v.index - 1 + v.urls.length) % v.urls.length } : v));
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-3xl text-white hover:bg-black/80"
                  aria-label="Trước"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewer((v) => (v ? { ...v, index: (v.index + 1) % v.urls.length } : v));
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-3xl text-white hover:bg-black/80"
                  aria-label="Sau"
                >
                  ›
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
                  {viewer.index + 1} / {viewer.urls.length}
                </div>
              </>
            )}
            {isPdf ? (
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded-lg bg-white px-6 py-4 text-center text-lg font-semibold text-blue-600 shadow-2xl"
              >
                📄 Mở PDF #{viewer.index + 1}
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={`Hoá đơn ${viewer.index + 1}`}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[92vh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
              />
            )}
          </div>
        );
      })()}
    </div>
  );
}

const KT_BANK_LS_KEY = "expenses.ktBankBin";

function ReceiptFilePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handle(file: File) {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Chỉ hỗ trợ ảnh hoặc PDF");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File quá lớn (tối đa 8MB)");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "receipt");
      const res = await fetch("/api/expenses/upload-receipt", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.message || "Upload thất bại");
        return;
      }
      onChange(j.url);
      toast.success("Đã tải ảnh chứng từ");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="block">
      <span className="text-xs text-[#8b95b7]">Ảnh chứng từ chuyển khoản (tuỳ chọn)</span>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
        }}
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-xs font-medium text-[#cfd4e8] disabled:opacity-50"
        >
          {uploading ? "Đang tải…" : value ? "📎 Đổi ảnh" : "📷 Chọn ảnh"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-red-300 hover:text-red-200"
          >
            Xoá
          </button>
        )}
        {value && <span className="text-[11px] text-emerald-300">✓ đã đính kèm</span>}
      </div>
    </div>
  );
}

function TransferDetails({
  expense,
  canMarkPaid,
  onPaid,
}: {
  expense: Expense;
  canMarkPaid: boolean;
  onPaid: () => void;
}) {
  const recipientBank = findBankByBin(expense.payeeBankBin);
  const memo = expense.code;
  const qrUrl = expense.payeeBankBin && expense.payeeAccountNumber
    ? buildVietQrImageUrl({
        bankBin: expense.payeeBankBin,
        accountNumber: expense.payeeAccountNumber,
        amount: expense.amount,
        addInfo: memo,
        accountName: expense.payeeAccountName ?? undefined,
      })
    : null;

  const [ktBankBin, setKtBankBin] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(KT_BANK_LS_KEY);
    if (saved) setKtBankBin(saved);
  }, []);
  function chooseKtBank(bin: string) {
    setKtBankBin(bin);
    if (bin) window.localStorage.setItem(KT_BANK_LS_KEY, bin);
  }
  const ktBank = findBankByBin(ktBankBin);

  const [showPayForm, setShowPayForm] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payReceipt, setPayReceipt] = useState("");
  const [payAmount, setPayAmount] = useState(String(Math.round(expense.amount)));
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const { accounts: cashAccounts } = useCashAccounts();

  async function confirmPaid() {
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nhập số tiền > 0");
      return;
    }
    if (!payAccountId) {
      toast.error("Chọn tài khoản quỹ");
      return;
    }
    setPaying(true);
    const res = await fetch(`/api/expenses/${expense.id}/mark-paid`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paidAt: payDate,
        paidAmount: amt,
        paidNote: payNote.trim() || null,
        paidReceiptUrl: payReceipt.trim() || null,
        accountId: payAccountId,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setPaying(false);
    if (!res.ok) {
      toast.error(j.message || "Không ghi sổ được");
      return;
    }
    toast.success(j.message || "Đã ghi sổ quỹ");
    onPaid();
  }

  async function saveQrImage(silent = false) {
    if (!qrUrl) return false;
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const file = new File([blob], `${expense.code}-QR.png`, { type: "image/png" });
      // iOS: Web Share API → KT chọn "Save Image" → vào Photos.
      // Android Chrome: cũng support share API.
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "VietQR" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${expense.code}-QR.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
      if (!silent) toast.success("Đã lưu ảnh QR.");
      return true;
    } catch (err) {
      // User huỷ share sheet cũng vào nhánh này — không phải lỗi.
      if ((err as DOMException)?.name === "AbortError") return false;
      if (!silent) {
        toast.error("Lưu QR thất bại. Anh long-press vào ảnh QR để lưu thủ công.");
      }
      return false;
    }
  }

  function buildKtDeepLink(): string | null {
    if (!ktBank?.appId || !recipientBank?.appId || !expense.payeeAccountNumber) return null;
    return buildVietQrDeepLink({
      ktAppId: ktBank.appId,
      recipientAccount: expense.payeeAccountNumber,
      recipientBankAppId: recipientBank.appId,
      amount: expense.amount,
      memo,
      recipientName: expense.payeeAccountName ?? undefined,
    });
  }

  async function transferCombo() {
    if (!ktBank) {
      toast.error("Chọn NH em đang dùng trước nhé");
      return;
    }
    const link = buildKtDeepLink();
    // NH autofill (VTB/BIDV/OCB/ACB): chỉ mở app, không cần lưu QR.
    if (ktBank.autofill && link) {
      window.location.href = link;
      return;
    }
    // NH non-autofill có deeplink (TCB/VCB/MB...): lưu QR rồi mở app.
    if (link) {
      const saved = await saveQrImage(true);
      if (!saved) return;
      toast.success(`Đã lưu QR. Đang mở ${ktBank.shortName}...`);
      setTimeout(() => {
        window.location.href = link;
      }, 500);
      return;
    }
    // NH không có appId: chỉ lưu QR, KT tự mở app.
    const saved = await saveQrImage(true);
    if (saved) {
      toast.info(`Đã lưu QR. Mở app ${ktBank.shortName} → Quét QR → Quét từ thư viện.`, {
        duration: 6000,
      });
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text);
    toast.success(`Đã copy ${label}`);
  }

  return (
    <div className="text-sm text-[#cfd4e8]">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="space-y-2.5">
        {qrUrl && (
          <div className="flex justify-center rounded-lg bg-white p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="VietQR" className="h-56 w-56 object-contain" />
          </div>
        )}

        <div className="space-y-1 rounded-lg bg-[#0b0d16] p-2.5 text-xs">
          <div className="flex justify-between gap-2">
            <span className="text-[#8b95b7]">NH nhận</span>
            <span className="font-semibold text-[#f0f2ff]">{recipientBank?.shortName ?? "—"}</span>
          </div>
          <button
            type="button"
            onClick={() => copy(expense.payeeAccountNumber!, "số TK")}
            className="flex w-full items-center justify-between gap-2 rounded text-left hover:bg-[#13151f]/60 px-1 py-0.5"
            title="Bấm để copy"
          >
            <span className="text-[#8b95b7]">Số TK</span>
            <span className="font-mono text-[#f0f2ff]">{expense.payeeAccountNumber} ⧉</span>
          </button>
          {expense.payeeAccountName && (
            <div className="flex justify-between gap-2 px-1">
              <span className="text-[#8b95b7]">Chủ TK</span>
              <span className="font-semibold uppercase text-[#f0f2ff]">{expense.payeeAccountName}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => copy(String(Math.round(expense.amount)), "số tiền")}
            className="flex w-full items-center justify-between gap-2 rounded text-left hover:bg-[#13151f]/60 px-1 py-0.5"
            title="Bấm để copy"
          >
            <span className="text-[#8b95b7]">Số tiền</span>
            <span className="font-bold text-orange-300">{money(expense.amount)} ⧉</span>
          </button>
          <button
            type="button"
            onClick={() => copy(memo, "nội dung")}
            className="flex w-full items-center justify-between gap-2 rounded text-left hover:bg-[#13151f]/60 px-1 py-0.5"
            title="Bấm để copy"
          >
            <span className="text-[#8b95b7]">Nội dung</span>
            <span className="font-mono text-[#f0f2ff]">{memo} ⧉</span>
          </button>
        </div>
          </div>

          <div className="space-y-2.5">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">
          <label className="block">
            <span className="font-semibold">App NH em đang dùng để chuyển</span>
            <select
              value={ktBankBin}
              onChange={(e) => chooseKtBank(e.target.value)}
              className="mt-1 w-full rounded-lg border border-amber-500/40 bg-[#13151f] px-2 py-1.5 text-xs text-amber-100"
            >
              <option value="">— Chọn NH em dùng —</option>
              {VN_BANKS.map((b) => (
                <option key={b.bin} value={b.bin}>
                  {b.shortName} ({b.name})
                </option>
              ))}
            </select>
          </label>
          {ktBank && !ktBank.autofill && (
            <div className="mt-1 text-[10px] text-amber-200/80">
              {ktBank.appId
                ? `Bấm nút → lưu QR vào Photos → app ${ktBank.shortName} tự mở → Quét QR → Quét từ thư viện.`
                : `Lưu QR → mở app ${ktBank.shortName} thủ công → Quét QR → Quét từ thư viện.`}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            onClick={transferCombo}
            disabled={!ktBank}
            className="w-full rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
          >
            {!ktBank
              ? "Chọn NH em dùng để chuyển"
              : ktBank.autofill && ktBank.appId
                ? `💸 Chuyển qua ${ktBank.shortName}`
                : ktBank.appId
                  ? `💸 Lưu QR + Mở ${ktBank.shortName}`
                  : `💾 Lưu QR (mở app ${ktBank.shortName} thủ công)`}
          </button>
          <button
            onClick={() => saveQrImage(false)}
            className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-1.5 text-xs font-medium text-[#cfd4e8]"
          >
            💾 Chỉ lưu ảnh QR
          </button>
        </div>

        {canMarkPaid && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 space-y-2">
            {!showPayForm ? (
              <button
                type="button"
                onClick={() => setShowPayForm(true)}
                className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-[#0b0d16]"
              >
                ✓ Đã chuyển xong — ghi sổ
              </button>
            ) : (
              <>
                <div className="text-xs font-semibold text-emerald-300">Xác nhận đã chuyển khoản</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-[#8b95b7]">Số tiền (₫) *</span>
                    <input
                      type="number"
                      min={0}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-2 py-1.5 text-xs text-[#f0f2ff]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-[#8b95b7]">Ngày chi *</span>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-2 py-1.5 text-xs text-[#f0f2ff]"
                    />
                  </label>
                </div>
                <ReceiptFilePicker value={payReceipt} onChange={setPayReceipt} />
                <label className="block">
                  <span className="text-[11px] text-[#8b95b7]">Tài khoản quỹ *</span>
                  <select
                    value={payAccountId}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-2 py-1.5 text-xs text-[#f0f2ff]"
                  >
                    <option value="">— Chọn tài khoản —</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{formatCashAccountLabel(a)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-[#8b95b7]">Ghi chú KT</span>
                  <textarea
                    rows={2}
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="VD: chuyển lúc 14h, mã GD 88231"
                    className="mt-0.5 w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-2 py-1.5 text-xs text-[#f0f2ff]"
                  />
                </label>
                <div className="text-[10px] text-amber-300">
                  Trừ ngay vào số dư tài khoản đã chọn. Không huỷ được sau khi xác nhận.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={confirmPaid}
                    disabled={paying}
                    className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
                  >
                    {paying ? "Đang ghi…" : "Xác nhận đã chuyển"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPayForm(false)}
                    className="rounded-lg border border-[#2d3249] px-3 py-2 text-xs text-[#8b95b7]"
                  >
                    Quay lại
                  </button>
                </div>
              </>
            )}
          </div>
        )}
          </div>
        </div>
    </div>
  );
}
