"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Specialty = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
};

type FormState = {
  code: string;
  name: string;
  description: string;
  icon: string;
};

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  description: "",
  icon: "",
};

function SortableRow({ item, onEdit, onDelete }: { item: Specialty; onEdit: (item: Specialty) => void; onDelete: (item: Specialty) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-3"
    >
      <div className="flex items-center gap-3">
        <button type="button" className="rounded-lg border border-[#2d3249] bg-[#13151f] p-2 text-[#8892b0]" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">{item.icon || "🛠️"}</span>
            <div>
              <p className="text-sm font-semibold text-[#f0f2ff]">{item.name}</p>
              <p className="text-xs text-[#8892b0]">{item.code}</p>
            </div>
          </div>
          {item.description ? <p className="mt-2 text-xs text-[#a4acc8]">{item.description}</p> : null}
        </div>

        <span className={`rounded-full px-2 py-1 text-[11px] ${item.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-zinc-300"}`}>
          {item.isActive ? "Hoạt động" : "Ngưng"}
        </span>

        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDelete(item)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AdminSpecialtiesClient({ canWrite }: { canWrite: boolean }) {
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [rows, setRows] = useState<Specialty[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<Specialty | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function loadData() {
    setLoading(true);
    const qs = new URLSearchParams({ includeInactive: includeInactive ? "1" : "0" });
    const res = await fetch(`/api/specialties?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được danh sách chuyên môn");
      return;
    }

    setRows(json.specialties || []);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  const ids = useMemo(() => rows.map((r) => r.id), [rows]);

  async function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id || !canWrite) return;

    const oldIndex = rows.findIndex((x) => x.id === active.id);
    const newIndex = rows.findIndex((x) => x.id === over.id);

    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);

    setSavingOrder(true);
    const res = await fetch("/api/specialties/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((x) => x.id) }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingOrder(false);

    if (!res.ok) {
      toast.error(json.message || "Cập nhật thứ tự thất bại");
      await loadData();
      return;
    }

    toast.success("Đã cập nhật thứ tự chuyên môn");
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpenModal(true);
  }

  function openEdit(item: Specialty) {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.name,
      description: item.description || "",
      icon: item.icon || "",
    });
    setOpenModal(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!canWrite) return;

    setSubmitting(true);

    const payload = {
      ...(editing ? {} : { code: form.code.trim().toLowerCase() }),
      name: form.name.trim(),
      description: form.description.trim() || null,
      icon: form.icon.trim() || null,
    };

    const res = await fetch(editing ? `/api/specialties/${editing.id}` : "/api/specialties", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      toast.error(json.message || "Lưu chuyên môn thất bại");
      return;
    }

    toast.success(json.message || "Đã lưu chuyên môn");
    setOpenModal(false);
    await loadData();
  }

  async function handleDelete(item: Specialty) {
    if (!canWrite) return;
    const ok = await confirmDialog(`Xóa chuyên môn ${item.name}?`);
    if (!ok) return;

    const res = await fetch(`/api/specialties/${item.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Xóa chuyên môn thất bại");
      return;
    }

    toast.success(json.message || "Đã xóa chuyên môn");
    await loadData();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-[#f0f2ff]">Quản lý chuyên môn thầu phụ</h1>
          {canWrite ? (
            <Button onClick={openCreate} className="bg-[#f97316] text-black hover:bg-[#fb923c]">
              <Plus className="mr-1 h-4 w-4" /> Thêm
            </Button>
          ) : null}
        </div>

        <label className="mt-3 inline-flex items-center gap-2 text-sm text-[#a4acc8]">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Hiển thị mục đã ngưng hoạt động
        </label>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        {loading ? (
          <div className="p-6 text-center text-sm text-[#8892b0]">Đang tải dữ liệu...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#8892b0]">Chưa có chuyên môn nào.</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {rows.map((item) => (
                  <SortableRow key={item.id} item={item} onEdit={openEdit} onDelete={handleDelete} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {savingOrder ? <p className="mt-2 text-xs text-[#8892b0]">Đang lưu thứ tự...</p> : null}
      </div>

      {openModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-lg rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 slide-up">
            <h2 className="mb-4 text-lg font-semibold text-[#f0f2ff]">{editing ? "Sửa chuyên môn" : "Thêm chuyên môn"}</h2>

            <form className="space-y-3" onSubmit={submitForm}>
              {!editing ? (
                <div>
                  <label className="mb-1 block text-sm text-[#a4acc8]">Mã</label>
                  <input
                    className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                    value={form.code}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                    required
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm text-[#a4acc8]">Tên</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#a4acc8]">Icon (emoji)</label>
                <input
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.icon}
                  onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-[#a4acc8]">Mô tả</label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                  Hủy
                </Button>
                <Button type="submit" className="bg-[#f97316] text-black hover:bg-[#fb923c]" disabled={submitting}>
                  {submitting ? "Đang lưu..." : "Lưu"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
