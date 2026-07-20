"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type TaskCategory = "normal" | "internal_milestone" | "major_milestone";

type TemplatePayload = {
  id: string;
  code: string;
  name: string;
  phaseCode: string;
  phaseName: string;
  phaseOrder: number;
  displayOrder: number;
  duration: number;
  category: TaskCategory;
  qcTemplate: { id: string; qcItems: Array<{ id: string; requirePhoto: boolean }> } | null;
};

type FormState = {
  code: string;
  name: string;
  description: string;
  phaseCode: string;
  displayOrder: string;
  duration: string;
  category: TaskCategory;
  hasQcChecklist: boolean;
};

const TEMPLATE_CATEGORY = "nha_pho_1t1l";

const PHASE_OPTIONS = [
  { code: "P1", name: "Chuẩn bị", order: 1 },
  { code: "P2", name: "Móng", order: 2 },
  { code: "P3", name: "Khung trệt", order: 3 },
  { code: "P4", name: "Khung lầu", order: 4 },
  { code: "P5", name: "M&E + xây tô", order: 5 },
  { code: "P6", name: "Ốp lát", order: 6 },
  { code: "P7", name: "Sơn bả", order: 7 },
  { code: "P8", name: "Lắp thiết bị", order: 8 },
  { code: "P9", name: "Bàn giao", order: 9 },
];

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  description: "",
  phaseCode: "P1",
  displayOrder: "1",
  duration: "1",
  category: "normal",
  hasQcChecklist: true,
};

function mapTemplateToForm(template: TemplatePayload): FormState {
  return {
    code: template.code,
    name: template.name,
    description: "",
    phaseCode: template.phaseCode || "P1",
    displayOrder: String(template.displayOrder || 1),
    duration: String(template.duration || 1),
    category: template.category,
    hasQcChecklist: Boolean(template.qcTemplate),
  };
}

export function TemplateEditorClient({ templateId }: { templateId: string }) {
  const router = useRouter();
  const isCreate = templateId === "new";

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<TemplatePayload | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (isCreate) {
      setLoading(false);
      setTemplate(null);
      setForm(EMPTY_FORM);
      return;
    }

    let stop = false;
    const run = async () => {
      setLoading(true);
      const res = await fetch(`/api/admin/templates/${templateId}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setLoading(false);

      if (!res.ok) {
        toast.error(json.message || "Không tải được template");
        router.push("/admin/templates");
        return;
      }

      if (stop) return;
      const next = json.template as TemplatePayload;
      setTemplate(next);
      setForm(mapTemplateToForm(next));
    };

    run();
    return () => {
      stop = true;
    };
  }, [isCreate, templateId, router]);

  const selectedPhase = useMemo(
    () => PHASE_OPTIONS.find((item) => item.code === form.phaseCode) || PHASE_OPTIONS[0],
    [form.phaseCode],
  );

  async function saveTemplate() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Mã task và tên task là bắt buộc");
      return null;
    }

    const duration = Number(form.duration);
    const displayOrder = Number(form.displayOrder);
    if (!Number.isFinite(duration) || duration < 1) {
      toast.error("Duration phải >= 1");
      return null;
    }

    if (!Number.isFinite(displayOrder) || displayOrder < 1) {
      toast.error("Thứ tự trong phase phải >= 1");
      return null;
    }

    setSaving(true);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      phaseCode: selectedPhase.code,
      phaseName: selectedPhase.name,
      phaseOrder: selectedPhase.order,
      displayOrder,
      duration,
      category: form.category,
      defaultOffsetDays: 0,
      defaultDurationDays: duration,
      defaultTeam: "",
      defaultInspector: "",
      materialsNeeded: form.description.trim() || "",
      proposerRole: "",
      ordererRole: "",
      receiverRole: "",
      qcChecklist: "",
      isMilestone: form.category !== "normal",
      templateCategory: TEMPLATE_CATEGORY,
    };

    const res = await fetch(isCreate ? "/api/admin/templates" : `/api/admin/templates/${templateId}`, {
      method: isCreate ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Lưu template thất bại");
      return null;
    }

    const savedTemplate = json.template as TemplatePayload;
    setTemplate(savedTemplate);
    setForm((prev) => ({ ...prev, code: savedTemplate.code, name: savedTemplate.name }));

    if (isCreate) {
      router.replace(`/admin/templates/${savedTemplate.id}`);
    }

    toast.success(json.message || "Đã lưu template");
    return savedTemplate;
  }

  async function saveAndGoQc() {
    const saved = await saveTemplate();
    if (!saved) return;

    if (!form.hasQcChecklist) {
      toast.success("Đã lưu template không dùng QC checklist");
      router.push("/admin/templates");
      return;
    }

    router.push(`/admin/templates/${saved.id}/qc`);
  }

  if (loading) {
    return <div className="text-sm text-[#98a0c2]">Đang tải thông tin template...</div>;
  }

  const qcItems = template?.qcTemplate?.qcItems || [];
  const photoRequired = qcItems.filter((item) => item.requirePhoto).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#f0f2ff]">
          {isCreate ? "← Tạo Task Template" : `← Sửa ${template?.code || ""} ${template?.name || ""}`}
        </h1>
        <LinkBack />
      </div>

      <div className="rounded-xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="mb-3 text-xs font-semibold text-[#f97316]">📋 THÔNG TIN CƠ BẢN</div>

        <div className="space-y-3">
          <Field label="Mã task *">
            <input
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </Field>

          <Field label="Tên task *">
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </Field>

          <Field label="Mô tả">
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="min-h-[84px] w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </Field>

          <Field label="Phase *">
            <select
              value={form.phaseCode}
              onChange={(event) => setForm((prev) => ({ ...prev, phaseCode: event.target.value }))}
              className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
            >
              {PHASE_OPTIONS.map((phase) => (
                <option key={phase.code} value={phase.code}>
                  {phase.code} - {phase.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Thứ tự trong phase">
              <input
                type="number"
                min={1}
                value={form.displayOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, displayOrder: event.target.value }))}
                className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </Field>

            <Field label="Duration (ngày) *">
              <input
                type="number"
                min={1}
                value={form.duration}
                onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))}
                className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="mb-3 text-xs font-semibold text-[#f97316]">🏷 LOẠI TASK</div>

        <div className="space-y-2 text-sm">
          <CategoryOption
            active={form.category === "normal"}
            title="Task thường"
            desc="KS tự done sau khi đạt QC"
            onClick={() => setForm((prev) => ({ ...prev, category: "normal" }))}
          />
          <CategoryOption
            active={form.category === "internal_milestone"}
            title="Internal milestone"
            desc="Cần TPTC duyệt nội bộ"
            onClick={() => setForm((prev) => ({ ...prev, category: "internal_milestone" }))}
          />
          <CategoryOption
            active={form.category === "major_milestone"}
            title="Major milestone ⭐"
            desc="Cần TPTC duyệt + chủ nhà ký"
            onClick={() => setForm((prev) => ({ ...prev, category: "major_milestone" }))}
          />
        </div>
      </div>

      <div className="rounded-xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="mb-3 text-xs font-semibold text-[#f97316]">✅ QC TEMPLATE</div>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
            form.hasQcChecklist
              ? "border-[#f97316]/60 bg-[#2a1a05] text-[#f0f2ff]"
              : "border-[#2f3555] bg-[#11182d] text-[#cdd3eb]"
          }`}
        >
          <input
            type="checkbox"
            checked={form.hasQcChecklist}
            onChange={(event) => setForm((prev) => ({ ...prev, hasQcChecklist: event.target.checked }))}
            className="mt-1"
          />
          <div>
            <div>Task này có QC checklist</div>
            {template?.qcTemplate ? (
              <div className="mt-1 text-xs text-[#98a0c2]">Hiện có {qcItems.length} tiêu chí, {photoRequired} yêu cầu ảnh</div>
            ) : (
              <div className="mt-1 text-xs text-[#98a0c2]">Chưa có QC template, bấm tiếp để cấu hình</div>
            )}
          </div>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => router.push("/admin/templates")} disabled={saving}>
          Hủy
        </Button>
        <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={saveTemplate} disabled={saving}>
          {saving ? "Đang lưu..." : "💾 Lưu template"}
        </Button>
      </div>

      <Button className="w-full bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={saveAndGoQc} disabled={saving}>
        Tiếp → Cấu hình QC →
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[#98a0c2]">{label}</label>
      {children}
    </div>
  );
}

function CategoryOption({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2 text-left ${
        active ? "border-[#f97316] bg-[#2a1a05]" : "border-[#2f3555] bg-[#11182d]"
      }`}
    >
      <div className="font-medium text-[#f0f2ff]">{title}</div>
      <div className="text-xs text-[#98a0c2]">{desc}</div>
    </button>
  );
}

function LinkBack() {
  return (
    <a href="/admin/templates" className="text-xs font-semibold text-[#f97316]">
      Về danh sách
    </a>
  );
}
