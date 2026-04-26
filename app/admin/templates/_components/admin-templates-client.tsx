"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PHASE_COLOR, PHASE_LABEL } from "@/lib/task-display";

type TaskPhase =
  | "P1_CHUAN_BI"
  | "P2_MONG"
  | "P3_KHUNG_TRET"
  | "P4_KHUNG_LAU"
  | "P5_ME_XAY_TO"
  | "P6_OP_LAT"
  | "P7_SON_BA"
  | "P8_LAP_TB"
  | "P9_BAN_GIAO";

type TemplateItem = {
  id: string;
  code: string;
  phase: TaskPhase;
  name: string;
  defaultOffsetDays: number;
  defaultDurationDays: number;
  defaultTeam: string;
  defaultInspector: string;
  materialsNeeded: string;
  proposerRole: string;
  ordererRole: string;
  receiverRole: string;
  qcChecklist: string;
  isMilestone: boolean;
  displayOrder: number;
  templateCategory: string;
  isActive: boolean;
};

type FormState = {
  code: string;
  phase: TaskPhase;
  name: string;
  defaultOffsetDays: string;
  defaultDurationDays: string;
  defaultTeam: string;
  defaultInspector: string;
  materialsNeeded: string;
  proposerRole: string;
  ordererRole: string;
  receiverRole: string;
  qcChecklist: string;
  isMilestone: boolean;
  displayOrder: string;
  templateCategory: string;
};

const DEFAULT_CATEGORY = "nha_pho_1t1l";

const EMPTY_FORM: FormState = {
  code: "",
  phase: "P1_CHUAN_BI",
  name: "",
  defaultOffsetDays: "0",
  defaultDurationDays: "1",
  defaultTeam: "",
  defaultInspector: "",
  materialsNeeded: "",
  proposerRole: "",
  ordererRole: "",
  receiverRole: "",
  qcChecklist: "• ",
  isMilestone: false,
  displayOrder: "1",
  templateCategory: DEFAULT_CATEGORY,
};

function toFormValue(t: TemplateItem): FormState {
  return {
    code: t.code,
    phase: t.phase,
    name: t.name,
    defaultOffsetDays: String(t.defaultOffsetDays),
    defaultDurationDays: String(t.defaultDurationDays),
    defaultTeam: t.defaultTeam,
    defaultInspector: t.defaultInspector,
    materialsNeeded: t.materialsNeeded,
    proposerRole: t.proposerRole,
    ordererRole: t.ordererRole,
    receiverRole: t.receiverRole,
    qcChecklist: t.qcChecklist,
    isMilestone: t.isMilestone,
    displayOrder: String(t.displayOrder),
    templateCategory: t.templateCategory,
  };
}

function toPayload(f: FormState) {
  return {
    code: f.code.trim(),
    phase: f.phase,
    name: f.name.trim(),
    defaultOffsetDays: Number(f.defaultOffsetDays),
    defaultDurationDays: Number(f.defaultDurationDays),
    defaultTeam: f.defaultTeam.trim(),
    defaultInspector: f.defaultInspector.trim(),
    materialsNeeded: f.materialsNeeded,
    proposerRole: f.proposerRole.trim(),
    ordererRole: f.ordererRole.trim(),
    receiverRole: f.receiverRole.trim(),
    qcChecklist: f.qcChecklist,
    isMilestone: f.isMilestone,
    displayOrder: Number(f.displayOrder),
    templateCategory: f.templateCategory,
  };
}

export function AdminTemplatesClient() {
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TemplateItem[]>([]);

  const [editing, setEditing] = useState<TemplateItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  async function loadRows() {
    setLoading(true);
    const q = new URLSearchParams({ category, includeInactive: includeInactive ? "1" : "0" });
    const res = await fetch(`/api/admin/templates?${q.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được templates");
      return;
    }

    setRows(json.templates || []);
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, includeInactive]);

  const nextDisplayOrder = useMemo(() => {
    if (!rows.length) return 1;
    return Math.max(...rows.map((r) => r.displayOrder)) + 1;
  }, [rows]);

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setForm({ ...EMPTY_FORM, displayOrder: String(nextDisplayOrder), templateCategory: category });
  }

  function openEdit(row: TemplateItem) {
    setEditing(row);
    setCreating(false);
    setForm(toFormValue(row));
  }

  function closeModal() {
    setEditing(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  }

  async function saveTemplate() {
    const payload = toPayload(form);

    setSaving(true);

    const res = await fetch(creating ? "/api/admin/templates" : `/api/admin/templates/${editing?.id}`, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Lưu template thất bại");
      return;
    }

    toast.success(json.message || "Đã lưu template");
    closeModal();
    await loadRows();
  }

  async function deleteTemplate(row: TemplateItem) {
    const ok = window.confirm(
      `Xóa template ${row.code}. Các dự án đã tạo dùng template này sẽ KHÔNG bị xóa tasks. Chỉ ảnh hưởng dự án tạo MỚI.`,
    );
    if (!ok) return;

    const res = await fetch(`/api/admin/templates/${row.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Xóa thất bại");
      return;
    }

    toast.success(json.message || "Đã xóa mềm template");
    await loadRows();
  }

  async function restoreTemplate(row: TemplateItem) {
    const payload = {
      ...toPayload(toFormValue(row)),
      isActive: true,
    };

    const res = await fetch(`/api/admin/templates/${row.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Khôi phục thất bại");
      return;
    }

    toast.success("Đã khôi phục template");
    await loadRows();
  }

  async function previewImport() {
    if (!importFile) {
      toast.error("Vui lòng chọn CSV trước");
      return;
    }

    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("mode", "preview");

    const res = await fetch("/api/admin/templates/import", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Preview import thất bại");
      return;
    }

    setPreviewRows(json.preview || []);
    toast.success(`Preview ${json.total || 0} dòng`);
  }

  async function confirmImport() {
    if (!importFile) {
      toast.error("Vui lòng chọn CSV trước");
      return;
    }

    setImporting(true);
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("mode", "confirm");

    const res = await fetch("/api/admin/templates/import", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setImporting(false);

    if (!res.ok) {
      toast.error(json.message || "Import thất bại");
      return;
    }

    toast.success(json.message || "Import thành công");
    setPreviewRows([]);
    setImportFile(null);
    await loadRows();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[#f0f2ff]">Quản lý task templates</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openCreate}>
            Thêm template mới
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm">Template category</label>
            <select
              className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled
            >
              <option value="nha_pho_1t1l">Nhà phố 1T1L</option>
            </select>
          </div>

          <label className="mt-7 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Hiển thị template đã xóa
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-[#2d3249] bg-[#13151f] border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          Mẫu công tác này dùng khi tạo dự án mới. Sửa KHÔNG ảnh hưởng các dự án đã tạo.
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <h2 className="mb-2 font-semibold">Import từ CSV</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
          />
          <Button variant="outline" onClick={previewImport}>
            Preview import
          </Button>
          <Button onClick={confirmImport} disabled={importing} className="bg-[#f97316] text-black hover:bg-[#fb923c]">
            {importing ? "Đang import..." : "Confirm import"}
          </Button>
        </div>

        {previewRows.length ? (
          <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-[#2d3249] bg-[#13151f]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#252840] bg-[#171a27] text-left">
                  <th className="px-2 py-1">Action</th>
                  <th className="px-2 py-1">Code</th>
                  <th className="px-2 py-1">Phase</th>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Order</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, idx) => (
                  <tr key={`${r.code}-${idx}`} className="border-b border-[#252840] last:border-0">
                    <td className="px-2 py-1">{r.action}</td>
                    <td className="px-2 py-1">{r.code}</td>
                    <td className="px-2 py-1">{r.phase}</td>
                    <td className="px-2 py-1">{r.name}</td>
                    <td className="px-2 py-1">{r.displayOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#252840] bg-[#171a27] text-[#8892b0]">
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Mã</th>
                <th className="px-3 py-2">Giai đoạn</th>
                <th className="px-3 py-2">Tên công tác</th>
                <th className="px-3 py-2">Offset</th>
                <th className="px-3 py-2">Số ngày</th>
                <th className="px-3 py-2">Đội</th>
                <th className="px-3 py-2">Nghiệm thu</th>
                <th className="px-3 py-2">Milestone</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#8892b0]" colSpan={10}>
                    Đang tải...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#8892b0]" colSpan={10}>
                    Không có template.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[#252840] ${row.isMilestone ? "bg-red-50" : ""} ${!row.isActive ? "opacity-60" : ""}`}
                  >
                    <td className="px-3 py-2">{row.displayOrder}</td>
                    <td className="px-3 py-2 font-medium">{row.code}</td>
                    <td className="px-3 py-2">
                      <span className="rounded px-2 py-1 text-xs" style={{ backgroundColor: PHASE_COLOR[row.phase] }}>
                        {PHASE_LABEL[row.phase]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.defaultOffsetDays}</td>
                    <td className="px-3 py-2">{row.defaultDurationDays}</td>
                    <td className="px-3 py-2">{row.defaultTeam}</td>
                    <td className="px-3 py-2">{row.defaultInspector}</td>
                    <td className="px-3 py-2">{row.isMilestone ? "✅" : "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => openEdit(row)}>
                          Sửa
                        </Button>
                        {row.isActive ? (
                          <Button variant="outline" onClick={() => deleteTemplate(row)}>
                            Xóa
                          </Button>
                        ) : (
                          <Button variant="outline" onClick={() => restoreTemplate(row)}>
                            Khôi phục
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing || creating ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <h3 className="mb-2 text-lg font-semibold">{creating ? "Thêm template mới" : "Sửa template"}</h3>
            <div className="mb-3 rounded-xl border border-[#2d3249] bg-[#13151f] border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">
              ⚠️ Thay đổi template CHỈ áp dụng cho dự án TẠO MỚI sau khi sửa. Dự án hiện tại KHÔNG bị ảnh hưởng.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm">Mã</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.code}
                  disabled={!creating}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Giai đoạn</label>
                <select
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.phase}
                  onChange={(e) => setForm((p) => ({ ...p, phase: e.target.value as TaskPhase }))}
                >
                  {Object.entries(PHASE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm">Tên công tác</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Default offset days</label>
                <input
                  type="number"
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.defaultOffsetDays}
                  onChange={(e) => setForm((p) => ({ ...p, defaultOffsetDays: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Default duration days</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.defaultDurationDays}
                  onChange={(e) => setForm((p) => ({ ...p, defaultDurationDays: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Đội</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.defaultTeam}
                  onChange={(e) => setForm((p) => ({ ...p, defaultTeam: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Nghiệm thu</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.defaultInspector}
                  onChange={(e) => setForm((p) => ({ ...p, defaultInspector: e.target.value }))}
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm">Materials needed</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.materialsNeeded}
                  onChange={(e) => setForm((p) => ({ ...p, materialsNeeded: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Proposer role</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.proposerRole}
                  onChange={(e) => setForm((p) => ({ ...p, proposerRole: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Orderer role</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.ordererRole}
                  onChange={(e) => setForm((p) => ({ ...p, ordererRole: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Receiver role</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.receiverRole}
                  onChange={(e) => setForm((p) => ({ ...p, receiverRole: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Display order</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.displayOrder}
                  onChange={(e) => setForm((p) => ({ ...p, displayOrder: e.target.value }))}
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm">QC checklist</label>
                <textarea
                  rows={4}
                  placeholder="Mỗi dòng 1 mục, bắt đầu bằng • "
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.qcChecklist}
                  onChange={(e) => setForm((p) => ({ ...p, qcChecklist: e.target.value }))}
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isMilestone}
                  onChange={(e) => setForm((p) => ({ ...p, isMilestone: e.target.checked }))}
                />
                Is milestone
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={closeModal}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={saveTemplate} disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
