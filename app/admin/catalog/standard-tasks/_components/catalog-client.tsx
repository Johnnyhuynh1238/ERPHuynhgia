"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  phaseCode: string;
  taskCode: string;
  phaseName: string;
  taskName: string;
  groupLabel: string | null;
  note: string | null;
  isHoldPoint: boolean;
  displayOrder: number;
  retiredAt: string | null;
  defaultTeam: string | null;
  defaultInspector: string | null;
  defaultOffsetDays: number | null;
  defaultDurationDays: number | null;
  materialsNeeded: string | null;
  qcChecklist: string | null;
  proposerRole: string | null;
  ordererRole: string | null;
  receiverRole: string | null;
};

type EditState = {
  row: Row;
  defaultTeam: string;
  defaultInspector: string;
  defaultOffsetDays: string;
  defaultDurationDays: string;
  materialsNeeded: string;
  qcChecklist: string;
  proposerRole: string;
  ordererRole: string;
  receiverRole: string;
  note: string;
};

function nullToEmpty(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function CatalogClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeRetired, setIncludeRetired] = useState(false);
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const query = includeRetired ? "?includeRetired=1" : "";
    const res = await fetch(`/api/admin/catalog/standard-tasks${query}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast.error(json.message || "Không tải được catalog");
      return;
    }
    setRows((json.rows || []) as Row[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeRetired]);

  const phaseChips = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    rows.forEach((row) => {
      if (!map.has(row.phaseCode)) map.set(row.phaseCode, { code: row.phaseCode, name: row.phaseName });
    });
    return [{ code: "all", name: "Tất cả GĐ" }, ...Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code))];
  }, [rows]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = rows.filter((row) => {
      if (phaseFilter !== "all" && row.phaseCode !== phaseFilter) return false;
      if (!term) return true;
      return (
        row.taskCode.toLowerCase().includes(term) ||
        row.taskName.toLowerCase().includes(term) ||
        `${row.phaseCode}-${row.taskCode}`.toLowerCase().includes(term)
      );
    });

    const groups = new Map<string, { code: string; name: string; rows: Row[] }>();
    matched.forEach((row) => {
      const existing = groups.get(row.phaseCode);
      if (!existing) {
        groups.set(row.phaseCode, { code: row.phaseCode, name: row.phaseName, rows: [row] });
      } else {
        existing.rows.push(row);
      }
    });
    return Array.from(groups.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [rows, search, phaseFilter]);

  async function toggleRetire(row: Row) {
    const willRetire = !row.retiredAt;
    if (willRetire && !confirm(`Retire ${row.phaseCode}-${row.taskCode} "${row.taskName}"? Mã giữ vĩnh viễn, không tái sử dụng.`)) {
      return;
    }
    const res = await fetch(`/api/admin/catalog/standard-tasks/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retired: willRetire }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Cập nhật thất bại");
      return;
    }
    toast.success(willRetire ? "Đã retire" : "Đã khôi phục");
    load();
  }

  function openEdit(row: Row) {
    setEdit({
      row,
      defaultTeam: nullToEmpty(row.defaultTeam),
      defaultInspector: nullToEmpty(row.defaultInspector),
      defaultOffsetDays: nullToEmpty(row.defaultOffsetDays),
      defaultDurationDays: nullToEmpty(row.defaultDurationDays),
      materialsNeeded: nullToEmpty(row.materialsNeeded),
      qcChecklist: nullToEmpty(row.qcChecklist),
      proposerRole: nullToEmpty(row.proposerRole),
      ordererRole: nullToEmpty(row.ordererRole),
      receiverRole: nullToEmpty(row.receiverRole),
      note: nullToEmpty(row.note),
    });
  }

  async function saveEdit() {
    if (!edit) return;
    const offset = edit.defaultOffsetDays.trim();
    const duration = edit.defaultDurationDays.trim();
    const payload: Record<string, unknown> = {
      defaultTeam: edit.defaultTeam.trim() || null,
      defaultInspector: edit.defaultInspector.trim() || null,
      defaultOffsetDays: offset === "" ? null : Number(offset),
      defaultDurationDays: duration === "" ? null : Number(duration),
      materialsNeeded: edit.materialsNeeded.trim() || null,
      qcChecklist: edit.qcChecklist.trim() || null,
      proposerRole: edit.proposerRole.trim() || null,
      ordererRole: edit.ordererRole.trim() || null,
      receiverRole: edit.receiverRole.trim() || null,
      note: edit.note.trim() || null,
    };
    setSaving(true);
    const res = await fetch(`/api/admin/catalog/standard-tasks/${edit.row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Lưu thất bại");
      return;
    }
    toast.success("Đã lưu");
    setEdit(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#f0f2ff]">📖 Danh mục công tác chuẩn — Nhà phố</h1>
          <p className="text-xs text-[#9ca3af] mt-1">9 giai đoạn, mã GĐ-CT giữ vĩnh viễn. TPTC fill dần default fields cho mỗi công tác.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[#aaa]">
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(event) => setIncludeRetired(event.target.checked)}
            className="accent-[#f97316]"
          />
          Hiện công tác đã retire
        </label>
      </div>

      <div className="rounded-xl bg-[#1a1a1a] px-3 py-2.5 text-sm text-[#e5e5e5]">
        <div className="flex items-center gap-2">
          <span>🔍</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo mã hoặc tên công tác…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[#7d7d7d]"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {phaseChips.map((chip) => {
            const active = phaseFilter === chip.code;
            return (
              <button
                key={chip.code}
                type="button"
                onClick={() => setPhaseFilter(chip.code)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  active
                    ? "border-[#f97316] bg-[#f97316] text-black"
                    : "border-[#2a2a2a] bg-[#1a1a1a] text-[#aaa]"
                }`}
              >
                {chip.code === "all" ? chip.name : `${chip.code} — ${chip.name}`}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-[#aaa] py-8">Đang tải…</div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center text-[#aaa] py-8">Không có công tác nào khớp</div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
            <section key={group.code}>
              <h2 className="text-sm font-semibold text-[#e0b855] mb-2">
                GĐ {group.code} — {group.name} <span className="text-[#7d7d7d] font-normal">({group.rows.length})</span>
              </h2>
              <div className="overflow-x-auto rounded-xl border border-[#2a2a2a]">
                <table className="w-full text-xs">
                  <thead className="bg-[#1a1a1a] text-[#9ca3af]">
                    <tr>
                      <th className="px-2 py-2 text-left w-20">Mã</th>
                      <th className="px-2 py-2 text-left">Tên công tác</th>
                      <th className="px-2 py-2 text-left w-32">Default team</th>
                      <th className="px-2 py-2 text-center w-12">Off</th>
                      <th className="px-2 py-2 text-center w-12">Dur</th>
                      <th className="px-2 py-2 text-center w-16">Hold</th>
                      <th className="px-2 py-2 text-right w-32">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const isRetired = !!row.retiredAt;
                      return (
                        <tr
                          key={row.id}
                          className={`border-t border-[#2a2a2a] ${isRetired ? "opacity-50 line-through" : ""}`}
                        >
                          <td className="px-2 py-2 font-mono text-[#e0b855]">
                            {row.phaseCode}-{row.taskCode}
                          </td>
                          <td className="px-2 py-2 text-[#e5e5e5]">
                            {row.taskName}
                            {row.groupLabel ? (
                              <span className="ml-2 text-[10px] text-[#7d7d7d]">[{row.groupLabel}]</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-[#aaa]">{row.defaultTeam || <span className="text-[#7d7d7d]">—</span>}</td>
                          <td className="px-2 py-2 text-center text-[#aaa]">
                            {row.defaultOffsetDays ?? <span className="text-[#7d7d7d]">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center text-[#aaa]">
                            {row.defaultDurationDays ?? <span className="text-[#7d7d7d]">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {row.isHoldPoint ? <span className="text-[#dc2626] font-bold">●</span> : null}
                          </td>
                          <td className="px-2 py-2 text-right space-x-1">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              className="text-[10px] px-2 py-1 rounded border border-[#2a2a2a] text-[#aaa] hover:border-[#f97316] hover:text-[#f97316]"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleRetire(row)}
                              className="text-[10px] px-2 py-1 rounded border border-[#2a2a2a] text-[#aaa] hover:border-[#dc2626] hover:text-[#dc2626]"
                            >
                              {isRetired ? "Khôi phục" : "Retire"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
          <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#0d0d0d] border-b border-[#2a2a2a] px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-[#7d7d7d]">Sửa default fields</div>
                <div className="font-mono text-[#e0b855] text-sm">
                  {edit.row.phaseCode}-{edit.row.taskCode}
                </div>
                <div className="text-sm text-[#e5e5e5]">{edit.row.taskName}</div>
              </div>
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="text-[#aaa] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <Field label="Default team (Nhóm thợ mặc định)">
                <input
                  value={edit.defaultTeam}
                  onChange={(event) => setEdit({ ...edit, defaultTeam: event.target.value })}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                />
              </Field>
              <Field label="Default inspector (Người kiểm tra mặc định)">
                <input
                  value={edit.defaultInspector}
                  onChange={(event) => setEdit({ ...edit, defaultInspector: event.target.value })}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Offset days (ngày bắt đầu sau task trước)">
                  <input
                    type="number"
                    value={edit.defaultOffsetDays}
                    onChange={(event) => setEdit({ ...edit, defaultOffsetDays: event.target.value })}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                  />
                </Field>
                <Field label="Duration days (số ngày làm)">
                  <input
                    type="number"
                    value={edit.defaultDurationDays}
                    onChange={(event) => setEdit({ ...edit, defaultDurationDays: event.target.value })}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                  />
                </Field>
              </div>
              <Field label="Vật tư cần (materialsNeeded)">
                <textarea
                  value={edit.materialsNeeded}
                  onChange={(event) => setEdit({ ...edit, materialsNeeded: event.target.value })}
                  rows={2}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                />
              </Field>
              <Field label="QC checklist (mỗi mục 1 dòng)">
                <textarea
                  value={edit.qcChecklist}
                  onChange={(event) => setEdit({ ...edit, qcChecklist: event.target.value })}
                  rows={3}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Proposer">
                  <input
                    value={edit.proposerRole}
                    onChange={(event) => setEdit({ ...edit, proposerRole: event.target.value })}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                  />
                </Field>
                <Field label="Orderer">
                  <input
                    value={edit.ordererRole}
                    onChange={(event) => setEdit({ ...edit, ordererRole: event.target.value })}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                  />
                </Field>
                <Field label="Receiver">
                  <input
                    value={edit.receiverRole}
                    onChange={(event) => setEdit({ ...edit, receiverRole: event.target.value })}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                  />
                </Field>
              </div>
              <Field label="Ghi chú">
                <textarea
                  value={edit.note}
                  onChange={(event) => setEdit({ ...edit, note: event.target.value })}
                  rows={2}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#e5e5e5]"
                />
              </Field>
            </div>

            <div className="sticky bottom-0 bg-[#0d0d0d] border-t border-[#2a2a2a] px-4 py-3 flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setEdit(null)}
                className="bg-[#1a1a1a] text-[#aaa] border border-[#2a2a2a] hover:bg-[#2a2a2a]"
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="bg-[#f97316] text-black hover:bg-[#fb923c]"
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-[#7d7d7d]">{label}</div>
      {children}
    </label>
  );
}
