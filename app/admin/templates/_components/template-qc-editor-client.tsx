"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type TemplateInfo = {
  id: string;
  code: string;
  name: string;
};

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

type ItemDraft = {
  key: string;
  title: string;
  description: string;
  requirePhoto: boolean;
};

const EMPTY_SECTIONS = {
  preparationSteps: "",
  executionSteps: "",
  commonMistakes: "",
  beforeQcSteps: "",
};

export function TemplateQcEditorClient({ templateId }: { templateId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [template, setTemplate] = useState<TemplateInfo | null>(null);
  const [qcTemplateId, setQcTemplateId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tasks" | "checklist">("tasks");

  const [sections, setSections] = useState(EMPTY_SECTIONS);
  const [items, setItems] = useState<ItemDraft[]>([]);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemDraft, setItemDraft] = useState({ title: "", description: "", requirePhoto: false });

  useEffect(() => {
    let stop = false;

    const run = async () => {
      setLoading(true);
      const [templateRes, qcRes] = await Promise.all([
        fetch(`/api/admin/templates/${templateId}`, { cache: "no-store" }),
        fetch(`/api/admin/templates/${templateId}/qc`, { cache: "no-store" }),
      ]);

      const templateJson = await templateRes.json().catch(() => ({}));
      const qcJson = await qcRes.json().catch(() => ({}));

      setLoading(false);

      if (!templateRes.ok) {
        toast.error(templateJson.message || "Không tải được template");
        router.push("/admin/templates");
        return;
      }

      if (!qcRes.ok) {
        toast.error(qcJson.message || "Không tải được QC template");
        router.push("/admin/templates");
        return;
      }

      if (stop) return;

      const info = templateJson.template as TemplateInfo;
      const qcTemplate = (qcJson.qcTemplate || null) as QcTemplate | null;

      setTemplate(info);
      setQcTemplateId(qcTemplate?.id || null);
      setSections({
        preparationSteps: qcTemplate?.preparationSteps || "",
        executionSteps: qcTemplate?.executionSteps || "",
        commonMistakes: qcTemplate?.commonMistakes || "",
        beforeQcSteps: qcTemplate?.beforeQcSteps || "",
      });
      setItems(
        (qcTemplate?.qcItems || []).map((item) => ({
          key: item.id,
          title: item.title,
          description: item.description || "",
          requirePhoto: item.requirePhoto,
        })),
      );
    };

    run();
    return () => {
      stop = true;
    };
  }, [templateId, router]);

  const itemCount = items.length;

  const canSave = useMemo(() => {
    if (items.length < 1 || items.length > 15) return false;
    return items.every((item) => item.title.trim().length > 0);
  }, [items]);

  function openCreateItem() {
    if (items.length >= 15) {
      toast.error("Tối đa 15 tiêu chí QC");
      return;
    }
    setEditingIndex(null);
    setItemDraft({ title: "", description: "", requirePhoto: false });
    setItemModalOpen(true);
  }

  function openEditItem(index: number) {
    const item = items[index];
    setEditingIndex(index);
    setItemDraft({
      title: item.title,
      description: item.description,
      requirePhoto: item.requirePhoto,
    });
    setItemModalOpen(true);
  }

  function saveItemDraft() {
    if (!itemDraft.title.trim()) {
      toast.error("Tên tiêu chí là bắt buộc");
      return;
    }

    const nextItem: ItemDraft = {
      key: editingIndex === null ? `tmp_${Date.now()}` : items[editingIndex].key,
      title: itemDraft.title.trim(),
      description: itemDraft.description.trim(),
      requirePhoto: itemDraft.requirePhoto,
    };

    setItems((prev) => {
      if (editingIndex === null) {
        return [...prev, nextItem];
      }
      return prev.map((item, idx) => (idx === editingIndex ? nextItem : item));
    });

    setItemModalOpen(false);
    setEditingIndex(null);
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    setItems((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function upsertQcTemplate(successMessage: string) {
    if (!canSave) {
      toast.error("Checklist cần từ 1 đến 15 tiêu chí và mỗi tiêu chí phải có tên");
      return;
    }

    setSaving(true);
    const payload = {
      preparationSteps: sections.preparationSteps.trim() || null,
      executionSteps: sections.executionSteps.trim() || null,
      commonMistakes: sections.commonMistakes.trim() || null,
      beforeQcSteps: sections.beforeQcSteps.trim() || null,
      items: items.map((item, idx) => ({
        displayOrder: idx + 1,
        title: item.title.trim(),
        description: item.description.trim() || null,
        requirePhoto: item.requirePhoto,
      })),
    };

    const method = qcTemplateId ? "PATCH" : "POST";
    const res = await fetch(`/api/admin/templates/${templateId}/qc`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Lưu QC template thất bại");
      return;
    }

    const qc = json.qcTemplate as QcTemplate;
    setQcTemplateId(qc.id);
    setItems(
      qc.qcItems.map((item) => ({
        key: item.id,
        title: item.title,
        description: item.description || "",
        requirePhoto: item.requirePhoto,
      })),
    );
    toast.success(successMessage);
  }

  if (loading) {
    return <div className="text-sm text-[#98a0c2]">Đang tải QC template...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#f0f2ff]">
          ← QC - {template?.code} {template?.name}
        </h1>
        <a href={`/admin/templates/${templateId}`} className="text-xs font-semibold text-[#f97316]">
          Về task
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("tasks")}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            activeTab === "tasks" ? "bg-[#f97316] text-black" : "bg-[#2a2a2a] text-[#aaa]"
          }`}
        >
          📋 Nhiệm vụ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("checklist")}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            activeTab === "checklist" ? "bg-[#f97316] text-black" : "bg-[#2a2a2a] text-[#aaa]"
          }`}
        >
          ✅ Checklist ({itemCount})
        </button>
      </div>

      {activeTab === "tasks" ? (
        <div className="space-y-3">
          <div className="rounded-lg border-l-4 border-[#f97316] bg-[#2a1a05] p-3 text-xs text-[#f7c58a]">
            Markdown đơn giản: dùng • cho bullet, **text** cho in đậm.
          </div>

          <MarkdownSection
            title="🟦 CHUẨN BỊ"
            value={sections.preparationSteps}
            onChange={(value) => setSections((prev) => ({ ...prev, preparationSteps: value }))}
          />
          <MarkdownSection
            title="🟩 THI CÔNG"
            value={sections.executionSteps}
            onChange={(value) => setSections((prev) => ({ ...prev, executionSteps: value }))}
          />
          <MarkdownSection
            title="🔴 SAI SÓT THƯỜNG GẶP"
            value={sections.commonMistakes}
            onChange={(value) => setSections((prev) => ({ ...prev, commonMistakes: value }))}
          />
          <MarkdownSection
            title="🟧 TRƯỚC KHI CHECK QC"
            value={sections.beforeQcSteps}
            onChange={(value) => setSections((prev) => ({ ...prev, beforeQcSteps: value }))}
          />

          <Button className="w-full bg-[#f97316] text-black hover:bg-[#fb923c]" disabled={saving} onClick={() => upsertQcTemplate("Đã lưu Nhiệm vụ")}>
            {saving ? "Đang lưu..." : "💾 Lưu Nhiệm vụ"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border-l-4 border-[#f97316] bg-[#2a1a05] p-3 text-xs text-[#f7c58a]">
            Danh sách tiêu chí QC: {itemCount} / 15
          </div>

          {items.map((item, index) => (
            <div key={item.key} className="rounded-lg bg-[#2a2a2a] p-3">
              <div className="mb-1 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316] text-xs font-bold text-black">{index + 1}</div>
                <div className="flex-1 text-sm text-[#f0f2ff]">{item.title}</div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => openEditItem(index)} className="rounded bg-[#1a1a1a] px-1.5 py-1 text-[11px] text-[#cfd3e3]">✏️</button>
                  <button type="button" onClick={() => moveItem(index, -1)} className="rounded bg-[#1a1a1a] px-1.5 py-1 text-[11px] text-[#cfd3e3]" disabled={index === 0}>↑</button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 1)}
                    className="rounded bg-[#1a1a1a] px-1.5 py-1 text-[11px] text-[#cfd3e3]"
                    disabled={index === items.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== index))}
                    className="rounded bg-[#1a1a1a] px-1.5 py-1 text-[11px] text-red-400"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="text-xs text-[#9ca3af]">
                {item.requirePhoto ? <span className="text-emerald-400">📷 Bắt buộc ảnh</span> : <span>Không yêu cầu ảnh</span>}
              </div>
              {item.description ? <div className="mt-1 text-xs text-[#98a0c2]">{item.description}</div> : null}
            </div>
          ))}

          <Button variant="outline" className="w-full border-[#2f3555] bg-[#1a1d2e]" onClick={openCreateItem}>
            + Thêm tiêu chí
          </Button>

          <Button className="w-full bg-[#f97316] text-black hover:bg-[#fb923c]" disabled={saving} onClick={() => upsertQcTemplate("Đã lưu Checklist")}>
            {saving ? "Đang lưu..." : "💾 Lưu Checklist"}
          </Button>
        </div>
      )}

      {itemModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3">
          <div className="w-full max-w-md rounded-xl border border-[#2f3555] bg-[#1a1d2e] p-4">
            <div className="mb-3 text-sm font-semibold text-[#f0f2ff]">{editingIndex === null ? "➕ Thêm tiêu chí QC" : "✏️ Sửa tiêu chí QC"}</div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#98a0c2]">Tên tiêu chí *</label>
                <input
                  value={itemDraft.title}
                  onChange={(event) => setItemDraft((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#98a0c2]">Mô tả thêm</label>
                <textarea
                  value={itemDraft.description}
                  onChange={(event) => setItemDraft((prev) => ({ ...prev, description: event.target.value }))}
                  className="min-h-[84px] w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
                />
              </div>

              <label className="flex items-start gap-2 rounded-lg border border-[#2f3555] bg-[#11182d] px-3 py-2 text-sm text-[#d9def3]">
                <input
                  type="checkbox"
                  checked={itemDraft.requirePhoto}
                  onChange={(event) => setItemDraft((prev) => ({ ...prev, requirePhoto: event.target.checked }))}
                  className="mt-1"
                />
                Bắt buộc upload ảnh khi check
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setItemModalOpen(false)}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={saveItemDraft}>
                ✓ Lưu
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MarkdownSection({ title, value, onChange }: { title: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="rounded-lg border border-[#30364d] bg-[#2a2a2a] p-3">
      <div className="mb-2 text-xs font-semibold text-[#f97316]">{title}</div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[100px] w-full bg-transparent text-sm text-[#f0f2ff] outline-none"
      />
    </div>
  );
}
