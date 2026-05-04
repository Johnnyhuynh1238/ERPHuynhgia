"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type TaskCategory = "normal" | "internal_milestone" | "major_milestone";

type QcItem = {
  id: string;
  displayOrder: number;
  title: string;
  description: string | null;
  requirePhoto: boolean;
};

type QcTemplate = {
  id: string;
  preparationSteps: string | null;
  executionSteps: string | null;
  commonMistakes: string | null;
  beforeQcSteps: string | null;
  qcItems: QcItem[];
};

type TemplateItem = {
  id: string;
  code: string;
  name: string;
  phaseCode: string;
  phaseName: string;
  phaseOrder: number;
  duration: number;
  displayOrder: number;
  category: TaskCategory;
  isActive: boolean;
  templateCategory: string;
  qcTemplate: QcTemplate | null;
};

type CloneState = {
  source: TemplateItem;
  code: string;
  name: string;
  phaseCode: string;
};

const DEFAULT_CATEGORY = "nha_pho_1t1l";

const CATEGORY_CHIPS: Array<{ value: "all" | TaskCategory; label: string }> = [
  { value: "all", label: "Tất cả loại" },
  { value: "normal", label: "Thường" },
  { value: "internal_milestone", label: "Internal" },
  { value: "major_milestone", label: "Major ⭐" },
];

const CATEGORY_LABEL: Record<TaskCategory, string> = {
  normal: "Thường",
  internal_milestone: "Internal",
  major_milestone: "Major",
};

const CARD_ACCENT: Record<TaskCategory, string> = {
  normal: "border-l-[#6b7280]",
  internal_milestone: "border-l-[#3b82f6]",
  major_milestone: "border-l-[#ff8a3d]",
};

const BADGE_CLASS: Record<TaskCategory, string> = {
  normal: "bg-[#2a2a2a] text-[#aaa]",
  internal_milestone: "bg-[#1a3a5a] text-[#60a5fa]",
  major_milestone: "bg-[#2a1a05] text-[#ff8a3d]",
};

export function AdminTemplatesClient() {
  const [rows, setRows] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | TaskCategory>("all");

  const [cloneModal, setCloneModal] = useState<CloneState | null>(null);
  const [cloneSaving, setCloneSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TemplateItem | null>(null);
  const [deleteConfirmCode, setDeleteConfirmCode] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function loadRows() {
    setLoading(true);
    const query = new URLSearchParams({
      category: DEFAULT_CATEGORY,
      includeInactive: includeInactive ? "1" : "0",
    });

    if (search.trim()) query.set("q", search.trim());
    if (phaseFilter !== "all") query.set("phaseCode", phaseFilter);
    if (categoryFilter !== "all") query.set("taskCategory", categoryFilter);

    const res = await fetch(`/api/admin/templates?${query.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được templates");
      return;
    }

    setRows((json.templates || []) as TemplateItem[]);
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive, phaseFilter, categoryFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRows();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const phaseChips = useMemo(() => {
    const map = new Map<string, { code: string; name: string; order: number }>();
    rows.forEach((row) => {
      if (!map.has(row.phaseCode)) {
        map.set(row.phaseCode, {
          code: row.phaseCode,
          name: row.phaseName,
          order: row.phaseOrder,
        });
      }
    });
    return [{ code: "all", name: "Tất cả phase", order: 0 }, ...Array.from(map.values()).sort((a, b) => a.order - b.order)];
  }, [rows]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, { code: string; name: string; order: number; rows: TemplateItem[] }>();

    rows.forEach((row) => {
      const key = row.phaseCode;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          code: row.phaseCode,
          name: row.phaseName,
          order: row.phaseOrder,
          rows: [row],
        });
      } else {
        existing.rows.push(row);
      }
    });

    return Array.from(groups.values())
      .sort((a, b) => a.order - b.order)
      .map((group) => ({
        ...group,
        rows: group.rows.sort((a, b) => (a.displayOrder - b.displayOrder) || a.code.localeCompare(b.code, "vi", { numeric: true })),
      }));
  }, [rows]);

  async function restoreTemplate(row: TemplateItem) {
    const res = await fetch(`/api/admin/templates/${row.id}/restore`, { method: "POST" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Khôi phục thất bại");
      return;
    }

    toast.success("Đã khôi phục template");
    await loadRows();
  }

  async function submitClone() {
    if (!cloneModal) return;
    if (!cloneModal.code.trim() || !cloneModal.name.trim()) {
      toast.error("Vui lòng nhập mã và tên task mới");
      return;
    }

    setCloneSaving(true);
    const res = await fetch(`/api/admin/templates/${cloneModal.source.id}/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: cloneModal.code.trim(),
        name: cloneModal.name.trim(),
        phaseCode: cloneModal.phaseCode,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setCloneSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Clone thất bại");
      return;
    }

    toast.success("Đã clone template");
    setCloneModal(null);
    await loadRows();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteConfirmCode.trim() !== deleteTarget.code) {
      toast.error(`Nhập đúng mã ${deleteTarget.code} để xác nhận`);
      return;
    }

    setDeleting(true);
    const res = await fetch(`/api/admin/templates/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmCode: deleteConfirmCode.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setDeleting(false);

    if (!res.ok) {
      toast.error(json.message || "Xóa thất bại");
      return;
    }

    toast.success(json.message || "Đã xóa template");
    setDeleteTarget(null);
    setDeleteConfirmCode("");
    await loadRows();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[#f0f2ff]">📚 Thư viện Task Template</h1>
        <Link href="/admin/templates/new">
          <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]">+ Tạo</Button>
        </Link>
      </div>

      <div className="rounded-xl bg-[#1a1a1a] px-3 py-2.5 text-sm text-[#e5e5e5]">
        <div className="flex items-center gap-2">
          <span>🔍</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm task..."
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
                {chip.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {CATEGORY_CHIPS.map((chip) => {
            const active = categoryFilter === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setCategoryFilter(chip.value)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  active
                    ? "border-[#f97316] bg-[#f97316] text-black"
                    : "border-[#2a2a2a] bg-[#1a1a1a] text-[#aaa]"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-[#9ca3af]">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(event) => setIncludeInactive(event.target.checked)}
        />
        Hiển thị template đã xóa mềm
      </label>

      {loading ? <div className="text-sm text-[#9ca3af]">Đang tải template...</div> : null}

      {!loading && groupedRows.length === 0 ? (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#171717] p-4 text-sm text-[#9ca3af]">
          Không có template phù hợp bộ lọc.
        </div>
      ) : null}

      {groupedRows.map((group) => (
        <div key={group.code} className="space-y-2">
          <div className="border-b border-[#2a2a2a] pb-1 text-xs font-semibold text-[#f97316]">
            ━━━━ {group.code} - {group.name.toUpperCase()} ({group.rows.length} task) ━━━━
          </div>

          {group.rows.map((row) => {
            const qcItems = row.qcTemplate?.qcItems || [];
            const photoRequired = qcItems.filter((item) => item.requirePhoto).length;

            return (
              <div
                key={row.id}
                className={`rounded-xl border border-[#232323] border-l-4 bg-[#1a1a1a] p-3 ${CARD_ACCENT[row.category]} ${
                  row.isActive ? "" : "opacity-60"
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#888]">{row.code}</div>
                    <div className="text-sm font-semibold text-[#f3f4f6]">{row.name}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${BADGE_CLASS[row.category]}`}>
                    {CATEGORY_LABEL[row.category]}
                  </span>
                </div>

                <div className="mb-2 flex flex-wrap gap-3 text-xs text-[#9ca3af]">
                  <span>⏱ {row.duration} ngày</span>
                  <span>✅ {qcItems.length} tiêu chí</span>
                  <span>📷 {photoRequired} ảnh</span>
                </div>

                {row.category === "major_milestone" ? (
                  <div className="mb-2 text-[11px] text-[#f59e0b]">⭐ Cần TPTC duyệt + chủ nhà ký</div>
                ) : null}

                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[#2a2a2a] pt-2">
                  <Link href={`/admin/templates/${row.id}`}>
                    <Button variant="outline" className="h-8 w-full border-[#303030] bg-[#2a2a2a] text-xs text-[#d4d4d4]">
                      Sửa
                    </Button>
                  </Link>

                  <Button
                    variant="outline"
                    className="h-8 border-[#303030] bg-[#2a2a2a] text-xs text-[#d4d4d4]"
                    onClick={() =>
                      setCloneModal({
                        source: row,
                        code: "",
                        name: `${row.name} (bản sao)`,
                        phaseCode: row.phaseCode,
                      })
                    }
                  >
                    Clone
                  </Button>

                  {row.isActive ? (
                    <Button
                      variant="outline"
                      className="h-8 border-[#4a1a1a] bg-[#2a2a2a] text-xs text-red-400"
                      onClick={() => {
                        setDeleteTarget(row);
                        setDeleteConfirmCode("");
                      }}
                    >
                      Xóa
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="h-8 border-[#1f3f2d] bg-[#2a2a2a] text-xs text-emerald-400"
                      onClick={() => restoreTemplate(row)}
                    >
                      Khôi phục
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {cloneModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3">
          <div className="w-full max-w-md rounded-xl border border-[#2f3555] bg-[#1a1d2e] p-4">
            <div className="mb-3 text-sm font-semibold text-[#f0f2ff]">🔄 Clone từ {cloneModal.source.code} {cloneModal.source.name}</div>
            <div className="mb-3 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-300">
              Template mới sẽ copy toàn bộ thông tin cơ bản + QC template + checklist items.
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#9ca3af]">Mã task mới *</label>
                <input
                  className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
                  value={cloneModal.code}
                  onChange={(event) => setCloneModal((prev) => (prev ? { ...prev, code: event.target.value } : prev))}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#9ca3af]">Tên task mới *</label>
                <input
                  className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
                  value={cloneModal.name}
                  onChange={(event) => setCloneModal((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#9ca3af]">Phase *</label>
                <select
                  className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
                  value={cloneModal.phaseCode}
                  onChange={(event) => setCloneModal((prev) => (prev ? { ...prev, phaseCode: event.target.value } : prev))}
                >
                  {phaseChips
                    .filter((item) => item.code !== "all")
                    .map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.code} - {item.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setCloneModal(null)} disabled={cloneSaving}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitClone} disabled={cloneSaving}>
                {cloneSaving ? "Đang clone..." : "Clone"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3">
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-[#1a1d2e] p-4">
            <div className="mb-2 text-sm font-semibold text-red-300">⚠ Xác nhận xóa {deleteTarget.code} {deleteTarget.name}</div>
            <div className="mb-3 text-xs text-[#d1d5db]">
              Task trong dự án đã tạo sẽ không bị xóa, nhưng sẽ tách khỏi template này.
            </div>
            <div className="mb-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">
              Nhập <b>{deleteTarget.code}</b> để xác nhận xóa mềm template.
            </div>
            <input
              className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
              value={deleteConfirmCode}
              onChange={(event) => setDeleteConfirmCode(event.target.value)}
              placeholder={deleteTarget.code}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmCode("");
                }}
                disabled={deleting}
              >
                Hủy
              </Button>
              <Button className="bg-red-500 text-white hover:bg-red-600" onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Đang xóa..." : "Xóa"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
