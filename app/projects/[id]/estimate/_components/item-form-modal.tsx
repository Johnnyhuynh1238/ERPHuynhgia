"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getTemplate, type EstimateFormField } from "@/lib/estimate-templates";

// Modal form mẫu chuẩn: 3 section = 3 cột nhập, field dạng lưới 2 cột,
// droplist/số/text có đơn vị — admin chỉ điền, không phải gõ mô tả tay.
export function ItemFormModal({
  itemId,
  itemName,
  templateKey,
  initialData,
  onClose,
  onSaved,
}: {
  itemId: string;
  itemName: string;
  templateKey: string;
  initialData: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tpl = getTemplate(templateKey);
  const [data, setData] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(initialData ?? {})) init[k] = v == null ? "" : String(v);
    return init;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!tpl) return null;

  const set = (key: string, value: string) => setData((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    const r = await fetch(`/api/estimate/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formData: data }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      toast.error(j.message || "Lỗi lưu form");
      return;
    }
    toast.success("Đã lưu — mô tả 3 cột cập nhật theo form");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-[#252840] bg-[#13151f]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#252840] px-4 py-3">
          <div>
            <h4 className="text-sm font-bold text-zinc-100">{itemName}</h4>
            <p className="text-[11px] text-zinc-500">Form mẫu: {tpl.name} — bỏ trống mục không áp dụng</p>
          </div>
          <button onClick={onClose} className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {tpl.sections.map((section) => (
            <section key={section.col}>
              <h5 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#fb923c]">{section.title}</h5>
              <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                {section.fields.map((f) => (
                  <FormField key={f.key} field={f} value={data[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#252840] px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            Huỷ
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-[#f97316] px-5 py-1.5 text-xs font-bold text-white hover:bg-[#ea580c] disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu form"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[#2b2f4a] bg-[#0d0f17] px-2.5 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#f97316]/60";

function FormField({
  field,
  value,
  onChange,
}: {
  field: EstimateFormField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "heading") {
    return (
      <p className="mt-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 sm:col-span-2">
        {field.label}
        <span className="h-px flex-1 bg-[#252840]" />
      </p>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-[11px] text-zinc-400">{field.label}</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          className={`${inputCls} resize-y`}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block">
        <span className="mb-1 block text-[11px] text-zinc-400">{field.label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} appearance-none`}>
          <option value="">— chọn —</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-zinc-400">{field.label}</span>
      <span className="relative block">
        <input
          type={field.type === "number" ? "number" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={`${inputCls} ${field.unit ? "pr-12" : ""}`}
        />
        {field.unit && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[10px] font-semibold text-zinc-500">
            {field.unit}
          </span>
        )}
      </span>
    </label>
  );
}
