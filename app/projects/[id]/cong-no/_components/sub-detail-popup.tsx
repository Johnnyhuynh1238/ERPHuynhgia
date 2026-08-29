"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { plexSans, plexMono } from "@/lib/fonts";
import { SubContractStatus, SubPaymentStatus } from "@prisma/client";
import { toast } from "sonner";
import {
  formatDate,
  formatMoney,
  subContractStatusLabel,
  subContractUnitLabel,
} from "@/lib/sub-contract-view";
import { useCashAccounts, formatCashAccountLabel } from "@/lib/use-cash-accounts";


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

type PaymentHistoryRow = {
  id: string;
  code: string;
  amount: number;
  paidAmount: number | null;
  status: string;
  paidAt: string | null;
  createdAt: string;
  note: string | null;
};

type PaymentMeta = {
  contract: { id: string; status: string; contractValue: number | null; canViewFinancial: boolean };
  linkedTasks: Array<{ id: string; code: string; name: string; status: string }>;
  totals: { percentTotal: number | null; paidTotal: number | null };
  pendingPayment: { id: string; code: string; status: string; amount: number } | null;
  paymentHistory: PaymentHistoryRow[];
  capabilities: { canCreate: boolean; canRequest: boolean; canApprove: boolean; canMarkPaid: boolean; canPay: boolean };
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

  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("payment");
  const [contract, setContract] = useState<ContractDetail | null>(null);

  const [payments, setPayments] = useState<SubPayment[]>([]);
  const [paymentMeta, setPaymentMeta] = useState<PaymentMeta | null>(null);
  const [uploading, setUploading] = useState(false);

  // Tab Thanh toán chia 2 menu ngang: lệnh chi thật | lịch đợt (tham khảo).
  const [payView, setPayView] = useState<"expenses" | "schedule">("expenses");
  const [linkBusy, setLinkBusy] = useState(false);

  // Chi chung cấp hợp đồng (mô hình như trả nợ NCC) — 1 nút Chi, nhập số tiền.
  const [openPay, setOpenPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote2, setPayNote2] = useState("");
  const [payLoading, setPayLoading] = useState(false);

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
      pendingPayment: json.pendingPayment ?? null,
      paymentHistory: json.paymentHistory || [],
      capabilities: json.capabilities,
    });
  }, [contractId]);

  // Link công khai CHỐT CÔNG NỢ của thầu phụ (gom mọi dự án) — gửi cho họ đối chiếu.
  async function copyDoiTacLink() {
    if (!contract) return;
    setLinkBusy(true);
    try {
      const r = await fetch("/api/partner-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "subcontractor", id: contract.subcontractor.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast.error(j.message || "Không tạo được link");
      const url = `${window.location.origin}${j.path}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Đã copy link đối chiếu công nợ");
      } catch {
        prompt("Link đối chiếu công nợ (copy thủ công):", url);
      }
    } finally {
      setLinkBusy(false);
    }
  }

  // Chi chung cấp hợp đồng: nhập số tiền → tạo lệnh chi (chờ duyệt/chi).
  // Khi lệnh chi được chi, đợt tự tính lại theo tổng đã trả cộng dồn.
  async function submitContractPay() {
    const amount = Math.round(Number(payAmount || 0));
    if (!(amount > 0)) return toast.error("Nhập số tiền chi hợp lệ");
    setPayLoading(true);
    const res = await fetch(`/api/sub-contracts/${contractId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, note: payNote2.trim() || null }),
    });
    const json = await res.json().catch(() => ({}));
    setPayLoading(false);
    if (!res.ok) return toast.error(json.message || "Không tạo được lệnh chi");
    if (json.willExceed) toast.warning("Lưu ý: tổng đã trả vượt giá trị hợp đồng");
    toast.success(json.message || "Đã gửi lệnh chi");
    setOpenPay(false);
    setPayAmount("");
    setPayNote2("");
    await loadPayments();
  }

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
  const isCancelled = contract?.status === "cancelled";
  // HĐ đã huỷ: các đợt chưa chi đã bị đóng → không còn nợ phần chưa làm.
  const remain = isCancelled ? 0 : contractValue - paidTotal;
  // Tổng tiền các đợt (bỏ đợt huỷ) để đối chiếu giá trị HĐ. Đổi giá trị HĐ không
  // tự nắn đợt — chỉ cảnh báo để KT/QLDA tự sửa hoặc thêm đợt cho khớp.
  const scheduleExpectedTotal = payments
    .filter((p) => p.status !== SubPaymentStatus.cancelled)
    .reduce((sum, p) => sum + Number(p.expectedAmount || 0), 0);
  const scheduleGap = contractValue - scheduleExpectedTotal;
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

              {/* cảnh báo lệch giữa tổng đợt và giá trị HĐ (không áp dụng khi HĐ đã huỷ) */}
              {canFin && !isCancelled && payments.length > 0 && Math.abs(scheduleGap) >= 1 && (
                <div className="schwarn">
                  ⚠️ Tổng các đợt ({fmt(scheduleExpectedTotal)} đ) {scheduleGap < 0 ? "vượt" : "thiếu"}{" "}
                  <b>{fmt(Math.abs(scheduleGap))} đ</b> so với giá trị HĐ ({fmt(contractValue)} đ).
                  Sửa số tiền một đợt hoặc thêm đợt cho khớp — hệ thống không tự đổi đợt đã lập.
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
                  {/* Chi chung cấp hợp đồng — đợt bên dưới chỉ để tham khảo. */}
                  {canFin && (currentRole === "admin" || currentRole === "accountant") && !isCancelled && (
                    <div className="seclabel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>Đã trả {fmt(paidTotal)} · Còn {fmt(Math.max(0, remain))}</span>
                      <span style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: "8px 12px", fontSize: 13 }}
                          onClick={copyDoiTacLink}
                          disabled={linkBusy}
                          title="Link công khai để thầu phụ đối chiếu, chốt công nợ"
                        >
                          {linkBusy ? "…" : "🔗 Link chốt"}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "8px 14px", fontSize: 13 }}
                          onClick={() => {
                            setPayAmount("");
                            setPayNote2("");
                            setOpenPay(true);
                          }}
                        >
                          Chi
                        </button>
                      </span>
                    </div>
                  )}

                  {/* menu ngang: Lệnh chi (thật) | Lịch thanh toán (tham khảo) */}
                  {canFin && (
                    <div className="cntabs" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        className={`cntab${payView === "expenses" ? " on" : ""}`}
                        onClick={() => setPayView("expenses")}
                      >
                        Lệnh chi{paymentMeta?.paymentHistory.length ? ` (${paymentMeta.paymentHistory.length})` : ""}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={`cntab${payView === "schedule" ? " on" : ""}`}
                        onClick={() => setPayView("schedule")}
                      >
                        Lịch thanh toán{payments.length ? ` (${payments.length})` : ""}
                      </button>
                    </div>
                  )}

                  {/* Lệnh chi thật của hợp đồng (khớp sổ quỹ) */}
                  {canFin && payView === "expenses" && (
                    <>
                      {paymentMeta?.pendingPayment && (
                        <div className="proseblk" style={{ color: "var(--orange)" }}>
                          Đang có lệnh chi {paymentMeta.pendingPayment.code} ({fmt(paymentMeta.pendingPayment.amount)}) chờ duyệt/chi — xong mới gửi tiếp.
                        </div>
                      )}
                      {!paymentMeta?.paymentHistory.length ? (
                        <div className="empty"><div className="ic">🧾</div>Chưa có lệnh chi nào.</div>
                      ) : (
                        <div className="nlist">
                          {paymentMeta.paymentHistory.map((h) => {
                            const isPaid = h.status === "paid";
                            return (
                              <div key={h.id} className="nccrow" style={{ cursor: "default" }}>
                                <div className="nl">
                                  <div className="nn">{h.code}</div>
                                  <div className="nsub">
                                    <span>{formatDate(isPaid ? h.paidAt : h.createdAt)}</span>
                                    {h.note && <span>· {h.note}</span>}
                                  </div>
                                </div>
                                <div className="nr">
                                  <div className="rv num" style={{ color: isPaid ? "var(--ok)" : "var(--red)" }}>
                                    {fmt(isPaid ? (h.paidAmount ?? h.amount) : h.amount)}
                                  </div>
                                  <div className="rk">
                                    <span className={`chip ${isPaid ? "paidoff" : "await"}`}>{isPaid ? "Đã chi" : "Chờ chi"}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {(!canFin || payView === "schedule") && (
                  <>
                  <div className="seclabel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Đợt theo hợp đồng (tham khảo)</span>
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
                        {/* Đợt chỉ còn là THAM KHẢO (chia sẵn theo HĐ) — chi chung cấp hợp đồng,
                            trạng thái đợt tự tính theo tổng đã trả cộng dồn. Không còn nút per-đợt. */}
                      </div>
                    ))
                  )}
                  </>
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

      {/* sheet Chi chung cấp hợp đồng */}
      {openPay && (
        <>
          <div className="scrim show" onClick={() => setOpenPay(false)} />
          <div className="sheet show" role="dialog" aria-modal="true">
            <div className="grip" />
            <div className="shead">
              <div>
                <div className="se">Thanh toán thầu phụ</div>
                <div className="st">Chi cho hợp đồng</div>
              </div>
              <button type="button" className="xclose" onClick={() => setOpenPay(false)} aria-label="Đóng">✕</button>
            </div>
            <div className="sbody">
              <div className="fld">
                <label>Số tiền chi</label>
                <input className="mono" type="number" inputMode="numeric" autoFocus placeholder="VD: 20000000"
                  value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
              {Number(payAmount) > 0 && (
                <div className="proseblk" style={{ color: "var(--mut)" }}>{fmt(Math.round(Number(payAmount)))} đ</div>
              )}
              <div className="fld">
                <label>Ghi chú (tùy chọn)</label>
                <input placeholder="VD: đợt tuần này" value={payNote2} onChange={(e) => setPayNote2(e.target.value)} />
              </div>
              <div className="proseblk" style={{ color: "var(--mut)" }}>
                Tạo lệnh chi chờ duyệt/chi. Các đợt theo HĐ tự cập nhật khi tiền chi cộng dồn đủ.
              </div>
              <button type="button" className="btn" disabled={payLoading || !(Number(payAmount) > 0)} onClick={submitContractPay}>
                {payLoading ? "Đang gửi…" : "Gửi lệnh chi"}
              </button>
            </div>
          </div>
        </>
      )}

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
