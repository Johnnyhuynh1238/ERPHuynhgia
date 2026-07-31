"use client";

import "./expenses.css";
import { confirmDialog } from "@/components/confirm-dialog";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { VN_BANKS, findBankByBin, buildVietQrDeepLink } from "@/lib/vn-banks";
import { buildVietQrImageUrl, parseVietQrString } from "@/lib/vietqr";
import { TreasuryClient } from "@/app/treasury/_components/treasury-client";
import { useCashAccounts, CashAccountOption } from "@/lib/use-cash-accounts";

type ProjectOption = { id: string; code: string; name: string };
type CategoryOption = { id: string; code: string; name: string; scope: string | null };
type DesignContractOption = { id: string; customerName: string; signedAt: string };

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
  status: "tptc_pending" | "pending" | "paid" | "cancelled";
  priority: "normal" | "urgent";
  createdAt: string;
  paidAt: string | null;
  paidAmount: number | null;
  paidNote: string | null;
  paidReceiptUrl: string | null;
  paidReceiptUrls: string[];
  cancelledAt: string | null;
  cancelledReason: string | null;
  payeePhone: string | null;
  publicToken: string | null;
  payeeBankBin: string | null;
  payeeAccountNumber: string | null;
  payeeAccountName: string | null;
  payeeQrUrl: string | null;
  project: ProjectOption | null;
  designContractId: string | null;
  designContract: { id: string; customerName: string } | null;
  category: CategoryOption;
  creator: { id: string; fullName: string };
  payer: { id: string; fullName: string } | null;
};

function money(v: number | null | undefined) {
  return `${(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
}
function moneyPlain(v: number | null | undefined) {
  return (v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

type CreateForm = {
  projectId: string;
  designContractId: string;
  categoryId: string;
  amount: string;
  payee: string;
  payeePhone: string;
  paymentMethod: "cash" | "transfer";
  priority: "normal" | "urgent";
  note: string;
  attachmentUrls: string[];
  payeeBankBin: string;
  payeeAccountNumber: string;
  payeeAccountName: string;
  sourceType: string;
  sourceId: string;
  subPaymentId: string;
};

const emptyCreate: CreateForm = {
  projectId: "",
  designContractId: "",
  categoryId: "",
  amount: "",
  payee: "",
  payeePhone: "",
  paymentMethod: "transfer",
  priority: "normal",
  note: "",
  attachmentUrls: [],
  payeeBankBin: "",
  payeeAccountNumber: "",
  payeeAccountName: "",
  sourceType: "",
  sourceId: "",
  subPaymentId: "",
};

const TABS: { key: string; label: string }[] = [
  { key: "pending", label: "Chờ chi" },
  { key: "tptc_pending", label: "Chờ duyệt" },
  { key: "paid", label: "Đã chi" },
  { key: "cancelled", label: "Đã huỷ" },
  { key: "all", label: "Tất cả" },
];

function statusBadge(s: Expense["status"]) {
  if (s === "pending") return { label: "Chờ chi", cls: "st-pend" };
  if (s === "tptc_pending") return { label: "Chờ duyệt", cls: "st-wait" };
  if (s === "paid") return { label: "Đã chi", cls: "st-paid" };
  return { label: "Đã huỷ", cls: "st-cancel" };
}

export function ExpensesClient({
  role,
  projects,
  categories,
  designContracts,
}: {
  role: string;
  projects: ProjectOption[];
  categories: CategoryOption[];
  designContracts: DesignContractOption[];
}) {
  const isAdmin = role === "admin";
  const isKt = role === "accountant";
  const canCreate = role === "admin" || role === "accountant";
  const canMarkPaid = role === "admin" || role === "accountant";

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const s = window.localStorage.getItem("lc.theme");
    if (s === "light" || s === "dark") setTheme(s);
  }, []);
  function toggleTheme() {
    setTheme((t) => {
      const n = t === "dark" ? "light" : "dark";
      window.localStorage.setItem("lc.theme", n);
      return n;
    });
  }

  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("pending");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Deep-link từ notification: /expenses?status=...&id=... → set filter + highlight lệnh
  const [filtersReady, setFiltersReady] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get("status");
    const id = sp.get("id");
    if (s && ["pending", "tptc_pending", "paid", "cancelled", "all"].includes(s)) {
      setStatus(s);
    } else if (id) {
      // Có id nhưng không chỉ định status → xem "Tất cả" để lệnh không bị filter giấu
      setStatus("all");
    }
    if (id) setHighlightId(id);
    // Prefill từ màn Mua hàng: /expenses?create=1&projectId&amount&method&note → mở sẵn form Lệnh chi
    if (sp.get("create") === "1" && canCreate) {
      const method = sp.get("method") === "cash" ? "cash" : "transfer";
      const st = sp.get("sourceType");
      // Danh mục điền sẵn theo mã (vd mua hàng -> VATTU) hoặc theo tên (vd thầu phụ
      // -> "Thầu phụ"); admin đổi được ở dropdown.
      const cc = sp.get("categoryCode");
      const cn = sp.get("categoryName");
      const prefillCatId = cc
        ? categories.find((c) => c.code === cc)?.id || ""
        : cn
          ? categories.find((c) => c.name === cn)?.id || ""
          : "";
      setForm({
        ...emptyCreate,
        projectId: sp.get("projectId") || "",
        categoryId: prefillCatId,
        amount: sp.get("amount") || "",
        note: sp.get("note") || "",
        payee: sp.get("payee") || "",
        payeePhone: sp.get("payeePhone") || "",
        payeeAccountNumber: sp.get("payeeAccountNumber") || "",
        payeeAccountName: sp.get("payeeAccountName") || "",
        paymentMethod: method,
        sourceType: st === "mua_hang_order" || st === "ncc_congno" ? st : "",
        sourceId: sp.get("sourceId") || "",
        subPaymentId: sp.get("subPaymentId") || "",
      });
      setShowCreate(true);
    }
    setFiltersReady(true);
  }, [canCreate]);

  const [balance, setBalance] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingTotal, setPendingTotal] = useState<number>(0);

  const [showTreasury, setShowTreasury] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Nút "Đóng session" trong iframe chat.html báo về -> đóng popup.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== "https://huynhgia6.com") return;
      if (e.data && e.data.type === "hg-ai-closed") setAiOpen(false);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
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
  const [payReceiptUrls, setPayReceiptUrls] = useState<string[]>([]);
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
    if (!filtersReady) return;
    load();
    loadBalance();
  }, [filtersReady, load, loadBalance]);

  useEffect(() => {
    if (!highlightId || loading) return;
    if (!rows.some((r) => r.id === highlightId)) return;
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightId(null), 6000);
    return () => clearTimeout(t);
  }, [highlightId, loading, rows]);

  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const totalPaid = useMemo(() => rows.reduce((s, r) => s + (r.paidAmount || 0), 0), [rows]);
  const paidLoaded = useMemo(() => rows.filter((r) => r.status === "paid"), [rows]);
  const paidLoadedSum = useMemo(
    () => paidLoaded.reduce((s, r) => s + (r.paidAmount || r.amount), 0),
    [paidLoaded],
  );

  const balanceAfterForm = useMemo(() => {
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || balance == null) return null;
    return balance - amt;
  }, [form.amount, balance]);

  // Danh mục theo ngữ cảnh "Chi cho": có HĐ (thi công/thiết kế) → scope "project";
  // Chi chung công ty → scope "company". Giữ thêm danh mục đang chọn nếu ngoài scope
  // (vd lệnh chi thầu phụ prefill "Thầu phụ") để hiển thị đúng.
  const chiScope: "project" | "company" = form.projectId || form.designContractId ? "project" : "company";
  const visibleCategories = useMemo(() => {
    const inScope = categories.filter((c) => c.scope === chiScope);
    const sel = categories.find((c) => c.id === form.categoryId);
    return sel && !inScope.some((c) => c.id === sel.id) ? [sel, ...inScope] : inScope;
  }, [categories, chiScope, form.categoryId]);

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
    if (!form.payeePhone.trim()) {
      toast.error("Nhập SĐT người nhận");
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
        designContractId: form.designContractId || null,
        categoryId: form.categoryId,
        amount: amt,
        payee: form.payee.trim() || null,
        payeePhone: form.payeePhone.trim() || null,
        paymentMethod: form.paymentMethod,
        priority: form.priority,
        note: form.note.trim() || null,
        attachmentUrls: form.attachmentUrls,
        payeeBankBin: form.payeeBankBin || null,
        payeeAccountNumber: form.payeeAccountNumber.trim() || null,
        payeeAccountName: form.payeeAccountName.trim() || null,
        sourceType: form.sourceType || null,
        sourceId: form.sourceId || null,
        subPaymentId: form.subPaymentId || null,
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
        paidReceiptUrls: payReceiptUrls,
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
    setPayReceiptUrls([]);
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
    setPayReceiptUrls([]);
    setPayAccountId("");
    setPayDate(new Date().toISOString().slice(0, 10));
  }

  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  // Lấy (lazy-tạo) link theo dõi công khai rồi copy để gửi NCC.
  async function sendPublicLink(e: Expense) {
    setLinkBusyId(e.id);
    try {
      const res = await fetch(`/api/expenses/${e.id}/public-link`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.path) {
        toast.error(j.message || "Không tạo được link");
        return;
      }
      const url = `${window.location.origin}${j.path}`;
      const shareText = `Phiếu chi ${e.code}${e.payee ? ` — ${e.payee}` : ""}. Theo dõi thanh toán:`;
      // Bấm là bật khay chia sẻ (Zalo/SMS/Messenger…), không copy thủ công.
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title: `Phiếu chi ${e.code}`, text: shareText, url });
          return;
        } catch (err) {
          // User huỷ khay share -> thôi, không báo lỗi.
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      // Máy không hỗ trợ share -> fallback copy.
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Đã copy link theo dõi — gửi cho NCC");
      } catch {
        window.prompt("Copy link theo dõi gửi NCC:", url);
      }
    } finally {
      setLinkBusyId(null);
    }
  }

  async function approveExpense(r: Expense) {
    if (!(await confirmDialog(`Duyệt lệnh chi ${r.code}?`))) return;
    const res = await fetch(`/api/expenses/${r.id}/approve`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.message || "Không duyệt được");
      return;
    }
    toast.success(j.message || "Đã duyệt");
    load();
  }

  async function rejectExpense(r: Expense) {
    const reason = window.prompt(`Lý do từ chối lệnh chi ${r.code}:`);
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) toast.error("Lý do tối thiểu 3 ký tự");
      return;
    }
    const res = await fetch(`/api/expenses/${r.id}/reject`, {
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
  }

  const selAcc = cashAccounts.find((a) => a.id === payAccountId) || null;
  const payAfter = selAcc ? selAcc.currentBalance - (Number(payAmount) || 0) : null;

  // Portal overlay ra body: thoát khỏi transform của AppShell (fixed mới bám viewport → full màn).
  const overlay = (node: ReactNode) =>
    mounted ? createPortal(<div className="lc-scope" data-theme={theme}>{node}</div>, document.body) : null;

  function tabCount(key: string): number | null {
    if (key === "pending") return pendingCount;
    if (key === status) return rows.length;
    return null;
  }

  return (
    <div className="lc-doc lc-scope" data-theme={theme}>
      {aiOpen &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 sm:items-center sm:p-3"
            style={{ height: "100dvh" }}
            onClick={() => setAiOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex w-full flex-col overflow-hidden rounded-t-2xl border border-[#2d3249] bg-[#0b0d16] shadow-2xl sm:w-auto sm:rounded-2xl"
              style={{ width: "min(480px, 100%)", height: "calc(100dvh - 8px)", maxHeight: "100dvh" }}
            >
              <div className="flex items-center gap-2 border-b border-[#252840] bg-[#12141f] px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7aa2ff]"><Sparkles className="h-4 w-4" /> AI Thu-Chi</span>
                <button
                  type="button"
                  onClick={() => setAiOpen(false)}
                  className="ml-auto rounded-md px-2 py-0.5 text-[#8b95b7] hover:bg-[#252840] hover:text-white"
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>
              <iframe
                src="https://huynhgia6.com/claude/chat?arg=thuchi-admin"
                title="AI Thu-Chi"
                className="w-full flex-1 border-0"
              />
            </div>
          </div>,
          document.body,
        )}

      <div className="wrap">
        {/* Topbar */}
        <div className="topbar">
          <div className="brand">
            <div className="mark">HG</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Kế toán</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {isAdmin && (
              <button className="iconbtn" onClick={() => setAiOpen(true)} title="Nhập lệnh chi bằng AI" aria-label="AI">
                <Sparkles style={{ width: 15, height: 15 }} />
              </button>
            )}
            <button className="iconbtn" onClick={() => setShowHelp(true)} title="Hướng dẫn" aria-label="Hướng dẫn">
              ?
            </button>
            <button className="iconbtn" onClick={toggleTheme} title="Đổi nền" aria-label="Đổi nền">
              ◐
            </button>
          </div>
        </div>

        {/* Head + meta */}
        <div className="head-row">
          <div>
            <div className="eyebrow">Sổ quỹ công ty</div>
            <h1>Lệnh chi</h1>
          </div>
          {canCreate && (
            <button className="btn primary" onClick={() => setShowCreate(true)}>
              + Lệnh chi
            </button>
          )}
        </div>
        <div className="meta">
          <span>
            Chờ chi <span className="num">{pendingCount}</span>
          </span>
          <span className="d">·</span>
          <span className="num">{money(pendingTotal)}</span>
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="tile">
            <div className="k">Chờ chi</div>
            <div className="v am num">{moneyPlain(pendingTotal)}</div>
            <div className="s">{pendingCount} lệnh</div>
          </div>
          <div className="tile">
            <div className="k">Đã chi (đang xem)</div>
            <div className="v chi num">{moneyPlain(paidLoadedSum)}</div>
            <div className="s">{paidLoaded.length} lệnh</div>
          </div>
          <button className="tile" onClick={() => setShowTreasury(true)} title="Xem chi tiết sổ quỹ">
            <div className="k">Số dư quỹ ›</div>
            <div className="v num">{balance == null ? "…" : moneyPlain(balance)}</div>
            <div className="s">TM + NH</div>
          </button>
        </div>

        {/* Search + filter toggle */}
        <div className="actions">
          <div className="search">
            <span className="ic">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm nội dung / người nhận / STK"
            />
          </div>
          <button
            className="iconbtn"
            onClick={() => setShowFilters((v) => !v)}
            title="Bộ lọc dự án / danh mục"
            aria-label="Bộ lọc"
            style={showFilters ? { borderColor: "var(--orange)", color: "var(--orange)" } : undefined}
          >
            ⏷
          </button>
        </div>

        {showFilters && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <select className="ctrl" style={{ flex: 1, minWidth: 160 }} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="">Tất cả dự án</option>
              <option value="none">Chi chung công ty</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
            <select className="ctrl" style={{ flex: 1, minWidth: 160 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          {TABS.map((t) => {
            const cnt = tabCount(t.key);
            return (
              <button key={t.key} className={`tab${status === t.key ? " on" : ""}`} onClick={() => setStatus(t.key)}>
                {t.label}
                {cnt != null && <span className="cnt">{cnt}</span>}
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading && <div className="empty">Đang tải…</div>}
        {!loading && rows.length === 0 && <div className="empty">Chưa có lệnh chi nào.</div>}

        {!loading && rows.length > 0 && (
          <div className="list">
            {rows.map((r) => {
              const isUrgent = r.priority === "urgent" && r.status === "pending";
              const canQuickTransfer = r.status === "pending" && !!r.payeeBankBin && !!r.payeeAccountNumber && canMarkPaid;
              const isExpanded = expandedId === r.id;
              const toggle = () => setExpandedId((prev) => (prev === r.id ? null : r.id));
              const bank = r.payeeBankBin ? findBankByBin(r.payeeBankBin) : null;
              const sb = statusBadge(r.status);
              const atts = attachmentList(r);

              const hasActbar =
                canQuickTransfer ||
                (r.status === "pending" && canMarkPaid && !canQuickTransfer) ||
                (r.status === "pending" && isAdmin) ||
                (r.status === "tptc_pending" && isAdmin) ||
                (canCreate && r.status !== "cancelled") ||
                atts.length > 0 ||
                !!r.paidReceiptUrl;

              return (
                <div
                  key={r.id}
                  ref={r.id === highlightId ? highlightRef : undefined}
                  onClick={canQuickTransfer ? toggle : undefined}
                  className={`rcx${canQuickTransfer ? " clickable" : ""}${isUrgent ? " urgent" : ""}${
                    r.id === highlightId ? " hl" : ""
                  }`}
                  style={r.status === "cancelled" ? { opacity: 0.72 } : r.status === "paid" ? { opacity: 0.92 } : undefined}
                >
                  {/* Header */}
                  <div className="rcx-hd">
                    <div className="rcx-badges">
                      <span className={`stbadge ${sb.cls}`}>{sb.label}</span>
                      {isUrgent && <span className="stbadge st-urgent">🚨 Gấp</span>}
                      <span className="ccode">{r.code}</span>
                    </div>
                    <div className="rcx-amt num" style={r.status === "paid" ? { fontSize: 18 } : undefined}>
                      {moneyPlain(r.amount)}
                      <span className="u"> đ</span>
                      {r.paidAmount != null && r.paidAmount !== r.amount && (
                        <span className="real">Thực chi {money(r.paidAmount)}</span>
                      )}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="rcx-meta">
                    <div className="mrow">
                      <span className="mdot" style={{ background: "var(--orange)" }} />
                      <span className="strong">{r.category.name}</span>
                      {r.payee && <span className="mut">· {r.payee}</span>}
                    </div>
                    <div className="mrow" style={{ color: "var(--mut)" }}>
                      <span className="mdot" style={{ background: "var(--mut2)" }} />
                      {r.project ? (
                        <span>
                          <span className="num" style={{ color: "var(--terra)" }}>
                            {r.project.code}
                          </span>{" "}
                          — {r.project.name}
                        </span>
                      ) : r.designContract ? (
                        <span>
                          <span className="num" style={{ color: "var(--terra)" }}>
                            TK
                          </span>{" "}
                          — {r.designContract.customerName}
                        </span>
                      ) : (
                        <span>Chi chung công ty</span>
                      )}
                    </div>
                    <div className="mrow dim">
                      <span className="mdot" style={{ background: "var(--mut2)", opacity: 0.6 }} />
                      {fmtDate(r.createdAt)} · {r.creator.fullName}
                    </div>

                    {r.status === "tptc_pending" && (
                      <div className="mrow wait">
                        <span className="mdot" style={{ background: "var(--violet)" }} />⏳ KT {r.creator?.fullName ?? ""} tạo · chờ admin duyệt
                      </div>
                    )}
                    {r.status === "paid" && (
                      <div className="mrow ok">
                        <span className="mdot" style={{ background: "var(--ok)" }} />✓ Đã chi {fmtDate(r.paidAt)}
                        {r.payer ? ` · KT ${r.payer.fullName}` : ""}
                      </div>
                    )}
                    {r.status === "cancelled" && (
                      <div className="mrow cancel">
                        <span className="mdot" style={{ background: "var(--mut2)" }} />✕ Huỷ {fmtDate(r.cancelledAt)}
                        {r.cancelledReason ? ` · ${r.cancelledReason}` : ""}
                      </div>
                    )}
                  </div>

                  {/* Note admin */}
                  {r.note && <div className="note-adm">&ldquo;{r.note}&rdquo;</div>}

                  {/* Ghi chú KT lúc thanh toán */}
                  {r.paidNote && (
                    <div className="note-kt">
                      <b>Ghi chú KT:</b> <span style={{ fontStyle: "italic" }}>&ldquo;{r.paidNote}&rdquo;</span>
                    </div>
                  )}

                  {/* Bank box */}
                  {bank && r.payeeAccountNumber && (
                    <div className="bankbox">
                      <div className="lg">{bank.shortName.slice(0, 3).toUpperCase()}</div>
                      <div className="bk">
                        <div className="nm">{bank.shortName}</div>
                        <div className="no num">{r.payeeAccountNumber}</div>
                      </div>
                      {r.payeeAccountName && <div className="own">{r.payeeAccountName}</div>}
                    </div>
                  )}

                  {/* Actbar */}
                  {hasActbar && (
                    <div className="actbar" onClick={(e) => e.stopPropagation()}>
                      {canCreate && r.status !== "cancelled" && (
                        <button
                          className="actbtn a-link"
                          onClick={() => sendPublicLink(r)}
                          disabled={linkBusyId === r.id}
                          title="Copy link theo dõi thanh toán để gửi NCC"
                        >
                          {linkBusyId === r.id ? "Đang tạo…" : "🔗 Gửi link NCC"}
                        </button>
                      )}
                      {canQuickTransfer && (
                        <button className={`actbtn ${isExpanded ? "a-cancel" : "a-ck"}`} onClick={toggle}>
                          {isExpanded ? "⌃ Thu gọn" : "💸 Chuyển khoản"}
                        </button>
                      )}
                      {r.status === "pending" && canMarkPaid && !canQuickTransfer && (
                        <button className="actbtn a-ok" onClick={() => openPayDialog(r)}>
                          💵 Ghi nhận đã chi
                        </button>
                      )}
                      {r.status === "tptc_pending" && isAdmin && (
                        <>
                          <button className="actbtn a-approve" onClick={() => approveExpense(r)}>
                            ✓ Duyệt
                          </button>
                          <button className="actbtn a-cancel" onClick={() => rejectExpense(r)}>
                            ✕ Từ chối
                          </button>
                        </>
                      )}
                      {r.status === "pending" && isAdmin && (
                        <button
                          className="actbtn a-cancel"
                          onClick={() => {
                            setOpenCancel(r);
                            setCancelReason("");
                          }}
                        >
                          Huỷ
                        </button>
                      )}
                      {(atts.length > 0 || r.paidReceiptUrl) && (
                        <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
                          {atts.length > 0 && (
                            <button
                              className="actbtn a-bill"
                              style={{ marginLeft: 0 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewer({ urls: atts, index: 0, expenseId: r.id, type: "attachment" });
                              }}
                            >
                              📎 {atts.length > 1 ? `${atts.length} hoá đơn` : "Hoá đơn"}
                            </button>
                          )}
                          {r.paidReceiptUrl && (
                            <a
                              className="actbtn a-doc"
                              href={r.paidReceiptUrl.startsWith("minio://") ? `/api/expenses/${r.id}/file?type=receipt` : r.paidReceiptUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              📄 Chứng từ
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expanded transfer */}
                  {canQuickTransfer && isExpanded && (
                    <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
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
          <div className="foot-note">
            Tổng {rows.length} lệnh · {money(totalAmount)}
            {totalPaid > 0 ? ` · Đã chi ${money(totalPaid)}` : ""}
          </div>
        )}
      </div>

      {/* ===== POPUP: Ghi nhận đã chi ===== */}
      {openPay && overlay(
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setOpenPay(null)}>
          <form className="sheet" onSubmit={submitPay}>
            <div className="sheet-hd">
              <div>
                <h3 className="ok">✓ Ghi nhận đã chi</h3>
                <div className="sub">LC · {openPay.code}</div>
              </div>
              <button className="iconbtn" type="button" onClick={() => setOpenPay(null)} title="Đóng">
                ✕
              </button>
            </div>

            <div className="payinfo">
              <div className="big num">
                {moneyPlain(openPay.amount)} <span className="u">đ</span>
              </div>
              <div className="rows">
                <div className="irow">
                  <span className="k">Danh mục</span>
                  <span className="v">{openPay.category.name}</span>
                </div>
                <div className="irow">
                  <span className="k">SĐT người nhận</span>
                  <span className="v">{openPay.payeePhone || "—"}</span>
                </div>
                <div className="irow">
                  <span className="k">Dự án</span>
                  <span className="v">
                    {openPay.project
                      ? `${openPay.project.code} — ${openPay.project.name}`
                      : openPay.designContract
                        ? `TK — ${openPay.designContract.customerName}`
                        : "Chi chung công ty"}
                  </span>
                </div>
                <div className="irow">
                  <span className="k">Phương thức</span>
                  <span className="v">{openPay.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản"}</span>
                </div>
                <div className="irow">
                  <span className="k">Nội dung</span>
                  <span className="v">{openPay.note || "—"}</span>
                </div>
                <div className="irow">
                  <span className="k">Ngày tạo</span>
                  <span className="v">
                    {fmtDate(openPay.createdAt)} · {openPay.creator.fullName}
                  </span>
                </div>
              </div>
            </div>

            <div className="hint strong">Xác nhận đã chi</div>

            <div className="fgrid">
              <div className="fld">
                <span className="lbl">
                  Số tiền thực chi <span className="req">*</span>
                </span>
                <div className="money-wrap">
                  <MoneyInput value={payAmount} onChange={setPayAmount} required className="ctrl num" />
                  <span className="cur">đ</span>
                </div>
              </div>
              <div className="fld">
                <div className="dateinline">
                  <span className="lbl">Ngày chi</span>
                  <input className="ctrl bare" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
                </div>
              </div>
            </div>

            {/* Chọn TK quỹ */}
            <div className="acclbl">
              💰 Chi từ tài khoản quỹ <span className="req">*</span>
            </div>
            <div className="accpick">
              {cashAccounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`acc${payAccountId === a.id ? " on" : ""}`}
                  onClick={() => setPayAccountId(a.id)}
                >
                  <div className="ic">{a.kind === "cash" ? "💵" : "🏦"}</div>
                  <div>
                    <div className="nm">{a.name}</div>
                    <div className="kd">{a.kind === "cash" ? "Quỹ tiền mặt" : "Ngân hàng"}</div>
                  </div>
                  <div className="bal">
                    <div className="b num">{moneyPlain(a.currentBalance)}</div>
                    <div className="l">số dư đ</div>
                  </div>
                  <div className="rad" />
                </button>
              ))}
              {cashAccounts.length === 0 && <div className="hint">Chưa có tài khoản quỹ.</div>}
            </div>

            {selAcc && payAfter != null && (
              <div className="after">
                <span className="lb">Số dư sau chi ({selAcc.name})</span>
                <span className={`v ${payAfter < 0 ? "warn" : "ok"}`}>{money(payAfter)}</span>
              </div>
            )}

            {/* Ghi chú */}
            <div className="notes">
              <div className="lbl">Ghi chú</div>
              {openPay.note && (
                <div className="notelist">
                  <div className="note">
                    <span className="who admin">Admin</span>
                    <div className="bd">
                      <div className="tx">{openPay.note}</div>
                      <div className="mt">
                        {openPay.creator.fullName} · {fmtDate(openPay.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="addnote">
                <input
                  className="ctrl"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Thêm ghi chú của kế toán…"
                />
              </div>
            </div>

            {/* Ảnh chứng từ */}
            <ReceiptMultiPicker value={payReceiptUrls} onChange={setPayReceiptUrls} />

            <div className="acts">
              <button className="btn ghost" type="button" onClick={() => setOpenPay(null)}>
                Huỷ
              </button>
              <button className="btn primary block" type="submit" disabled={paying}>
                {paying ? "Đang ghi…" : "Xác nhận + ghi sổ quỹ →"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== POPUP: Tạo lệnh chi ===== */}
      {showCreate && canCreate && overlay(
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}>
          <form className="sheet" onSubmit={submitCreate}>
            <div className="sheet-hd">
              <div>
                <h3 className="orange">+ Lệnh chi mới</h3>
                <div className="sub">
                  Số dư quỹ: {balance == null ? "…" : money(balance)}
                  {balanceAfterForm != null && Number(form.amount) > 0
                    ? ` → sau chi: ${money(balanceAfterForm)}${balanceAfterForm < 0 ? " ⚠" : ""}`
                    : ""}
                </div>
              </div>
              <button className="iconbtn" type="button" onClick={() => setShowCreate(false)} title="Đóng">
                ✕
              </button>
            </div>

            <div className="formgrid" style={{ marginBottom: 12 }}>
              <label className="fld" style={{ marginBottom: 0 }}>
                <span className="lbl">Chi cho hợp đồng</span>
                <select
                  className="ctrl"
                  value={form.projectId ? `p:${form.projectId}` : form.designContractId ? `d:${form.designContractId}` : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const newScope: "project" | "company" = v.startsWith("p:") || v.startsWith("d:") ? "project" : "company";
                    // Đổi ngữ cảnh → nếu danh mục đang chọn khác scope mới thì bỏ chọn.
                    const selCat = categories.find((c) => c.id === form.categoryId);
                    const keepCat = selCat && selCat.scope === newScope ? form.categoryId : "";
                    if (v.startsWith("p:")) setForm({ ...form, projectId: v.slice(2), designContractId: "", categoryId: keepCat });
                    else if (v.startsWith("d:")) setForm({ ...form, projectId: "", designContractId: v.slice(2), categoryId: keepCat });
                    else setForm({ ...form, projectId: "", designContractId: "", categoryId: keepCat });
                  }}
                >
                  <option value="">Chi chung công ty</option>
                  <optgroup label="HĐ thi công">
                    {projects.map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="HĐ thiết kế">
                    {designContracts.map((c) => (
                      <option key={c.id} value={`d:${c.id}`}>
                        TK {c.signedAt} — {c.customerName}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <label className="fld" style={{ marginBottom: 0 }}>
                <span className="lbl">
                  Danh mục <span className="req">*</span>
                </span>
                <select className="ctrl" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                  <option value="">— Chọn —</option>
                  {visibleCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fld" style={{ marginBottom: 0 }}>
                <span className="lbl">
                  Số tiền <span className="req">*</span>
                </span>
                <div className="money-wrap">
                  <MoneyInput value={form.amount} onChange={(raw) => setForm({ ...form, amount: raw })} required className="ctrl num" />
                  <span className="cur">đ</span>
                </div>
              </label>
              <label className="fld" style={{ marginBottom: 0 }}>
                <span className="lbl">Người/đơn vị nhận</span>
                <input className="ctrl" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder="VD: Cửa hàng VLXD Minh Anh" />
              </label>
              <label className="fld" style={{ marginBottom: 0 }}>
                <span className="lbl">
                  SĐT người nhận <span className="req">*</span>
                </span>
                <input
                  className="ctrl"
                  type="tel"
                  inputMode="tel"
                  value={form.payeePhone}
                  onChange={(e) => setForm({ ...form, payeePhone: e.target.value.replace(/[^0-9+ ]/g, "") })}
                  placeholder="VD: 0912 345 678"
                  required
                />
              </label>
              <label className="fld" style={{ marginBottom: 0 }}>
                <span className="lbl">Phương thức</span>
                <select
                  className="ctrl"
                  value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as "cash" | "transfer" })}
                >
                  <option value="transfer">Chuyển khoản</option>
                  <option value="cash">Tiền mặt</option>
                </select>
              </label>
            </div>

            {/* Ảnh hoá đơn */}
            <div className="fld">
              <span className="lbl">Ảnh hoá đơn / báo giá {form.attachmentUrls.length > 0 && `(${form.attachmentUrls.length}/20)`}</span>
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
              <button
                type="button"
                className="attach"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={uploadingAttachment || form.attachmentUrls.length >= 20}
              >
                {uploadingAttachment ? "Đang tải…" : form.attachmentUrls.length ? "📎 Thêm ảnh hoá đơn" : "📷 Kéo thả / bấm chọn ảnh hoá đơn"}
              </button>
              {form.attachmentUrls.length > 0 && (
                <div className="thumbs">
                  {form.attachmentUrls.map((url, i) => {
                    const isPdf = url.toLowerCase().endsWith(".pdf");
                    const previewSrc = url.startsWith("minio://") ? `/api/expenses/upload-preview?url=${encodeURIComponent(url)}` : url;
                    return (
                      <div key={`${url}-${i}`} className="thumb">
                        {isPdf ? (
                          <div className="pdf">📄 PDF</div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewSrc} alt={`bill-${i + 1}`} />
                        )}
                        <button type="button" className="rm" onClick={() => removeAttachment(i)} title="Xoá ảnh">
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tài khoản nhận (admin nhập cho KT chuyển) */}
            {!isKt && (
              <div className="fld">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="lbl">Tài khoản nhận (để KT bấm “Chuyển khoản”)</span>
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
                  <button type="button" className="actbtn a-link" onClick={() => qrInputRef.current?.click()} disabled={decoding}>
                    {decoding ? "Đang đọc QR…" : "📷 Tải ảnh QR"}
                  </button>
                </div>
                <div className="formgrid">
                  <label className="fld" style={{ marginBottom: 0 }}>
                    <span className="lbl">Ngân hàng</span>
                    <select className="ctrl" value={form.payeeBankBin} onChange={(e) => setForm({ ...form, payeeBankBin: e.target.value })}>
                      <option value="">— Chọn ngân hàng —</option>
                      {VN_BANKS.map((b) => (
                        <option key={b.bin} value={b.bin}>
                          {b.shortName} ({b.name})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fld" style={{ marginBottom: 0 }}>
                    <span className="lbl">Số tài khoản</span>
                    <input
                      className="ctrl"
                      value={form.payeeAccountNumber}
                      onChange={(e) => setForm({ ...form, payeeAccountNumber: e.target.value.replace(/[^0-9A-Za-z]/g, "") })}
                      placeholder="VD: 0123456789"
                    />
                  </label>
                  <label className="fld full" style={{ marginBottom: 0 }}>
                    <span className="lbl">Tên chủ TK</span>
                    <input
                      className="ctrl"
                      value={form.payeeAccountName}
                      onChange={(e) => setForm({ ...form, payeeAccountName: e.target.value })}
                      placeholder="Hiện trên QR (tuỳ chọn)"
                    />
                  </label>
                </div>
                {form.payeeBankBin && form.payeeAccountNumber && (
                  <div className="ok-line">✓ KT sẽ thấy nút “Chuyển khoản” mở thẳng app ngân hàng</div>
                )}
              </div>
            )}

            {/* Độ khẩn */}
            {!isKt && (
              <div className="fld">
                <span className="lbl">Độ khẩn</span>
                <div className="seg">
                  <button type="button" className={form.priority === "normal" ? "on" : ""} onClick={() => setForm({ ...form, priority: "normal" })}>
                    Thường (nhắc 15ph/lần)
                  </button>
                  <button
                    type="button"
                    className={form.priority === "urgent" ? "on urgent" : ""}
                    onClick={() => setForm({ ...form, priority: "urgent" })}
                  >
                    🚨 Gấp (nhắc 1ph/lần)
                  </button>
                </div>
              </div>
            )}

            <label className="fld">
              <span className="lbl">Ghi chú</span>
              <textarea
                className="ctrl"
                rows={2}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Nội dung chi (vd: mua mực in cho VP, xăng xe đi công trình…)"
              />
            </label>

            {isKt && <div className="kt-note">Lệnh chi do KT tạo sẽ chờ admin duyệt trước khi thanh toán.</div>}

            <div className="acts">
              <button className="btn ghost" type="button" onClick={() => { setShowCreate(false); setForm(emptyCreate); }}>
                Huỷ
              </button>
              <button className="btn primary block" type="submit" disabled={creating}>
                {creating ? "Đang tạo…" : isKt ? "Gửi admin duyệt" : "Gửi KT thanh toán"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== POPUP: Huỷ ===== */}
      {openCancel && overlay(
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setOpenCancel(null)}>
          <div className="sheet">
            <div className="sheet-hd">
              <div>
                <h3 className="red">Huỷ lệnh chi</h3>
                <div className="sub">{openCancel.code}</div>
              </div>
              <button className="iconbtn" type="button" onClick={() => setOpenCancel(null)} title="Đóng">
                ✕
              </button>
            </div>
            <div className="fld">
              <span className="lbl">
                Lý do huỷ <span className="req">*</span>
              </span>
              <textarea className="ctrl" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </div>
            <div className="acts">
              <button className="btn ghost" type="button" onClick={() => setOpenCancel(null)}>
                Đóng
              </button>
              <button className="btn primary block" style={{ background: "var(--red)" }} type="button" onClick={submitCancel} disabled={cancelling}>
                {cancelling ? "Đang huỷ…" : "Xác nhận huỷ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== POPUP: Hướng dẫn ===== */}
      {showHelp && overlay(
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setShowHelp(false)}>
          <div className="sheet">
            <div className="sheet-hd">
              <div>
                <h3 className="orange">Hướng dẫn dùng Lệnh chi</h3>
              </div>
              <button className="iconbtn" type="button" onClick={() => setShowHelp(false)} title="Đóng">
                ✕
              </button>
            </div>
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
              <p style={{ marginBottom: 10 }}>
                <b>Admin</b> tạo lệnh chi → KT nhận push + bell → KT bấm <b style={{ color: "var(--ok)" }}>“Ghi nhận đã chi”</b> sau khi chuyển tiền.
              </p>
              <ul style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                <li>
                  <b style={{ color: "var(--red)" }}>🚨 Gấp</b>: nhắc KT mỗi <b>1 phút</b> đến khi xử lý.
                </li>
                <li>
                  <b>Thường</b>: nhắc mỗi <b>15 phút</b>.
                </li>
                <li>Khi tạo, anh thấy ngay <b>số dư quỹ trước/sau</b> để biết có vượt không.</li>
                <li>Lệnh đã <b>“Đã chi”</b> sẽ tự trừ vào sổ quỹ — không huỷ được. Sai thì xoá ở /treasury.</li>
                <li>Lệnh đang <b>chờ chi</b> mới huỷ được, phải nhập lý do.</li>
              </ul>
            </div>
            <div className="acts">
              <button className="btn primary block" type="button" onClick={() => setShowHelp(false)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Sổ quỹ chi tiết ===== */}
      {showTreasury && overlay(
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-2 pt-4" onClick={() => setShowTreasury(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-5xl rounded-xl border border-[#2d3249] bg-[#0b0d16] shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-[#2d3249] bg-[#13151f] px-4 py-2.5">
              <div className="text-base font-semibold text-orange-300">Sổ quỹ — chi tiết</div>
              <button onClick={() => setShowTreasury(false)} className="rounded-lg px-2 py-1 text-[#8b95b7] hover:bg-[#0b0d16] hover:text-[#f0f2ff]" aria-label="Đóng">
                ✕
              </button>
            </div>
            <div className="p-3">
              <TreasuryClient projects={projects} categories={categories} />
            </div>
          </div>
        </div>
      )}

      {/* ===== Lightbox ảnh ===== */}
      {viewer && overlay((() => {
        const url = viewer.urls[viewer.index];
        const src = url.startsWith("minio://")
          ? `/api/expenses/${viewer.expenseId}/file?type=${viewer.type}${viewer.type === "attachment" ? `&index=${viewer.index}` : ""}`
          : url;
        const isPdf = url.toLowerCase().endsWith(".pdf");
        return (
          <div className="lc-doc-viewer" onClick={() => setViewer(null)}>
            <button type="button" className="vbtn vclose" onClick={(e) => { e.stopPropagation(); setViewer(null); }} aria-label="Đóng">
              ✕
            </button>
            {viewer.urls.length > 1 && (
              <>
                <button
                  type="button"
                  className="vbtn vprev"
                  onClick={(e) => { e.stopPropagation(); setViewer((v) => (v ? { ...v, index: (v.index - 1 + v.urls.length) % v.urls.length } : v)); }}
                  aria-label="Trước"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="vbtn vnext"
                  onClick={(e) => { e.stopPropagation(); setViewer((v) => (v ? { ...v, index: (v.index + 1) % v.urls.length } : v)); }}
                  aria-label="Sau"
                >
                  ›
                </button>
                <div className="vcount">
                  {viewer.index + 1} / {viewer.urls.length}
                </div>
              </>
            )}
            {isPdf ? (
              <a href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="rounded-lg bg-white px-6 py-4 text-lg font-semibold text-blue-600 shadow-2xl">
                📄 Mở PDF #{viewer.index + 1}
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={`Hoá đơn ${viewer.index + 1}`} onClick={(e) => e.stopPropagation()} />
            )}
          </div>
        );
      })())}
    </div>
  );
}

const KT_BANK_LS_KEY = "expenses.ktBankBin";

// Chọn nhiều ảnh chứng từ chuyển khoản (bill) — hiện trên trang theo dõi công khai của NCC.
function ReceiptMultiPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const MAX = 20;

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const remaining = MAX - value.length;
    if (remaining <= 0) {
      toast.error(`Tối đa ${MAX} ảnh`);
      return;
    }
    setUploading(true);
    try {
      const added: string[] = [];
      for (const file of list.slice(0, remaining)) {
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
          toast.error("Chỉ hỗ trợ ảnh hoặc PDF");
          continue;
        }
        if (file.size > 8 * 1024 * 1024) {
          toast.error("File quá lớn (tối đa 8MB)");
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", "receipt");
        const res = await fetch("/api/expenses/upload-receipt", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(j.message || "Upload thất bại");
          continue;
        }
        added.push(j.url);
      }
      if (added.length) {
        onChange([...value, ...added]);
        toast.success(`Đã tải ${added.length} ảnh`);
      }
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="fld">
      <span className="lbl">Ảnh uỷ nhiệm chi / biên lai (tuỳ chọn){value.length > 0 && ` — ${value.length}/${MAX}`}</span>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length) handleFiles(fs);
        }}
      />
      <button type="button" className="attach" onClick={() => ref.current?.click()} disabled={uploading || value.length >= MAX}>
        {uploading ? "Đang tải…" : value.length ? "📎 Thêm ảnh chứng từ" : "📎 Kéo thả ảnh / PDF · hoặc bấm chọn"}
      </button>
      {value.length > 0 && (
        <div className="thumbs">
          {value.map((url, i) => (
            <div key={i} className="thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/expenses/upload-preview?url=${encodeURIComponent(url)}`} alt={`Bill ${i + 1}`} />
              <button type="button" className="rm" onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label="Xoá ảnh">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
    <div className="fld">
      <span className="lbl">Ảnh chứng từ chuyển khoản (tuỳ chọn)</span>
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" className="attach" style={{ flex: 1 }} onClick={() => ref.current?.click()} disabled={uploading}>
          {uploading ? "Đang tải…" : value ? "📎 Đổi ảnh chứng từ" : "📷 Chọn ảnh chứng từ"}
        </button>
        {value && (
          <button type="button" className="actbtn a-cancel" onClick={() => onChange("")}>
            Xoá
          </button>
        )}
      </div>
      {value && <div className="ok-line">✓ đã đính kèm</div>}
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
  const qrUrl =
    expense.payeeBankBin && expense.payeeAccountNumber
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
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      {qrUrl && (
        <div className="qrbox">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="VietQR" />
        </div>
      )}

      <div className="kv">
        <div className="row" style={{ cursor: "default" }}>
          <span className="k">NH nhận</span>
          <span className="v">{recipientBank?.shortName ?? "—"}</span>
        </div>
        <button type="button" className="row" onClick={() => copy(expense.payeeAccountNumber!, "số TK")} title="Bấm để copy">
          <span className="k">Số TK</span>
          <span className="v mono">{expense.payeeAccountNumber} ⧉</span>
        </button>
        {expense.payeeAccountName && (
          <div className="row" style={{ cursor: "default" }}>
            <span className="k">Chủ TK</span>
            <span className="v" style={{ textTransform: "uppercase" }}>
              {expense.payeeAccountName}
            </span>
          </div>
        )}
        <button type="button" className="row" onClick={() => copy(String(Math.round(expense.amount)), "số tiền")} title="Bấm để copy">
          <span className="k">Số tiền</span>
          <span className="v amt">{money(expense.amount)} ⧉</span>
        </button>
        <button type="button" className="row" onClick={() => copy(memo, "nội dung")} title="Bấm để copy">
          <span className="k">Nội dung</span>
          <span className="v mono">{memo} ⧉</span>
        </button>
        {expense.note && (
          <button type="button" className="row" onClick={() => copy(expense.note!, "ghi chú admin")} title="Bấm để copy">
            <span className="k">Ghi chú</span>
            <span className="v" style={{ fontWeight: 400 }}>
              {expense.note} ⧉
            </span>
          </button>
        )}
      </div>

      <div className="fld">
        <span className="lbl">App NH em đang dùng để chuyển</span>
        <select className="ctrl" value={ktBankBin} onChange={(e) => chooseKtBank(e.target.value)}>
          <option value="">— Chọn NH em dùng —</option>
          {VN_BANKS.map((b) => (
            <option key={b.bin} value={b.bin}>
              {b.shortName} ({b.name})
            </option>
          ))}
        </select>
        {ktBank && !ktBank.autofill && (
          <div className="hint">
            {ktBank.appId
              ? `Bấm nút → lưu QR vào Photos → app ${ktBank.shortName} tự mở → Quét QR → Quét từ thư viện.`
              : `Lưu QR → mở app ${ktBank.shortName} thủ công → Quét QR → Quét từ thư viện.`}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <button className="btn primary block" onClick={transferCombo} disabled={!ktBank}>
          {!ktBank
            ? "Chọn NH em dùng để chuyển"
            : ktBank.autofill && ktBank.appId
              ? `💸 Chuyển qua ${ktBank.shortName}`
              : ktBank.appId
                ? `💸 Lưu QR + Mở ${ktBank.shortName}`
                : `💾 Lưu QR (mở app ${ktBank.shortName} thủ công)`}
        </button>
        <button className="btn ghost block" onClick={() => saveQrImage(false)}>
          💾 Chỉ lưu ảnh QR
        </button>
      </div>

      {canMarkPaid && (
        <div style={{ border: "1px solid color-mix(in srgb, var(--ok) 40%, var(--line2))", background: "color-mix(in srgb, var(--ok) 10%, transparent)", borderRadius: 12, padding: 11 }}>
          {!showPayForm ? (
            <button className="btn primary block" style={{ background: "var(--ok)" }} type="button" onClick={() => setShowPayForm(true)}>
              ✓ Đã chuyển xong — ghi sổ
            </button>
          ) : (
            <>
              <div className="acclbl" style={{ color: "var(--ok)" }}>
                Xác nhận đã chuyển khoản
              </div>
              <div className="fgrid" style={{ marginBottom: 12 }}>
                <div className="fld" style={{ marginBottom: 0 }}>
                  <span className="lbl">
                    Số tiền <span className="req">*</span>
                  </span>
                  <div className="money-wrap">
                    <MoneyInput value={payAmount} onChange={setPayAmount} className="ctrl num" />
                    <span className="cur">đ</span>
                  </div>
                </div>
                <div className="fld" style={{ marginBottom: 0 }}>
                  <div className="dateinline">
                    <span className="lbl">Ngày chi</span>
                    <input className="ctrl bare" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                  </div>
                </div>
              </div>
              <ReceiptFilePicker value={payReceipt} onChange={setPayReceipt} />
              <div className="acclbl" style={{ color: "var(--terra)" }}>
                💰 Chi từ tài khoản quỹ <span className="req">*</span>
              </div>
              <div className="accpick" style={{ marginBottom: 12 }}>
                {cashAccounts.map((a: CashAccountOption) => (
                  <button key={a.id} type="button" className={`acc${payAccountId === a.id ? " on" : ""}`} onClick={() => setPayAccountId(a.id)}>
                    <div className="ic">{a.kind === "cash" ? "💵" : "🏦"}</div>
                    <div>
                      <div className="nm">{a.name}</div>
                      <div className="kd">{a.kind === "cash" ? "Quỹ tiền mặt" : "Ngân hàng"}</div>
                    </div>
                    <div className="bal">
                      <div className="b num">{moneyPlain(a.currentBalance)}</div>
                      <div className="l">số dư đ</div>
                    </div>
                    <div className="rad" />
                  </button>
                ))}
              </div>
              <label className="fld">
                <span className="lbl">Ghi chú KT</span>
                <textarea
                  className="ctrl"
                  rows={2}
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="VD: chuyển lúc 14h, mã GD 88231"
                />
              </label>
              <div className="warn-line">Trừ ngay vào số dư tài khoản đã chọn. Không huỷ được sau khi xác nhận.</div>
              <div className="acts">
                <button type="button" className="btn ghost" onClick={() => setShowPayForm(false)}>
                  Quay lại
                </button>
                <button type="button" className="btn primary block" style={{ background: "var(--ok)" }} onClick={confirmPaid} disabled={paying}>
                  {paying ? "Đang ghi…" : "Xác nhận đã chuyển"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
