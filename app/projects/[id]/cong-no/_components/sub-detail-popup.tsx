"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { SubContractStatus, SubPaymentStatus } from "@prisma/client";
import { toast } from "sonner";
import {
  formatDate,
  formatMoney,
  subContractStatusLabel,
  subContractUnitLabel,
} from "@/lib/sub-contract-view";
import { useCashAccounts, formatCashAccountLabel } from "@/lib/use-cash-accounts";

const plexSans = IBM_Plex_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

// ── Popup chi tiết Hợp đồng thầu phụ — full màn, tông ngà (.cndoc).
// Render trong tab Thầu phụ (màn Quản lý NCC). Giữ đủ chức năng của màn cũ.

type ContractDetail = {
  id: string;
  code: string;
  title: string;
  scopeOfWork: string;
  unit: string | null;
  unitPrice: number | null;
  quantity: number | null;
  contractValue: number | null;
  startDate: string;
  expectedEndDate: string;
  actualEndDate: string | null;
  status: SubContractStatus;
  notes: string | null;
  project: { id: string; code: string; name: string };
  subcontractor: {
    id: string;
    code: string;
    name: string;
    phone: string;
    bankName: string | null;
    bankAccount: string | null;
    bankAccountName: string | null;
  };
  creator: { id: string; fullName: string };
  linkedTasks: Array<{ id: string; code: string; name: string; status: string; phase: string }>;
  files: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string;
    uploadedAt: string;
    uploader: { id: string; fullName: string };
  }>;
  canManageFiles: boolean;
  canActivate: boolean;
  canComplete: boolean;
  canCancel: boolean;
};

type SubPayment = {
  id: string;
  code: string;
  stage: number;
  stageLabel?: string;
  description: string;
  expectedAmount: number | null;
  expectedDate: string;
  percentage: number | null;
  actualAmount: number | null;
  actualPaidDate: string | null;
  status: SubPaymentStatus;
  receiptUrl: string | null;
  linkedExpense: { id: string; code: string; status: string } | null;
};

type PaymentMeta = {
  contract: { id: string; status: string; contractValue: number | null; canViewFinancial: boolean };
  linkedTasks: Array<{ id: string; code: string; name: string; status: string }>;
  totals: { percentTotal: number | null; paidTotal: number | null };
  capabilities: { canCreate: boolean; canRequest: boolean; canApprove: boolean; canMarkPaid: boolean };
};

type DraftRow = {
  id: string;
  description: string;
  expectedDate: string;
  linkedTaskId: string;
  mode: "percent" | "amount";
  percentage: string;
  expectedAmount: string;
};

type EvaluationCriterion = { id: string; code: string; name: string; weight: number };
type EvaluationScore = { id: string; criterionId: string; score: number; criterion: EvaluationCriterion };
type SubEvaluation = {
  id: string;
  evaluatorId: string;
  overallRating: number;
  comment: string | null;
  willHireAgain: boolean;
  createdAt: string;
  evaluator: { id: string; fullName: string; role: string };
  scores: EvaluationScore[];
};

type TabValue = "info" | "payment" | "task" | "evaluation" | "file";

const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function payChip(s: SubPaymentStatus) {
  if (s === SubPaymentStatus.paid) return "paidoff";
  if (s === SubPaymentStatus.requested || s === SubPaymentStatus.approved) return "await";
  if (s === SubPaymentStatus.cancelled) return "";
  return "debt";
}
function payLabel(s: SubPaymentStatus) {
  if (s === SubPaymentStatus.pending) return "Chờ";
  if (s === SubPaymentStatus.requested) return "Đã đề xuất";
  if (s === SubPaymentStatus.approved) return "Đã duyệt";
  if (s === SubPaymentStatus.paid) return "Đã chi";
  return "Đã hủy";
}
// Đợt "tạm ứng dở" (cách A — suy từ số): đã chi > 0 nhưng chưa đủ dự kiến & chưa paid/huỷ.
function isAdvancing(p: { status: SubPaymentStatus; expectedAmount: number | null; actualAmount: number | null }) {
  if (p.status === SubPaymentStatus.paid || p.status === SubPaymentStatus.cancelled) return false;
  const a = Number(p.actualAmount || 0);
  const e = Number(p.expectedAmount || 0);
  return a > 0 && (e <= 0 || a < e - 1);
}
// Phần còn lại của đợt (dự kiến − đã tạm ứng), tối thiểu 0.
function payRemaining(p: { expectedAmount: number | null; actualAmount: number | null }) {
  return Math.max(0, Number(p.expectedAmount || 0) - Number(p.actualAmount || 0));
}

export function SubDetailPopup({
  contractId,
  currentRole,
  currentUserId,
  onClose,
  onChanged,
}: {
  contractId: string;
  currentRole: string;
  currentUserId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const canWrite = currentRole === "admin" || currentRole === "construction_manager";
  const router = useRouter();

  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("payment");
  const [contract, setContract] = useState<ContractDetail | null>(null);

  const [payments, setPayments] = useState<SubPayment[]>([]);
  const [paymentMeta, setPaymentMeta] = useState<PaymentMeta | null>(null);
  const [uploading, setUploading] = useState(false);

  // mark-paid sheet
  const [openMarkPaid, setOpenMarkPaid] = useState<string | null>(null);
  const [markShow, setMarkShow] = useState(false);
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [actualDate, setActualDate] = useState(todayStr());
  const [paymentMethod, setPaymentMethod] = useState("chuyển khoản");
  const [payNote, setPayNote] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const { accounts: cashAccounts } = useCashAccounts();

  // draft schedule
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [showDraft, setShowDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // evaluations
  const [evalCriteria, setEvalCriteria] = useState<EvaluationCriterion[]>([]);
  const [evaluations, setEvaluations] = useState<SubEvaluation[]>([]);
  const [canCreateEval, setCanCreateEval] = useState(false);
  const [canDeleteAnyEval, setCanDeleteAnyEval] = useState(false);
  const [evalScores, setEvalScores] = useState<Record<string, number>>({});
  const [evalComment, setEvalComment] = useState("");
  const [evalWillHire, setEvalWillHire] = useState(true);
  const [evalSubmitting, setEvalSubmitting] = useState(false);

  // Portal ra body để position:fixed full viewport (AppShell .slide-up transform
  // làm fixed co lại → popup không full màn nếu render inline).
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("congno-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    setShow(false);
    setTimeout(onClose, 220);
  };

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/sub-contracts/${contractId}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không tải được chi tiết hợp đồng");
      setContract(null);
      return;
    }
    setContract(json.contract || null);
  }, [contractId]);

  const loadPayments = useCallback(async () => {
    const res = await fetch(`/api/sub-contracts/${contractId}/payments`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setPayments((json.payments || []) as SubPayment[]);
    setPaymentMeta({
      contract: json.contract,
      linkedTasks: json.linkedTasks || [],
      totals: json.totals,
      capabilities: json.capabilities,
    });
  }, [contractId]);

  const loadEvaluations = useCallback(async () => {
    const res = await fetch(`/api/sub-contracts/${contractId}/evaluations`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const criteria = (json.criteria || []) as EvaluationCriterion[];
    setEvalCriteria(criteria);
    setEvaluations((json.evaluations || []) as SubEvaluation[]);
    setCanCreateEval(Boolean(json.canCreate));
    setCanDeleteAnyEval(Boolean(json.canDeleteAny));
    const next: Record<string, number> = {};
    for (const c of criteria) next[c.id] = 0;
    setEvalScores(next);
    setEvalComment("");
    setEvalWillHire(true);
  }, [contractId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadData(), loadPayments()]);
      setLoading(false);
    })();
  }, [loadData, loadPayments]);

  useEffect(() => {
    if (tab === "evaluation") loadEvaluations();
  }, [tab, loadEvaluations]);

  const contractValue = Number(contract?.contractValue || 0);
  const paidTotal = Number(paymentMeta?.totals.paidTotal || 0);
  const remain = contractValue - paidTotal;
  const progress = contractValue > 0 ? Math.min(100, Math.round((paidTotal / contractValue) * 100)) : 0;
  const canFin = paymentMeta?.contract.canViewFinancial ?? true;

  const totalDraftPercent = useMemo(
    () => draftRows.reduce((s, r) => s + Number(r.percentage || 0), 0),
    [draftRows],
  );

  // ── actions ──────────────────────────────────────────────
  async function contractAction(kind: "activate" | "complete") {
    if (!contract) return;
    const res = await fetch(`/api/sub-contracts/${contract.id}/${kind}`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Thao tác thất bại");
    toast.success(json.message || "Đã cập nhật");
    await loadData();
    onChanged?.();
  }

  async function cancelContract() {
    if (!contract) return;
    const reason = window.prompt("Nhập lý do hủy hợp đồng:");
    if (!reason?.trim()) return;
    const res = await fetch(`/api/sub-contracts/${contract.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Không thể hủy hợp đồng");
    toast.success(json.message || "Đã hủy hợp đồng");
    await loadData();
    onChanged?.();
  }

  async function uploadFiles(files: FileList | null) {
    if (!contract || !files || files.length === 0) return;
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    setUploading(true);
    const res = await fetch(`/api/sub-contracts/${contract.id}/files`, { method: "POST", body: formData });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) return toast.error(json.message || "Upload tài liệu thất bại");
    toast.success(json.message || "Đã upload tài liệu");
    await loadData();
  }

  async function deleteFile(fileId: string) {
    if (!contract) return;
    if (!(await confirmDialog("Xóa tài liệu này?"))) return;
    const res = await fetch(`/api/sub-contracts/${contract.id}/files/${fileId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Xóa tài liệu thất bại");
    toast.success(json.message || "Đã xóa tài liệu");
    await loadData();
  }

  // draft schedule
  function openDraft() {
    setDraftRows([
      { id: crypto.randomUUID(), description: "Đợt 1", expectedDate: todayStr(), linkedTaskId: "", mode: "percent", percentage: "", expectedAmount: "" },
    ]);
    setShowDraft(true);
  }
  function patchDraft(id: string, patch: Partial<DraftRow>) {
    setDraftRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  async function saveDraft() {
    if (!contractValue) return toast.error("Không có giá trị hợp đồng");
    if (draftRows.length < 1 || draftRows.length > 10) return toast.error("Số đợt phải trong khoảng 1-10");
    const payload = draftRows.map((row, idx) => ({
      stage: idx + 1,
      description: row.description.trim() || `Đợt ${idx + 1}`,
      expectedDate: row.expectedDate || todayStr(),
      linkedTaskId: row.linkedTaskId.trim() || null,
      percentage: row.percentage ? Number(row.percentage) : null,
      expectedAmount: row.expectedAmount ? Number(row.expectedAmount) : null,
    }));
    setSavingDraft(true);
    const res = await fetch(`/api/sub-contracts/${contractId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payments: payload }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingDraft(false);
    if (!res.ok) return toast.error(json.message || "Không thể lưu lịch thanh toán");
    if (json.warning) toast.warning(json.warning);
    toast.success(json.message || "Đã lưu lịch thanh toán");
    setShowDraft(false);
    setDraftRows([]);
    await loadPayments();
  }

  async function changeStatus(paymentId: string, action: "request" | "approve") {
    const res = await fetch(`/api/sub-payments/${paymentId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: null }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Thao tác thất bại");
    toast.success(json.message || "Đã cập nhật trạng thái");
    await loadPayments();
  }

  // Mở màn Lệnh chi. Đã có lệnh chi → deep-link xem lệnh đó; chưa có → mở form
  // tạo lệnh điền sẵn (số tiền/người nhận/STK/danh mục) để kế toán duyệt & sửa
  // trước khi gửi. subPaymentId để lệnh chi gắn ngược lại đợt thanh toán.
  function goToExpense(p: SubPayment) {
    if (!contract) return;
    if (p.linkedExpense) {
      router.push(`/expenses?id=${p.linkedExpense.id}`);
      return;
    }
    const sub = contract.subcontractor;
    const note = `Thanh toán HĐ thầu phụ ${contract.code} · Đợt ${p.stage}${p.description ? ` — ${p.description}` : ""}`;
    const remaining = payRemaining(p);
    const q = new URLSearchParams({
      create: "1",
      subPaymentId: p.id,
      // Fill sẵn phần CÒN LẠI (dự kiến − đã tạm ứng); đợt mới thì = dự kiến.
      amount: remaining > 0 ? String(Math.round(remaining)) : p.expectedAmount ? String(p.expectedAmount) : "",
      method: "transfer",
      categoryName: "Thầu phụ",
      payee: sub.name || "",
      note,
    });
    if (contract.project?.id) q.set("projectId", contract.project.id);
    if (sub.phone) q.set("payeePhone", sub.phone);
    if (sub.bankAccount) q.set("payeeAccountNumber", sub.bankAccount);
    if (sub.bankAccountName || sub.name) q.set("payeeAccountName", sub.bankAccountName || sub.name);
    router.push(`/expenses?${q.toString()}`);
  }

  async function removePayment(paymentId: string) {
    if (!(await confirmDialog("Xóa/Hủy đợt thanh toán này?"))) return;
    const res = await fetch(`/api/sub-payments/${paymentId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Không thể xóa/hủy đợt");
    toast.success(json.message || "Đã xử lý đợt thanh toán");
    await loadPayments();
  }

  function openMarkSheet(p: SubPayment) {
    setOpenMarkPaid(p.id);
    // Mặc định chi phần còn lại của đợt (đã trừ tạm ứng trước).
    const remaining = payRemaining(p);
    setActualAmount(remaining > 0 ? String(Math.round(remaining)) : p.expectedAmount ? String(p.expectedAmount) : "");
    setActualDate(todayStr());
    setPaymentMethod("chuyển khoản");
    setPayNote("");
    setReceiptUrl(p.receiptUrl || "");
    setPayAccountId("");
    requestAnimationFrame(() => setMarkShow(true));
  }
  function closeMarkSheet() {
    setMarkShow(false);
    setTimeout(() => setOpenMarkPaid(null), 240);
  }
  async function uploadReceipt(paymentId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    formData.append("receipt", files[0]);
    setReceiptUploading(true);
    const res = await fetch(`/api/sub-payments/${paymentId}/receipt`, { method: "POST", body: formData });
    const json = await res.json().catch(() => ({}));
    setReceiptUploading(false);
    if (!res.ok) return toast.error(json.message || "Upload phiếu chi thất bại");
    setReceiptUrl(json.receiptUrl || "");
    toast.success("Đã upload phiếu chi");
  }
  async function submitMarkPaid() {
    if (!openMarkPaid) return;
    if (!payAccountId) return toast.error("Chọn tài khoản chi");
    setMarkPaidLoading(true);
    const res = await fetch(`/api/sub-payments/${openMarkPaid}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actualAmount: Number(actualAmount || 0),
        actualPaidDate: actualDate,
        receiptUrl,
        paymentMethod,
        note: payNote || null,
        accountId: payAccountId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setMarkPaidLoading(false);
    if (!res.ok) return toast.error(json.message || "Mark paid thất bại");
    if (json.warning) toast.warning(json.warning);
    toast.success(json.message || "Đã ghi đã chi");
    closeMarkSheet();
    await loadPayments();
    onChanged?.();
  }

  // evaluation
  function calcWeighted(scores: Record<string, number>) {
    if (!evalCriteria.length) return 0;
    let sum = 0;
    let total = 0;
    for (const c of evalCriteria) {
      const s = Number(scores[c.id] || 0);
      if (!s) continue;
      const w = Number(c.weight || 0);
      if (!w) continue;
      sum += s * w;
      total += w;
    }
    return total ? Math.round((sum / total) * 100) / 100 : 0;
  }
  async function submitEvaluation() {
    const missing = evalCriteria.find((c) => !evalScores[c.id]);
    if (missing) return toast.error(`Thiếu điểm cho tiêu chí: ${missing.name}`);
    setEvalSubmitting(true);
    const res = await fetch(`/api/sub-contracts/${contractId}/evaluations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scores: evalCriteria.map((c) => ({ criterionId: c.id, score: Number(evalScores[c.id]) })),
        comment: evalComment || null,
        willHireAgain: evalWillHire,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setEvalSubmitting(false);
    if (!res.ok) return toast.error(json.message || "Không gửi được đánh giá");
    toast.success(json.message || "Đã gửi đánh giá");
    await loadEvaluations();
  }
  async function deleteEvaluation(item: SubEvaluation) {
    if (!(await confirmDialog("Xóa đánh giá này?"))) return;
    const res = await fetch(`/api/sub-evaluations/${item.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.message || "Không xóa được đánh giá");
    toast.success(json.message || "Đã xóa đánh giá");
    await loadEvaluations();
  }

  const tabs: Array<[TabValue, string]> = [
    ["info", "Thông tin"],
    ["payment", "Thanh toán"],
    ["task", "Công tác"],
    ["evaluation", "Đánh giá"],
    ["file", "Tài liệu"],
  ];

  if (!mounted) return null;
  return createPortal(
    <div className={`cndoc cnportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
    <div className={`subpop-scrim${show ? " show" : ""}`} onClick={close}>
      <div className="subpop" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* topbar */}
        <div className="subtop">
          <div className="brand">
            <div className="mark">H6</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Hợp đồng thầu phụ</span>
            </div>
          </div>
          <button type="button" className="xclose" onClick={close} aria-label="Đóng">✕</button>
        </div>

        <div className="subbody">
          {loading ? (
            <div className="load">Đang tải hợp đồng…</div>
          ) : !contract ? (
            <div className="empty">Không tìm thấy hợp đồng.</div>
          ) : (
            <>
              <div className="eyebrow">{contract.project.code} · {contract.project.name}</div>
              <h1>{contract.title}</h1>
              <div className="hchips">
                <span className="chip code">{contract.code}</span>
                <span className={`chip ${contract.status === "active" ? "debt" : contract.status === "completed" ? "paidoff" : contract.status === "draft" ? "await" : ""}`}>
                  {subContractStatusLabel(contract.status)}
                </span>
                <span className="chip code">{subContractUnitLabel(contract.unit as never)}</span>
              </div>

              {/* summary 3 số */}
              <div className="sum">
                <div className="c">
                  <div className="k">Giá trị HĐ</div>
                  <div className="v t num">{fmt(contractValue)}</div>
                  <div className="sp">{subContractUnitLabel(contract.unit as never)}</div>
                </div>
                <div className="c">
                  <div className="k">Đã chi</div>
                  <div className="v o num">{canFin ? fmt(paidTotal) : "—"}</div>
                  <div className="sp">{payments.filter((p) => p.status === "paid").length} đợt đã chi</div>
                </div>
                <div className="c">
                  <div className="k">Còn lại</div>
                  <div className="v r num">{canFin ? fmt(remain) : "—"}</div>
                  <div className="sp">chưa chi</div>
                </div>
              </div>

              {/* progress */}
              {canFin && contractValue > 0 && (
                <div className="prog">
                  <div className="pl"><span>Tiến độ thanh toán</span><span>{progress}%</span></div>
                  <div className="bar"><div className="fill" style={{ width: `${progress}%` }} /></div>
                </div>
              )}

              {/* action HĐ */}
              {canWrite && (contract.canActivate || contract.canComplete || contract.canCancel) && (
                <div className="subacts">
                  {contract.canActivate && <button type="button" className="btn ghost" onClick={() => contractAction("activate")}>Kích hoạt</button>}
                  {contract.canComplete && <button type="button" className="btn ghost" onClick={() => contractAction("complete")}>Hoàn thành</button>}
                  {contract.canCancel && <button type="button" className="btn ghost danger" onClick={cancelContract}>Hủy HĐ</button>}
                </div>
              )}

              {/* tabs */}
              <div className="subtabs" role="tablist">
                {tabs.map(([v, lbl]) => (
                  <button key={v} type="button" role="tab" className={`subtab${tab === v ? " on" : ""}`} onClick={() => setTab(v)}>
                    {lbl}
                  </button>
                ))}
              </div>

              {/* ── TAB Thông tin ── */}
              {tab === "info" && (
                <>
                  <div className="seclabel">Thông tin hợp đồng</div>
                  <div className="info">
                    <div className="irow"><span className="ik">Thầu phụ</span><span className="iv">{contract.subcontractor.code} · {contract.subcontractor.name}</span></div>
                    {contract.subcontractor.phone && (
                      <div className="irow"><span className="ik">Điện thoại</span><a className="iv" href={`tel:${contract.subcontractor.phone}`} style={{ color: "var(--orange)" }}>{contract.subcontractor.phone}</a></div>
                    )}
                    {contract.subcontractor.bankAccount && (
                      <div className="irow"><span className="ik">Ngân hàng</span><span className="iv">{contract.subcontractor.bankName || ""} {contract.subcontractor.bankAccount}</span></div>
                    )}
                    <div className="irow"><span className="ik">Đơn vị tính</span><span className="iv">{subContractUnitLabel(contract.unit as never)}</span></div>
                    {contract.unitPrice != null && <div className="irow"><span className="ik">Đơn giá</span><span className="iv num">{formatMoney(contract.unitPrice)}</span></div>}
                    {contract.quantity != null && <div className="irow"><span className="ik">Khối lượng</span><span className="iv num">{contract.quantity}</span></div>}
                    <div className="irow"><span className="ik">Giá trị hợp đồng</span><span className="iv num">{fmt(contractValue)} đ</span></div>
                    <div className="irow"><span className="ik">Ngày bắt đầu</span><span className="iv num">{formatDate(contract.startDate)}</span></div>
                    <div className="irow"><span className="ik">Kết thúc dự kiến</span><span className="iv num">{formatDate(contract.expectedEndDate)}</span></div>
                    {contract.actualEndDate && <div className="irow"><span className="ik">Kết thúc thực tế</span><span className="iv num">{formatDate(contract.actualEndDate)}</span></div>}
                    <div className="irow"><span className="ik">Tạo bởi</span><span className="iv">{contract.creator.fullName}</span></div>
                  </div>

                  {contract.scopeOfWork && (
                    <>
                      <div className="seclabel">Phạm vi công việc</div>
                      <div className="proseblk">{contract.scopeOfWork}</div>
                    </>
                  )}
                  {contract.notes && (
                    <>
                      <div className="seclabel">Ghi chú</div>
                      <div className="proseblk">{contract.notes}</div>
                    </>
                  )}
                </>
              )}

              {/* ── TAB Thanh toán ── */}
              {tab === "payment" && (
                <>
                  <div className="seclabel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Lịch thanh toán{payments.length ? ` · ${payments.length} đợt` : ""}</span>
                    {paymentMeta?.capabilities.canCreate && canFin && !showDraft && (
                      <button type="button" className="btn" style={{ padding: "8px 14px", fontSize: 13 }} onClick={openDraft}>＋ Lịch mới</button>
                    )}
                  </div>

                  {!canFin && <div className="proseblk" style={{ color: "var(--mut)" }}>Bạn không có quyền xem số tiền chi tiết.</div>}

                  {/* form tạo lịch nháp */}
                  {showDraft && canFin && (
                    <div className="draftbox">
                      {draftRows.map((row, idx) => (
                        <div key={row.id} className="draftrow">
                          <div className="drhead">
                            <span>Đợt {idx + 1}</span>
                            <button type="button" className="linkbtn" onClick={() => setDraftRows((p) => p.filter((x) => x.id !== row.id))}>Xóa</button>
                          </div>
                          <div className="fld"><input placeholder="Mô tả đợt" value={row.description} onChange={(e) => patchDraft(row.id, { description: e.target.value })} /></div>
                          <div className="row2">
                            <div className="fld"><input type="date" value={row.expectedDate} onChange={(e) => patchDraft(row.id, { expectedDate: e.target.value })} /></div>
                            <div className="fld">
                              <select value={row.mode} onChange={(e) => patchDraft(row.id, { mode: e.target.value as "percent" | "amount" })}>
                                <option value="percent">Nhập theo %</option>
                                <option value="amount">Nhập số tiền</option>
                              </select>
                            </div>
                          </div>
                          {row.mode === "percent" ? (
                            <div className="row2">
                              <div className="fld"><input className="mono" type="number" placeholder="%" value={row.percentage} onChange={(e) => {
                                const pc = e.target.value; const n = Number(pc || 0);
                                patchDraft(row.id, { percentage: pc, expectedAmount: Number.isFinite(n) ? String(Math.round((n / 100) * contractValue)) : "" });
                              }} /></div>
                              <div className="fld"><input className="mono" value={row.expectedAmount ? fmt(Number(row.expectedAmount)) : ""} disabled /></div>
                            </div>
                          ) : (
                            <div className="row2">
                              <div className="fld"><input className="mono" type="number" placeholder="Số tiền" value={row.expectedAmount} onChange={(e) => {
                                const am = e.target.value; const n = Number(am || 0);
                                patchDraft(row.id, { expectedAmount: am, percentage: Number.isFinite(n) && contractValue > 0 ? ((n / contractValue) * 100).toFixed(2) : "" });
                              }} /></div>
                              <div className="fld"><input className="mono" value={row.percentage ? `${row.percentage}%` : ""} disabled /></div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="drtot">Tổng % lịch: {totalDraftPercent.toFixed(2)}%{totalDraftPercent < 100 ? " · chưa đạt 100% (vẫn cho phép)" : ""}</div>
                      <div className="sactions">
                        <button type="button" className="btn ghost" onClick={() => { if (draftRows.length >= 10) return; setDraftRows((p) => [...p, { id: crypto.randomUUID(), description: `Đợt ${p.length + 1}`, expectedDate: todayStr(), linkedTaskId: "", mode: "percent", percentage: "", expectedAmount: "" }]); }}>＋ Thêm đợt</button>
                        <button type="button" className="btn ghost" onClick={() => { setShowDraft(false); setDraftRows([]); }}>Hủy</button>
                        <button type="button" className="btn" onClick={saveDraft} disabled={savingDraft || draftRows.length === 0}>{savingDraft ? "Đang lưu…" : "Lưu lịch"}</button>
                      </div>
                    </div>
                  )}

                  {/* danh sách đợt */}
                  {payments.length === 0 && !showDraft ? (
                    <div className="empty"><div className="ic">💸</div>Chưa có đợt thanh toán.</div>
                  ) : (
                    payments.map((p) => (
                      <div key={p.id} className="paycard">
                        <div className="ph">
                          <div>
                            <div className="pe">Đợt {p.stageLabel ?? p.stage} · {p.code}</div>
                            <div className="pn">{p.description}</div>
                            <div className="psub">Dự kiến {formatDate(p.expectedDate)}{canFin && p.percentage != null ? ` · ${p.percentage}%` : ""}</div>
                          </div>
                          <span className={`chip ${isAdvancing(p) ? "await" : payChip(p.status)}`}>
                            {isAdvancing(p) ? "Tạm ứng" : payLabel(p.status)}
                          </span>
                        </div>
                        {canFin && (
                          <div className="pvline">
                            <div className="pv num">{fmt(p.expectedAmount || 0)} đ</div>
                            {p.status === "paid" && (
                              <div className="paidnote">✓ Đã chi {fmt(p.actualAmount || 0)} · {formatDate(p.actualPaidDate)}</div>
                            )}
                            {isAdvancing(p) && (
                              <div className="paidnote">↺ Đã tạm ứng {fmt(p.actualAmount || 0)} · còn {fmt(payRemaining(p))} đ</div>
                            )}
                          </div>
                        )}
                        {/* Trạng thái lệnh chi đang gắn với đợt */}
                        {p.linkedExpense && p.status !== "paid" && (
                          <div className="lc-status">
                            🧾 {p.linkedExpense.status === "tptc_pending"
                              ? "Lệnh chi chờ admin duyệt"
                              : p.linkedExpense.status === "pending"
                                ? "Đã duyệt · chờ kế toán chi"
                                : "Lệnh chi đang xử lý"}
                            <span className="lc-code"> · {p.linkedExpense.code}</span>
                          </div>
                        )}
                        <div className="prow-acts">
                          {/* Lệnh chi: KT/admin, mọi đợt chưa chi (kể cả đã có lệnh — mở để xem/sửa) */}
                          {(currentRole === "admin" || currentRole === "accountant") && p.status !== "paid" && p.status !== "cancelled" && (
                            <button type="button" className="linkbtn lenhchi" onClick={() => goToExpense(p)}>
                              🧾 {p.linkedExpense ? "Xem lệnh chi" : "Lập lệnh chi"}
                            </button>
                          )}
                          {/* Xóa/Hủy đợt: chỉ khi chưa có lệnh chi & chưa chi */}
                          {(currentRole === "admin" || currentRole === "construction_manager") && !p.linkedExpense && p.status !== "paid" && p.status !== "cancelled" && (
                            <button type="button" className="linkbtn danger" onClick={() => removePayment(p.id)}>Xóa/Hủy</button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* ── TAB Công tác ── */}
              {tab === "task" && (
                <>
                  <div className="seclabel">Công tác liên kết</div>
                  {contract.linkedTasks.length === 0 ? (
                    <div className="empty"><div className="ic">🧱</div>Chưa liên kết công tác.</div>
                  ) : (
                    contract.linkedTasks.map((t) => (
                      <div key={t.id} className="tcard">
                        <div className="tn">{t.code} · {t.name}</div>
                        <div className="tsub">{t.phase} · {t.status}</div>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* ── TAB Đánh giá ── */}
              {tab === "evaluation" && (
                <>
                  {canCreateEval && !evaluations.some((x) => x.evaluatorId === currentUserId) && evalCriteria.length > 0 && (
                    <>
                      <div className="seclabel">Đánh giá thầu phụ</div>
                      <div className="evalbox">
                        {evalCriteria.map((c) => (
                          <div key={c.id} className="evrow">
                            <div className="evk"><span>{c.name}</span><span className="evw">w={c.weight}</span></div>
                            <div className="stars">
                              {[1, 2, 3, 4, 5].map((v) => (
                                <button key={v} type="button" className={`star${(evalScores[c.id] || 0) >= v ? " on" : ""}`} onClick={() => setEvalScores((p) => ({ ...p, [c.id]: v }))}>★</button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="drtot">Điểm trung bình có trọng số: <b>{calcWeighted(evalScores).toFixed(2)}/5</b></div>
                        <div className="fld"><textarea rows={3} placeholder="Nhận xét…" value={evalComment} onChange={(e) => setEvalComment(e.target.value)} /></div>
                        <label className="chkline"><input type="checkbox" checked={evalWillHire} onChange={(e) => setEvalWillHire(e.target.checked)} />Sẽ tiếp tục thuê thầu phụ này</label>
                        <div className="sactions">
                          <button type="button" className="btn" onClick={submitEvaluation} disabled={evalSubmitting}>{evalSubmitting ? "Đang gửi…" : "Gửi đánh giá"}</button>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="seclabel">Đánh giá đã có</div>
                  {evaluations.length === 0 ? (
                    <div className="empty"><div className="ic">⭐</div>Chưa có đánh giá nào.</div>
                  ) : (
                    evaluations.map((item) => (
                      <div key={item.id} className="evalcard">
                        <div className="ph">
                          <div>
                            <div className="pn">{item.evaluator.fullName} · {item.evaluator.role}</div>
                            <div className="psub">{formatDate(item.createdAt)}</div>
                          </div>
                          <span className="chip debt">{item.overallRating.toFixed(2)}/5</span>
                        </div>
                        <div className="evscores">
                          {item.scores.map((s) => (
                            <span key={s.id} className="evscore">{s.criterion.name}: <b>{s.score}/5</b></span>
                          ))}
                        </div>
                        {item.comment && <div className="proseblk" style={{ marginTop: 8 }}>{item.comment}</div>}
                        <div className="psub" style={{ marginTop: 6 }}>Thuê lại: {item.willHireAgain ? "Có" : "Không"}</div>
                        {(item.evaluatorId === currentUserId || canDeleteAnyEval) && (
                          <div className="prow-acts">
                            <button type="button" className="linkbtn danger" onClick={() => deleteEvaluation(item)}>Xóa</button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}

              {/* ── TAB Tài liệu ── */}
              {tab === "file" && (
                <>
                  <div className="seclabel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Tài liệu{contract.files.length ? ` · ${contract.files.length}` : ""}</span>
                    {contract.canManageFiles && (
                      <label className="btn" style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
                        {uploading ? "Đang tải…" : "⭱ Tải lên"}
                        <input type="file" multiple className="hidden-in" onChange={(e) => uploadFiles(e.target.files)} disabled={uploading} />
                      </label>
                    )}
                  </div>
                  {contract.files.length === 0 ? (
                    <div className="empty"><div className="ic">📎</div>Chưa có tài liệu.</div>
                  ) : (
                    contract.files.map((f) => (
                      <div key={f.id} className="tcard" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a className="tn" href={f.fileUrl} target="_blank" rel="noreferrer" style={{ color: "var(--terra)", textDecoration: "underline" }}>{f.fileName}</a>
                          <div className="tsub">{f.fileType} · {formatDate(f.uploadedAt)} · {f.uploader.fullName}</div>
                        </div>
                        {contract.canManageFiles && <button type="button" className="linkbtn danger" onClick={() => deleteFile(f.id)}>Xóa</button>}
                      </div>
                    ))
                  )}
                </>
              )}

              <div className="foot">Hợp đồng thầu phụ · Đúng — Đẹp — Bền</div>
            </>
          )}
        </div>
      </div>

      {/* sheet Ghi đã chi */}
      {openMarkPaid && (
        <>
          <div className={`scrim${markShow ? " show" : ""}`} onClick={closeMarkSheet} />
          <div className={`sheet${markShow ? " show" : ""}`} role="dialog" aria-modal="true">
            <div className="grip" />
            <div className="shead">
              <div>
                <div className="se">Thanh toán thầu phụ</div>
                <div className="st">Ghi đã chi</div>
              </div>
              <button type="button" className="xclose" onClick={closeMarkSheet} aria-label="Đóng">✕</button>
            </div>
            <div className="sbody">
              <div className="fld"><label>Số tiền thực chi</label><input className="mono" type="number" value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} /></div>
              <div className="row2">
                <div className="fld"><label>Ngày chi</label><input type="date" value={actualDate} onChange={(e) => setActualDate(e.target.value)} /></div>
                <div className="fld"><label>Phương thức</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="chuyển khoản">Chuyển khoản</option>
                    <option value="tiền mặt">Tiền mặt</option>
                  </select>
                </div>
              </div>
              <div className="fld"><label>Tài khoản chi *</label>
                <select value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)}>
                  <option value="">— Chọn tài khoản —</option>
                  {cashAccounts.map((a) => (<option key={a.id} value={a.id}>{formatCashAccountLabel(a)}</option>))}
                </select>
              </div>
              <div className="fld"><label>Phiếu chi (bắt buộc)</label>
                <label className="btn ghost" style={{ display: "inline-flex", cursor: "pointer" }}>
                  {receiptUploading ? "Đang upload…" : "Chọn ảnh phiếu chi"}
                  <input type="file" accept="image/*" className="hidden-in" onChange={(e) => uploadReceipt(openMarkPaid, e.target.files)} />
                </label>
                {receiptUrl && <div style={{ marginTop: 6, fontSize: 12, color: "var(--ok)", fontWeight: 600 }}>Đã có chứng từ — sẽ lưu khi xác nhận.</div>}
              </div>
              <div className="fld"><label>Ghi chú</label><textarea rows={2} value={payNote} onChange={(e) => setPayNote(e.target.value)} /></div>
              <div className="sactions">
                <button type="button" className="btn ghost" onClick={closeMarkSheet}>Hủy</button>
                <button type="button" className="btn" onClick={submitMarkPaid} disabled={markPaidLoading || !receiptUrl}>{markPaidLoading ? "Đang xử lý…" : "Xác nhận đã chi"}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </div>,
    document.body,
  );
}
