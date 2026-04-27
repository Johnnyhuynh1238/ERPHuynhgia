"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { SubContractStatus, SubContractUnit } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMoney, subContractStatusClass, subContractStatusLabel } from "@/lib/sub-contract-view";

type ContractItem = {
  id: string;
  code: string;
  title: string;
  scopeOfWork: string;
  status: SubContractStatus;
  contractValue: number | null;
  unitPrice: number | null;
  quantity: number | null;
  subcontractor: { id: string; code: string; name: string; phone: string };
  linkedTasks: Array<{ id: string; code: string; name: string; status: string }>;
};

type SubcontractorOption = {
  id: string;
  code: string;
  name: string;
  phone: string;
};

type TaskOption = {
  id: string;
  code: string;
  name: string;
  status: string;
};

type Step2Form = {
  title: string;
  scopeOfWork: string;
  unit: SubContractUnit;
  unitPrice: string;
  quantity: string;
  contractValue: string;
  startDate: string;
  expectedEndDate: string;
  notes: string;
};

function todayInput() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextMonthInput() {
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DEFAULT_STEP2: Step2Form = {
  title: "",
  scopeOfWork: "",
  unit: SubContractUnit.lump_sum,
  unitPrice: "",
  quantity: "",
  contractValue: "",
  startDate: todayInput(),
  expectedEndDate: nextMonthInput(),
  notes: "",
};

export function ProjectSubContractsClient({ projectId, canCreate }: { projectId: string; canCreate: boolean }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ContractItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [openSheet, setOpenSheet] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [subcontractorSearch, setSubcontractorSearch] = useState("");
  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([]);
  const [selectedSubcontractor, setSelectedSubcontractor] = useState<SubcontractorOption | null>(null);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [step2, setStep2] = useState<Step2Form>(DEFAULT_STEP2);
  const [submitting, setSubmitting] = useState(false);

  async function loadContracts() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);

    const res = await fetch(`/api/projects/${projectId}/sub-contracts?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được hợp đồng thầu phụ");
      setRows([]);
      return;
    }

    setRows(json.contracts || []);
  }

  async function loadSubcontractors(keyword = "") {
    const qs = new URLSearchParams({ search: keyword, status: "all" });
    const res = await fetch(`/api/subcontractors?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không tải được danh sách thầu phụ");
      return;
    }

    setSubcontractors((json.subcontractors || []).map((x: SubcontractorOption) => ({ id: x.id, code: x.code, name: x.name, phone: x.phone })));
  }

  async function loadTasks() {
    const res = await fetch(`/api/projects/${projectId}/tasks`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không tải được công việc dự án");
      return;
    }

    setTasks((json.tasks || []).map((x: TaskOption) => ({ id: x.id, code: x.code, name: x.name, status: x.status })));
  }

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, projectId]);

  useEffect(() => {
    if (!openSheet || step !== 1) return;
    loadSubcontractors(subcontractorSearch.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSheet, step, subcontractorSearch]);

  useEffect(() => {
    if (!openSheet || step !== 3) return;
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSheet, step]);

  useEffect(() => {
    const unitPrice = Number(step2.unitPrice || 0);
    const quantity = Number(step2.quantity || 0);
    if (Number.isFinite(unitPrice) && Number.isFinite(quantity) && unitPrice > 0 && quantity > 0) {
      setStep2((prev) => ({ ...prev, contractValue: String(Math.round(unitPrice * quantity)) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step2.unitPrice, step2.quantity]);

  const summaryText = useMemo(() => `Tổng ${rows.length} hợp đồng`, [rows.length]);

  function openCreateSheet() {
    setOpenSheet(true);
    setStep(1);
    setSubcontractorSearch("");
    setSelectedSubcontractor(null);
    setSelectedTaskIds([]);
    setStep2(DEFAULT_STEP2);
  }

  function toggleTask(taskId: string) {
    setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
  }

  async function submitCreate() {
    if (!selectedSubcontractor) {
      toast.error("Vui lòng chọn thầu phụ");
      setStep(1);
      return;
    }

    if (!step2.title.trim() || !step2.scopeOfWork.trim()) {
      toast.error("Thiếu thông tin hợp đồng");
      setStep(2);
      return;
    }

    const contractValue = Number(step2.contractValue || 0);
    if (!Number.isFinite(contractValue) || contractValue <= 0) {
      toast.error("Giá trị hợp đồng phải lớn hơn 0");
      setStep(2);
      return;
    }

    setSubmitting(true);

    const payload = {
      subcontractorId: selectedSubcontractor.id,
      title: step2.title.trim(),
      scopeOfWork: step2.scopeOfWork.trim(),
      unit: step2.unit,
      unitPrice: step2.unitPrice ? Number(step2.unitPrice) : null,
      quantity: step2.quantity ? Number(step2.quantity) : null,
      contractValue,
      startDate: step2.startDate,
      expectedEndDate: step2.expectedEndDate,
      notes: step2.notes.trim() || null,
      taskIds: selectedTaskIds,
    };

    const res = await fetch(`/api/projects/${projectId}/sub-contracts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      toast.error(json.message || "Tạo hợp đồng thất bại");
      return;
    }

    toast.success(json.message || "Đã tạo hợp đồng nháp");
    setOpenSheet(false);
    await loadContracts();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-[#f0f2ff]">Thầu phụ</h2>
          {canCreate ? (
            <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={openCreateSheet}>
              <Plus className="mr-1 h-4 w-4" /> Thêm HĐ
            </Button>
          ) : null}
        </div>

        <div className="mt-3 relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8892b0]" />
          <input
            className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] py-2 pl-9 pr-3 text-sm text-[#f0f2ff]"
            placeholder="Tìm mã, tiêu đề, phạm vi, tên thầu phụ"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-xs text-[#8892b0]">{summaryText}</div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">Đang tải dữ liệu...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">Chưa có hợp đồng thầu phụ.</div>
        ) : (
          rows.map((item) => (
            <Link key={item.id} href={`/sub-contracts/${item.id}`} className="block rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-[#8892b0]">{item.code}</div>
                  <div className="text-sm font-bold text-[#f0f2ff]">{item.subcontractor.name}</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] ${subContractStatusClass(item.status)}`}>
                  {subContractStatusLabel(item.status)}
                </span>
              </div>

              <div className="mt-2 text-sm text-[#d9def3] line-clamp-2">{item.scopeOfWork}</div>
              <div className="mt-2 text-xs text-[#8892b0]">Giá trị HĐ: {formatMoney(item.contractValue)}</div>

              <div className="mt-3">
                <div className="mb-1 text-[11px] text-[#8892b0]">Tiến độ thanh toán (Phase D)</div>
                <div className="h-2 rounded-full bg-[#252840]">
                  <div className="h-2 w-0 rounded-full bg-[#f97316]" />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {openSheet ? (
        <div className="fixed inset-0 z-50 bg-black/60">
          <button type="button" className="h-full w-full" onClick={() => setOpenSheet(false)} aria-label="Đóng" />
          <div className="absolute bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 rounded-t-2xl border border-[#252840] bg-[#13151f] p-4 slide-up">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold text-[#f0f2ff]">Tạo hợp đồng thầu phụ</div>
              <div className="text-xs text-[#8892b0]">Bước {step}/3</div>
            </div>

            {step === 1 ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8892b0]" />
                  <input
                    className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] py-2 pl-9 pr-3 text-sm text-[#f0f2ff]"
                    placeholder="Tìm theo mã / tên / SĐT"
                    value={subcontractorSearch}
                    onChange={(e) => setSubcontractorSearch(e.target.value)}
                  />
                </div>

                <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                  {subcontractors.map((item) => {
                    const active = selectedSubcontractor?.id === item.id;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setSelectedSubcontractor(item)}
                        className={`w-full rounded-xl border p-3 text-left ${
                          active ? "border-[#f97316] bg-[#f97316]/20" : "border-[#2d3249] bg-[#1a1d2e]"
                        }`}
                      >
                        <div className="text-sm font-semibold text-[#f0f2ff]">{item.code} • {item.name}</div>
                        <div className="text-xs text-[#8892b0]">{item.phone}</div>
                      </button>
                    );
                  })}
                  {subcontractors.length === 0 ? <div className="text-xs text-[#8892b0]">Không có dữ liệu</div> : null}
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpenSheet(false)}>Hủy</Button>
                  <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={() => setStep(2)} disabled={!selectedSubcontractor}>
                    Tiếp tục
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">Tiêu đề HĐ</label>
                  <input className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={step2.title} onChange={(e) => setStep2((prev) => ({ ...prev, title: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">Phạm vi công việc</label>
                  <textarea rows={3} className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={step2.scopeOfWork} onChange={(e) => setStep2((prev) => ({ ...prev, scopeOfWork: e.target.value }))} />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-[#a4acc8]">Đơn vị</label>
                    <select className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={step2.unit} onChange={(e) => setStep2((prev) => ({ ...prev, unit: e.target.value as SubContractUnit }))}>
                      <option value={SubContractUnit.lump_sum}>Trọn gói</option>
                      <option value={SubContractUnit.per_m2}>Theo m²</option>
                      <option value={SubContractUnit.per_day}>Theo ngày</option>
                      <option value={SubContractUnit.per_unit}>Theo đơn vị</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[#a4acc8]">Đơn giá</label>
                    <input type="number" className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={step2.unitPrice} onChange={(e) => setStep2((prev) => ({ ...prev, unitPrice: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[#a4acc8]">Khối lượng</label>
                    <input type="number" className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={step2.quantity} onChange={(e) => setStep2((prev) => ({ ...prev, quantity: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">Giá trị hợp đồng</label>
                  <input type="number" className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={step2.contractValue} onChange={(e) => setStep2((prev) => ({ ...prev, contractValue: e.target.value }))} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-[#a4acc8]">Ngày bắt đầu</label>
                    <input type="date" className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={step2.startDate} onChange={(e) => setStep2((prev) => ({ ...prev, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[#a4acc8]">Ngày kết thúc dự kiến</label>
                    <input type="date" className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={step2.expectedEndDate} onChange={(e) => setStep2((prev) => ({ ...prev, expectedEndDate: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-[#a4acc8]">Ghi chú</label>
                  <textarea rows={2} className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={step2.notes} onChange={(e) => setStep2((prev) => ({ ...prev, notes: e.target.value }))} />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>Quay lại</Button>
                  <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={() => setStep(3)}>Tiếp tục</Button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-3">
                <div className="text-xs text-[#8892b0]">Liên kết công việc (tùy chọn)</div>
                <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                  {tasks.map((task) => {
                    const active = selectedTaskIds.includes(task.id);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className={`w-full rounded-xl border p-3 text-left ${
                          active ? "border-[#f97316] bg-[#f97316]/20" : "border-[#2d3249] bg-[#1a1d2e]"
                        }`}
                      >
                        <div className="text-sm font-semibold text-[#f0f2ff]">{task.code} • {task.name}</div>
                        <div className="text-xs text-[#8892b0]">{task.status}</div>
                      </button>
                    );
                  })}
                  {tasks.length === 0 ? <div className="text-xs text-[#8892b0]">Không có công việc để liên kết</div> : null}
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>Quay lại</Button>
                  <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitCreate} disabled={submitting}>
                    {submitting ? "Đang tạo..." : "Tạo hợp đồng nháp"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
