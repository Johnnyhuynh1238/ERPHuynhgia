"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Upload } from "lucide-react";
import { SubContractStatus } from "@prisma/client";
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

type TabValue = "info" | "task" | "payment" | "evaluation" | "file";

export function SubContractDetailClient({ contractId, canWrite }: { contractId: string; canWrite: boolean }) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("info");
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  const canAction = useMemo(() => Boolean(contract && canWrite), [contract, canWrite]);

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

  if (loading) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-sm text-[#8892b0]">Đang tải dữ liệu...</div>;
  }

  if (!contract) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-sm text-[#8892b0]">Không tìm thấy hợp đồng.</div>;
  }

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
          <div className="mt-4 rounded-xl border border-[#2d3249] bg-[#13151f] p-4 text-sm text-[#8892b0]">
            Thanh toán sẽ triển khai ở Phase D.
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
    </div>
  );
}
