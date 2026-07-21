"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SubContractStatus, SubContractUnit } from "@prisma/client";
import { toast } from "sonner";
import { subContractUnitLabel } from "@/lib/sub-contract-view";
import { SubDetailPopup } from "./sub-detail-popup";

// Tab "Thầu phụ" trong màn Quản Lý NCC — dùng UI ngà (.cndoc) như tab công nợ.
// Chỉ liệt kê + xem (link chi tiết) + tạo HĐ nháp (admin/CM).

type ContractItem = {
  id: string;
  code: string;
  title: string;
  scopeOfWork: string;
  status: SubContractStatus;
  unit: SubContractUnit | null;
  contractValue: number | null;
  unitPrice: number | null;
  quantity: number | null;
  subcontractor: { id: string; code: string; name: string; phone: string };
  linkedTasks: Array<{ id: string; code: string; name: string; status: string }>;
};

type SubcontractorOption = { id: string; code: string; name: string; phone: string };
type TaskOption = { id: string; code: string; name: string; status: string };

const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");

const statusLabel: Record<SubContractStatus, string> = {
  draft: "Nháp",
  active: "Đang thực hiện",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};
const statusChip: Record<SubContractStatus, string> = {
  draft: "await",
  active: "debt",
  completed: "paidoff",
  cancelled: "",
};

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function nextMonthInput() {
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type Form = {
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
const DEFAULT_FORM: Form = {
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

export function SubContractsTab({
  projectId,
  canManage,
  currentRole,
  currentUserId,
}: {
  projectId: string;
  canManage: boolean;
  currentRole: string;
  currentUserId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ContractItem[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const [openSheet, setOpenSheet] = useState(false);
  const [show, setShow] = useState(false);
  const [subSearch, setSubSearch] = useState("");
  const [subs, setSubs] = useState<SubcontractorOption[]>([]);
  const [selectedSub, setSelectedSub] = useState<SubcontractorOption | null>(null);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const loadContracts = useCallback(async () => {
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
  }, [projectId, search]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  // load danh sách thầu phụ khi mở sheet / gõ tìm
  useEffect(() => {
    if (!openSheet) return;
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ search: subSearch.trim(), status: "all" });
      const res = await fetch(`/api/subcontractors?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setSubs((json.subcontractors || []).map((x: SubcontractorOption) => ({ id: x.id, code: x.code, name: x.name, phone: x.phone })));
    }, 200);
    return () => clearTimeout(t);
  }, [openSheet, subSearch]);

  useEffect(() => {
    if (!openSheet) return;
    (async () => {
      const res = await fetch(`/api/projects/${projectId}/tasks`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setTasks((json.tasks || []).map((x: TaskOption) => ({ id: x.id, code: x.code, name: x.name, status: x.status })));
    })();
  }, [openSheet, projectId]);

  // auto-tính giá trị = đơn giá × khối lượng
  useEffect(() => {
    const up = Number(form.unitPrice || 0);
    const q = Number(form.quantity || 0);
    if (up > 0 && q > 0) setForm((p) => ({ ...p, contractValue: String(Math.round(up * q)) }));
  }, [form.unitPrice, form.quantity]);

  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + (r.contractValue || 0), 0);
    const active = rows.filter((r) => r.status === "active").length;
    return { count: rows.length, total, active };
  }, [rows]);

  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setSelectedSub(null);
    setSelectedTaskIds([]);
    setSubSearch("");
    setSubs([]);
    setOpenSheet(true);
    requestAnimationFrame(() => setShow(true));
  };
  const closeSheet = () => {
    setShow(false);
    setTimeout(() => setOpenSheet(false), 240);
  };

  const toggleTask = (id: string) =>
    setSelectedTaskIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function submitCreate() {
    if (!selectedSub) return toast.error("Vui lòng chọn thầu phụ");
    if (!form.title.trim() || !form.scopeOfWork.trim()) return toast.error("Thiếu tiêu đề / phạm vi công việc");
    const contractValue = Number(form.contractValue || 0);
    if (!(contractValue > 0)) return toast.error("Giá trị hợp đồng phải lớn hơn 0");

    setSubmitting(true);
    const payload = {
      subcontractorId: selectedSub.id,
      title: form.title.trim(),
      scopeOfWork: form.scopeOfWork.trim(),
      unit: form.unit,
      unitPrice: form.unitPrice ? Number(form.unitPrice) : null,
      quantity: form.quantity ? Number(form.quantity) : null,
      contractValue,
      startDate: form.startDate,
      expectedEndDate: form.expectedEndDate,
      notes: form.notes.trim() || null,
      taskIds: selectedTaskIds,
    };
    const res = await fetch(`/api/projects/${projectId}/sub-contracts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) return toast.error(json.message || "Tạo hợp đồng thất bại");
    toast.success(json.message || "Đã tạo hợp đồng nháp");
    closeSheet();
    loadContracts();
  }

  return (
    <>
      {/* summary */}
      <div className="sum">
        <div className="c">
          <div className="k">Số hợp đồng</div>
          <div className="v t num">{loading ? "—" : summary.count}</div>
          <div className="sp">thầu phụ</div>
        </div>
        <div className="c">
          <div className="k">Đang thực hiện</div>
          <div className="v o num">{loading ? "—" : summary.active}</div>
          <div className="sp">HĐ active</div>
        </div>
        <div className="c">
          <div className="k">Tổng giá trị</div>
          <div className="v r num">{loading ? "—" : fmt(summary.total)}</div>
          <div className="sp">giá trị HĐ</div>
        </div>
      </div>

      <div className="seclabel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Hợp đồng thầu phụ</span>
        {canManage && (
          <button type="button" className="btn" style={{ padding: "8px 14px", fontSize: 13 }} onClick={openCreate}>
            ＋ Thêm HĐ
          </button>
        )}
      </div>

      <div className="fld" style={{ marginTop: 4 }}>
        <input
          placeholder="Tìm mã, tiêu đề, phạm vi, tên thầu phụ…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="load">Đang tải hợp đồng…</div>
      ) : !rows.length ? (
        <div className="empty">
          <div className="ic">🤝</div>
          Chưa có hợp đồng thầu phụ.
          {canManage && (
            <>
              <br />
              Bấm &quot;＋ Thêm HĐ&quot; để tạo hợp đồng nháp.
            </>
          )}
        </div>
      ) : (
        <div className="nlist">
          {rows.map((r) => (
            <button key={r.id} type="button" className="nccrow" onClick={() => setOpenId(r.id)}>
              <div className="nl">
                <div className="nn">{r.subcontractor.name}</div>
                <div className="nsub">
                  <span>{r.code}</span>
                  <span>· {subContractUnitLabel(r.unit)}</span>
                  {r.scopeOfWork && <span>· {r.scopeOfWork.slice(0, 40)}</span>}
                </div>
              </div>
              <div className="nr">
                <div className="rv num" style={{ color: "var(--terra)" }}>{fmt(r.contractValue || 0)}</div>
                <div className="rk">
                  <span className={`chip ${statusChip[r.status]}`}>{statusLabel[r.status]}</span>
                </div>
              </div>
              <span className="chev">›</span>
            </button>
          ))}
        </div>
      )}

      <div className="foot">Hợp đồng thầu phụ · bấm để xem chi tiết & thanh toán</div>

      {/* sheet tạo HĐ */}
      {openSheet && (
        <>
          <div className={`scrim${show ? " show" : ""}`} onClick={closeSheet} />
          <div className={`sheet${show ? " show" : ""}`} role="dialog" aria-modal="true">
            <div className="grip" />
            <div className="shead">
              <div>
                <div className="se">Thầu phụ</div>
                <div className="st">Tạo hợp đồng nháp</div>
              </div>
              <button type="button" className="xclose" onClick={closeSheet} aria-label="Đóng">✕</button>
            </div>
            <div className="sbody">
              <div className="fld">
                <label>Chọn thầu phụ</label>
                <input placeholder="Tìm mã / tên / SĐT" value={subSearch} onChange={(e) => setSubSearch(e.target.value)} />
                <div style={{ maxHeight: "34vh", overflowY: "auto", marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {subs.map((s) => {
                    const active = selectedSub?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="nccrow"
                        style={{ marginTop: 0, borderColor: active ? "var(--orange)" : undefined, borderWidth: active ? 2 : 1 }}
                        onClick={() => setSelectedSub(s)}
                      >
                        <div className="nl">
                          <div className="nn">{s.code} · {s.name}</div>
                          <div className="nsub"><span>{s.phone || "—"}</span></div>
                        </div>
                        {active && <span className="chev" style={{ color: "var(--orange)" }}>✓</span>}
                      </button>
                    );
                  })}
                  {!subs.length && <div className="load" style={{ padding: "16px 4px" }}>Không có dữ liệu</div>}
                </div>
              </div>

              <div className="fld">
                <label>Tiêu đề HĐ</label>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="fld">
                <label>Phạm vi công việc</label>
                <textarea rows={3} value={form.scopeOfWork} onChange={(e) => setForm((p) => ({ ...p, scopeOfWork: e.target.value }))} />
              </div>

              <div className="fld">
                <label>Đơn vị tính</label>
                <div className="segs">
                  {(
                    [
                      [SubContractUnit.lump_sum, "Trọn gói"],
                      [SubContractUnit.per_m2, "Theo m²"],
                      [SubContractUnit.per_day, "Theo ngày"],
                      [SubContractUnit.per_unit, "Theo ĐV"],
                    ] as Array<[SubContractUnit, string]>
                  ).map(([v, lbl]) => (
                    <button
                      key={v}
                      type="button"
                      className={`seg${form.unit === v ? " on" : ""}`}
                      onClick={() => setForm((p) => ({ ...p, unit: v }))}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="row2">
                <div className="fld">
                  <label>Đơn giá</label>
                  <input className="mono" type="number" inputMode="numeric" value={form.unitPrice} onChange={(e) => setForm((p) => ({ ...p, unitPrice: e.target.value }))} />
                </div>
                <div className="fld">
                  <label>Khối lượng</label>
                  <input className="mono" type="number" inputMode="numeric" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
                </div>
              </div>
              <div className="fld">
                <label>Giá trị hợp đồng</label>
                <input className="mono" type="number" inputMode="numeric" value={form.contractValue} onChange={(e) => setForm((p) => ({ ...p, contractValue: e.target.value }))} />
              </div>

              <div className="row2">
                <div className="fld">
                  <label>Ngày bắt đầu</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div className="fld">
                  <label>Kết thúc dự kiến</label>
                  <input type="date" value={form.expectedEndDate} onChange={(e) => setForm((p) => ({ ...p, expectedEndDate: e.target.value }))} />
                </div>
              </div>
              <div className="fld">
                <label>Ghi chú</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>

              {tasks.length > 0 && (
                <div className="fld">
                  <label>Liên kết công tác (tùy chọn)</label>
                  <div style={{ maxHeight: "30vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                    {tasks.map((t) => {
                      const active = selectedTaskIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className="nccrow"
                          style={{ marginTop: 0, borderColor: active ? "var(--orange)" : undefined, borderWidth: active ? 2 : 1 }}
                          onClick={() => toggleTask(t.id)}
                        >
                          <div className="nl">
                            <div className="nn">{t.code} · {t.name}</div>
                            <div className="nsub"><span>{t.status}</span></div>
                          </div>
                          {active && <span className="chev" style={{ color: "var(--orange)" }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="sactions">
                <button type="button" className="btn ghost" onClick={closeSheet}>Hủy</button>
                <button type="button" className="btn" onClick={submitCreate} disabled={submitting}>
                  {submitting ? "Đang tạo…" : "Tạo hợp đồng nháp"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* popup chi tiết HĐ thầu phụ — full màn ngà */}
      {openId && (
        <SubDetailPopup
          key={openId}
          contractId={openId}
          currentRole={currentRole}
          currentUserId={currentUserId}
          onClose={() => setOpenId(null)}
          onChanged={loadContracts}
        />
      )}
    </>
  );
}
