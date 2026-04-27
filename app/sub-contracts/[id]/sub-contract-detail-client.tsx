"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, GripVertical, Upload } from "lucide-react";
import { SubContractStatus, SubPaymentStatus } from "@prisma/client";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatDate,
  formatMoney,
  subContractStatusClass,
  subContractStatusLabel,
  subContractUnitLabel,
} from "@/lib/sub-contract-view";

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
    altPhone: string | null;
    email: string | null;
    address: string | null;
    bankName: string | null;
    bankAccount: string | null;
    bankAccountName: string | null;
    status: string;
  };
  creator: { id: string; fullName: string };
  linkedTasks: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    phase: string;
    plannedStartDate: string;
    plannedEndDate: string;
  }>;
  files: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string;
    uploadedAt: string;
    uploader: { id: string; fullName: string };
  }>;
  paymentCount: number;
  evaluationCount: number;
  fileCount: number;
  taskCount: number;
  canEdit: boolean;
  canManageFiles: boolean;
  canActivate: boolean;
  canComplete: boolean;
  canCancel: boolean;
};

type SubPayment = {
  id: string;
  code: string;
  subContractId: string;
  stage: number;
  description: string;
  linkedTaskId: string | null;
  linkedTask: { id: string; code: string; name: string; status: string } | null;
  expectedAmount: number | null;
  expectedDate: string;
  percentage: number | null;
  actualAmount: number | null;
  actualPaidDate: string | null;
  status: SubPaymentStatus;
  requestNote: string | null;
  approveNote: string | null;
  payNote: string | null;
  receiptUrl: string | null;
  requester: { id: string; fullName: string } | null;
  approver: { id: string; fullName: string } | null;
  payer: { id: string; fullName: string } | null;
  requestedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
};

type PaymentMeta = {
  contract: { id: string; status: string; contractValue: number | null; canViewFinancial: boolean };
  linkedTasks: Array<{ id: string; code: string; name: string; status: string }>;
  totals: { percentTotal: number | null; paidTotal: number | null };
  capabilities: { canCreate: boolean; canRequest: boolean; canApprove: boolean; canMarkPaid: boolean };
};

type DraftPaymentRow = {
  id: string;
  stage: number;
  description: string;
  expectedDate: string;
  linkedTaskId: string;
  mode: "percent" | "amount";
  percentage: string;
  expectedAmount: string;
};

type TabValue = "info" | "task" | "payment" | "evaluation" | "file";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function statusPill(status: SubPaymentStatus) {
  if (status === SubPaymentStatus.pending) return "bg-zinc-500/15 text-zinc-300";
  if (status === SubPaymentStatus.requested) return "bg-blue-500/15 text-blue-300";
  if (status === SubPaymentStatus.approved) return "bg-yellow-500/15 text-yellow-300";
  if (status === SubPaymentStatus.paid) return "bg-emerald-500/15 text-emerald-300";
  return "bg-red-500/15 text-red-300";
}

function statusLabel(status: SubPaymentStatus) {
  if (status === SubPaymentStatus.pending) return "Pending";
  if (status === SubPaymentStatus.requested) return "Đã đề xuất";
  if (status === SubPaymentStatus.approved) return "Đã duyệt";
  if (status === SubPaymentStatus.paid) return "Đã chi";
  return "Đã hủy";
}

function PaymentDraftCard({
  row,
  contractValue,
  onChange,
  onDelete,
  linkedTasks,
}: {
  row: DraftPaymentRow;
  contractValue: number;
  onChange: (id: string, patch: Partial<DraftPaymentRow>) => void;
  onDelete: (id: string) => void;
  linkedTasks: Array<{ id: string; code: string; name: string }>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs text-[#a4acc8]">Đợt {row.stage}</div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border border-[#2d3249] p-1 text-[#8892b0]" {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4" />
          </button>
          <Button size="xs" variant="destructive" onClick={() => onDelete(row.id)}>Xóa</Button>
        </div>
      </div>

      <div className="space-y-2">
        <input
          className="w-full rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
          placeholder="Mô tả đợt thanh toán"
          value={row.description}
          onChange={(e) => onChange(row.id, { description: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            className="w-full rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
            value={row.expectedDate}
            onChange={(e) => onChange(row.id, { expectedDate: e.target.value })}
          />

          <select
            className="w-full rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
            value={row.mode}
            onChange={(e) => onChange(row.id, { mode: e.target.value as "percent" | "amount" })}
          >
            <option value="percent">Nhập theo %</option>
            <option value="amount">Nhập theo số tiền</option>
          </select>
        </div>

        {row.mode === "percent" ? (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
              value={row.percentage}
              onChange={(e) => {
                const percent = e.target.value;
                const n = Number(percent || 0);
                const amount = Number.isFinite(n) ? ((n / 100) * contractValue).toFixed(2) : "";
                onChange(row.id, { percentage: percent, expectedAmount: amount });
              }}
              placeholder="%"
            />
            <input
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1118] px-3 py-2 text-sm text-[#8892b0]"
              value={row.expectedAmount}
              disabled
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              step="1000"
              className="w-full rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
              value={row.expectedAmount}
              onChange={(e) => {
                const amount = e.target.value;
                const n = Number(amount || 0);
                const percent = Number.isFinite(n) && contractValue > 0 ? ((n / contractValue) * 100).toFixed(2) : "";
                onChange(row.id, { expectedAmount: amount, percentage: percent });
              }}
              placeholder="Số tiền"
            />
            <input className="w-full rounded-lg border border-[#2d3249] bg-[#0f1118] px-3 py-2 text-sm text-[#8892b0]" value={row.percentage} disabled />
          </div>
        )}

        <select
          className="w-full rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
          value={row.linkedTaskId}
          onChange={(e) => onChange(row.id, { linkedTaskId: e.target.value })}
        >
          <option value="">Không liên kết task</option>
          {linkedTasks.map((task) => (
            <option key={task.id} value={task.id}>{task.code} • {task.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function SubContractDetailClient({
  contractId,
  canWrite,
  currentRole,
}: {
  contractId: string;
  canWrite: boolean;
  currentRole: string;
}) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("info");
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [uploading, setUploading] = useState(false);

  const [payments, setPayments] = useState<SubPayment[]>([]);
  const [paymentMeta, setPaymentMeta] = useState<PaymentMeta | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [openMarkPaid, setOpenMarkPaid] = useState<string | null>(null);
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [actualDate, setActualDate] = useState(todayStr());
  const [paymentMethod, setPaymentMethod] = useState("chuyển khoản");
  const [payNote, setPayNote] = useState("");

  const [draftRows, setDraftRows] = useState<DraftPaymentRow[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  async function loadData() {
    setLoading(true);
    const res = await fetch(`/api/sub-contracts/${contractId}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được chi tiết hợp đồng");
      setContract(null);
      return;
    }

    setContract(json.contract || null);
  }

  async function loadPayments() {
    setLoadingPayment(true);
    const res = await fetch(`/api/sub-contracts/${contractId}/payments`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoadingPayment(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được lịch thanh toán");
      return;
    }

    setPayments((json.payments || []) as SubPayment[]);
    setPaymentMeta({
      contract: json.contract,
      linkedTasks: json.linkedTasks || [],
      totals: json.totals,
      capabilities: json.capabilities,
    });
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  useEffect(() => {
    if (tab === "payment") {
      loadPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    const cv = Number(contract?.contractValue || 0);
    if (!cv || draftRows.length > 0) return;

    setDraftRows([
      {
        id: globalThis.crypto.randomUUID(),
        stage: 1,
        description: "Đợt 1",
        expectedDate: todayStr(),
        linkedTaskId: "",
        mode: "percent",
        percentage: "",
        expectedAmount: "",
      },
    ]);
  }, [contract?.contractValue, draftRows.length]);

  const canAction = useMemo(() => Boolean(contract && canWrite), [contract, canWrite]);

  const totalDraftPercent = useMemo(() => {
    return draftRows.reduce((sum, row) => sum + Number(row.percentage || 0), 0);
  }, [draftRows]);

  async function activateContract() {
    if (!contract) return;
    const res = await fetch(`/api/sub-contracts/${contract.id}/activate`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể kích hoạt hợp đồng");
      return;
    }
    toast.success(json.message || "Đã kích hoạt hợp đồng");
    await loadData();
  }

  async function completeContract() {
    if (!contract) return;
    const res = await fetch(`/api/sub-contracts/${contract.id}/complete`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể hoàn thành hợp đồng");
      return;
    }
    toast.success(json.message || "Đã hoàn thành hợp đồng");
    await loadData();
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

    if (!res.ok) {
      toast.error(json.message || "Không thể hủy hợp đồng");
      return;
    }

    toast.success(json.message || "Đã hủy hợp đồng");
    await loadData();
  }

  async function uploadFiles(files: FileList | null) {
    if (!contract || !files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    setUploading(true);
    const res = await fetch(`/api/sub-contracts/${contract.id}/files`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    setUploading(false);

    if (!res.ok) {
      toast.error(json.message || "Upload tài liệu thất bại");
      return;
    }

    toast.success(json.message || "Đã upload tài liệu");
    await loadData();
  }

  async function deleteFile(fileId: string) {
    if (!contract) return;
    if (!window.confirm("Xóa tài liệu này?")) return;

    const res = await fetch(`/api/sub-contracts/${contract.id}/files/${fileId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Xóa tài liệu thất bại");
      return;
    }

    toast.success(json.message || "Đã xóa tài liệu");
    await loadData();
  }

  async function saveDraftSchedule() {
    if (!contract?.contractValue) {
      toast.error("Không có giá trị hợp đồng");
      return;
    }

    if (draftRows.length < 1 || draftRows.length > 10) {
      toast.error("Số đợt thanh toán phải trong khoảng 1-10");
      return;
    }

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

    if (!res.ok) {
      toast.error(json.message || "Không thể lưu lịch thanh toán");
      return;
    }

    if (json.warning) toast.warning(json.warning);
    toast.success(json.message || "Đã lưu lịch thanh toán");
    await loadPayments();
    setDraftRows([]);
  }

  async function changeStatusAction(paymentId: string, action: "request" | "approve") {
    const endpoint = action === "request" ? "request" : "approve";
    const res = await fetch(`/api/sub-payments/${paymentId}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: null }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Thao tác thất bại");
      return;
    }

    toast.success(json.message || "Đã cập nhật trạng thái");
    await loadPayments();
  }

  async function removePayment(paymentId: string) {
    if (!window.confirm("Xóa/Hủy đợt thanh toán này?")) return;

    const res = await fetch(`/api/sub-payments/${paymentId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Không thể xóa/hủy đợt");
      return;
    }

    toast.success(json.message || "Đã xử lý đợt thanh toán");
    await loadPayments();
  }

  async function uploadReceipt(paymentId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    formData.append("receipt", files[0]);

    setReceiptUploading(true);
    const res = await fetch(`/api/sub-payments/${paymentId}/receipt`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    setReceiptUploading(false);

    if (!res.ok) {
      toast.error(json.message || "Upload phiếu chi thất bại");
      return;
    }

    setReceiptUrl(json.receiptUrl || "");
    toast.success("Đã upload phiếu chi");
  }

  async function submitMarkPaid() {
    if (!openMarkPaid) return;

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
      }),
    });
    const json = await res.json().catch(() => ({}));
    setMarkPaidLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Mark paid thất bại");
      return;
    }

    if (json.warning) toast.warning(json.warning);
    toast.success(json.message || "Đã mark paid");

    setOpenMarkPaid(null);
    setReceiptUrl("");
    setActualAmount("");
    setActualDate(todayStr());
    setPaymentMethod("chuyển khoản");
    setPayNote("");
    await loadPayments();
  }

  function openMarkPaidSheet(payment: SubPayment) {
    setOpenMarkPaid(payment.id);
    setActualAmount(payment.expectedAmount ? String(payment.expectedAmount) : "");
    setActualDate(todayStr());
    setPaymentMethod("chuyển khoản");
    setPayNote("");
    setReceiptUrl(payment.receiptUrl || "");
  }

  if (loading) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-sm text-[#8892b0]">Đang tải dữ liệu...</div>;
  }

  if (!contract) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-sm text-[#8892b0]">Không tìm thấy hợp đồng.</div>;
  }

  const contractValue = Number(contract.contractValue || 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <div className="text-xs text-[#8892b0]">{contract.code}</div>
        <h1 className="text-xl font-bold text-[#f0f2ff]">{contract.title}</h1>
        <div className="mt-1 text-xs text-[#8892b0]">Dự án: <Link href={`/projects/${contract.project.id}`} className="underline">{contract.project.code} • {contract.project.name}</Link></div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className={`rounded-full px-3 py-1 text-xs ${subContractStatusClass(contract.status)}`}>
            {subContractStatusLabel(contract.status)}
          </span>
          <div className="text-xs text-[#8892b0]">Giá trị HĐ: {formatMoney(contract.contractValue)}</div>
        </div>

        {canAction ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {contract.canActivate ? (
              <Button variant="outline" onClick={activateContract}>Kích hoạt</Button>
            ) : null}
            {contract.canComplete ? (
              <Button variant="outline" onClick={completeContract}>Hoàn thành</Button>
            ) : null}
            {contract.canCancel ? (
              <Button variant="destructive" onClick={cancelContract}>Hủy HĐ</Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <Tabs value={tab}>
          <TabsList className="grid grid-cols-5 gap-1">
            <button type="button" onClick={() => setTab("info")}><TabsTrigger active={tab === "info"}>Info</TabsTrigger></button>
            <button type="button" onClick={() => setTab("task")}><TabsTrigger active={tab === "task"}>Task</TabsTrigger></button>
            <button type="button" onClick={() => setTab("payment")}><TabsTrigger active={tab === "payment"}>Thanh toán</TabsTrigger></button>
            <button type="button" onClick={() => setTab("evaluation")}><TabsTrigger active={tab === "evaluation"}>Đánh giá</TabsTrigger></button>
            <button type="button" onClick={() => setTab("file")}><TabsTrigger active={tab === "file"}>Tài liệu</TabsTrigger></button>
          </TabsList>
        </Tabs>

        {tab === "info" ? (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-xs text-[#8892b0]">Thầu phụ</div>
              <div className="text-[#f0f2ff]">{contract.subcontractor.code} • {contract.subcontractor.name}</div>
              <a href={`tel:${contract.subcontractor.phone}`} className="text-xs text-[#fb923c] underline">{contract.subcontractor.phone}</a>
            </div>

            <div>
              <div className="text-xs text-[#8892b0]">Phạm vi công việc</div>
              <div className="text-[#d9def3] whitespace-pre-wrap">{contract.scopeOfWork}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-[#a4acc8]">
              <div>Đơn vị: {subContractUnitLabel(contract.unit as never)}</div>
              <div>Đơn giá: {formatMoney(contract.unitPrice)}</div>
              <div>Khối lượng: {contract.quantity ?? "-"}</div>
              <div>Giá trị: {formatMoney(contract.contractValue)}</div>
              <div>Bắt đầu: {formatDate(contract.startDate)}</div>
              <div>Kết thúc dự kiến: {formatDate(contract.expectedEndDate)}</div>
              <div>Kết thúc thực tế: {formatDate(contract.actualEndDate)}</div>
              <div>Tạo bởi: {contract.creator.fullName}</div>
            </div>

            {contract.notes ? (
              <div>
                <div className="text-xs text-[#8892b0]">Ghi chú</div>
                <div className="text-[#d9def3] whitespace-pre-wrap">{contract.notes}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "task" ? (
          <div className="mt-4 space-y-2">
            {contract.linkedTasks.length === 0 ? (
              <div className="text-sm text-[#8892b0]">Chưa liên kết công việc.</div>
            ) : (
              contract.linkedTasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
                  <div className="text-sm font-semibold text-[#f0f2ff]">{task.code} • {task.name}</div>
                  <div className="text-xs text-[#8892b0]">{task.phase} • {task.status}</div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "payment" ? (
          <div className="mt-4 space-y-3">
            {loadingPayment ? (
              <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm text-[#8892b0]">Đang tải lịch thanh toán...</div>
            ) : null}

            {paymentMeta?.contract.canViewFinancial ? (
              <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-xs text-[#a4acc8]">
                <div className="flex items-center justify-between">
                  <span>Tổng lịch (%): {paymentMeta.totals.percentTotal?.toFixed(2) || "0.00"}%</span>
                  <span>Tổng đã chi: {formatMoney(paymentMeta.totals.paidTotal || 0)}</span>
                </div>
                {Number(paymentMeta.totals.percentTotal || 0) > 100 ? (
                  <div className="mt-1 text-yellow-300">Cảnh báo: Tổng % đang vượt 100% (vẫn cho phép lưu theo lịch linh hoạt).</div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-xs text-[#8892b0]">Bạn không có quyền xem số tiền chi tiết.</div>
            )}

            {paymentMeta?.capabilities.canCreate && paymentMeta.contract.canViewFinancial ? (
              <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-[#f0f2ff]">Lịch thanh toán linh hoạt (1-10 đợt)</div>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      if (draftRows.length >= 10) return;
                      setDraftRows((prev) => [
                        ...prev,
                        {
                          id: globalThis.crypto.randomUUID(),
                          stage: prev.length + 1,
                          description: `Đợt ${prev.length + 1}`,
                          expectedDate: todayStr(),
                          linkedTaskId: "",
                          mode: "percent",
                          percentage: "",
                          expectedAmount: "",
                        },
                      ]);
                    }}
                  >
                    + Thêm đợt
                  </Button>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => {
                    const { active, over } = event;
                    if (!over || active.id === over.id) return;
                    setDraftRows((items) => {
                      const oldIndex = items.findIndex((x) => x.id === active.id);
                      const newIndex = items.findIndex((x) => x.id === over.id);
                      const moved = arrayMove(items, oldIndex, newIndex);
                      return moved.map((it, idx) => ({ ...it, stage: idx + 1 }));
                    });
                  }}
                >
                  <SortableContext items={draftRows.map((x) => x.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {draftRows.map((row) => (
                        <PaymentDraftCard
                          key={row.id}
                          row={row}
                          contractValue={contractValue}
                          onChange={(id, patch) => {
                            setDraftRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
                          }}
                          onDelete={(id) => {
                            setDraftRows((prev) => prev.filter((x) => x.id !== id).map((x, idx) => ({ ...x, stage: idx + 1 })));
                          }}
                          linkedTasks={(paymentMeta?.linkedTasks || []).map((x) => ({ id: x.id, code: x.code, name: x.name }))}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                <div className="mt-2 text-xs text-[#a4acc8]">
                  Tổng % draft: {totalDraftPercent.toFixed(2)}%
                  {totalDraftPercent < 100 ? " • Chưa đạt 100% (vẫn cho phép)" : ""}
                </div>

                <div className="mt-3 flex justify-end">
                  <Button onClick={saveDraftSchedule} disabled={savingDraft || draftRows.length === 0}>
                    {savingDraft ? "Đang lưu..." : "Lưu lịch thanh toán"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              {payments.length === 0 ? (
                <div className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm text-[#8892b0]">Chưa có đợt thanh toán.</div>
              ) : (
                payments.map((payment) => (
                  <div key={payment.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-[#8892b0]">{payment.code} • Đợt {payment.stage}</div>
                        <div className="text-sm font-semibold text-[#f0f2ff]">{payment.description}</div>
                        <div className="text-xs text-[#a4acc8]">
                          Dự kiến: {formatDate(payment.expectedDate)}
                          {paymentMeta?.contract.canViewFinancial ? ` • ${formatMoney(payment.expectedAmount || 0)} (${payment.percentage || 0}%)` : ""}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] ${statusPill(payment.status)}`}>{statusLabel(payment.status)}</span>
                    </div>

                    {payment.status === SubPaymentStatus.paid && paymentMeta?.contract.canViewFinancial ? (
                      <div className="mt-2 text-xs text-emerald-300">Đã chi: {formatMoney(payment.actualAmount || 0)} • {formatDate(payment.actualPaidDate)}</div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-2">
                      {(currentRole === "admin" || currentRole === "construction_manager") && payment.status === SubPaymentStatus.pending ? (
                        <Button size="xs" variant="outline" onClick={() => changeStatusAction(payment.id, "request")}>Đề xuất chi</Button>
                      ) : null}

                      {currentRole === "admin" && payment.status === SubPaymentStatus.requested ? (
                        <Button size="xs" variant="outline" onClick={() => changeStatusAction(payment.id, "approve")}>Duyệt</Button>
                      ) : null}

                      {(currentRole === "admin" || currentRole === "accountant") && payment.status === SubPaymentStatus.approved ? (
                        <Button size="xs" onClick={() => openMarkPaidSheet(payment)}>Mark paid</Button>
                      ) : null}

                      {(currentRole === "admin" || currentRole === "construction_manager") && payment.status !== SubPaymentStatus.paid ? (
                        <Button size="xs" variant="destructive" onClick={() => removePayment(payment.id)}>Xóa/Hủy</Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {tab === "evaluation" ? (
          <div className="mt-4 rounded-xl border border-[#2d3249] bg-[#13151f] p-4 text-sm text-[#8892b0]">
            Đánh giá sẽ triển khai ở Phase E.
          </div>
        ) : null}

        {tab === "file" ? (
          <div className="mt-4 space-y-3">
            {contract.canManageFiles ? (
              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff] hover:bg-[#1a1d2e]">
                  <Upload className="h-4 w-4" /> {uploading ? "Đang tải..." : "Tải tài liệu"}
                  <input type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} disabled={uploading} />
                </label>
              </div>
            ) : null}

            {contract.files.length === 0 ? (
              <div className="text-sm text-[#8892b0]">Chưa có tài liệu.</div>
            ) : (
              contract.files.map((file) => (
                <div key={file.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <a href={file.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-[#f0f2ff] underline">
                        <FileText className="h-4 w-4" /> {file.fileName}
                      </a>
                      <div className="text-xs text-[#8892b0]">{file.fileType} • {formatDate(file.uploadedAt)} • {file.uploader.fullName}</div>
                    </div>

                    {contract.canManageFiles ? (
                      <Button variant="destructive" size="xs" onClick={() => deleteFile(file.id)}>Xóa</Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      {openMarkPaid ? (
        <div className="fixed inset-0 z-50 bg-black/60">
          <button type="button" className="h-full w-full" onClick={() => setOpenMarkPaid(null)} aria-label="Đóng" />
          <div className="absolute bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 rounded-t-2xl border border-[#252840] bg-[#13151f] p-4 slide-up">
            <div className="mb-3 text-lg font-semibold text-[#f0f2ff]">Mark đã chi</div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Số tiền thực chi</label>
                <input
                  type="number"
                  className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                  value={actualAmount}
                  onChange={(e) => setActualAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Ngày chi</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                  value={actualDate}
                  onChange={(e) => setActualDate(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Phương thức</label>
                <select
                  className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="chuyển khoản">Chuyển khoản</option>
                  <option value="tiền mặt">Tiền mặt</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Upload phiếu chi (bắt buộc)</label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm text-[#f0f2ff]">
                  {receiptUploading ? "Đang upload..." : "Chọn ảnh phiếu chi"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadReceipt(openMarkPaid, e.target.files)} />
                </label>
                {receiptUrl ? <div className="mt-1 text-xs text-emerald-300">Đã có chứng từ: {receiptUrl}</div> : null}
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Ghi chú (optional)</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpenMarkPaid(null)}>Hủy</Button>
                <Button onClick={submitMarkPaid} disabled={markPaidLoading || !receiptUrl}>
                  {markPaidLoading ? "Đang xử lý..." : "Xác nhận đã chi"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
