"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PHASE_CODES, PHASE_CODE_LABEL, type PhaseCode } from "@/lib/project-budget";
import type { QcChecklistItem } from "@/lib/qc-mapping";

type Item = {
  id: string;
  phaseCode: PhaseCode;
  name: string;
  unit: string;
  qcChecklist: QcChecklistItem[];
};

type Props = {
  projectId: string;
  items: Item[];
};

type Draft = {
  text: string;
  requirePhotoMask: Record<number, boolean>;
};

function checklistToText(list: QcChecklistItem[]) {
  return list.map((it) => it.title).join("\n");
}

function checklistToMask(list: QcChecklistItem[]) {
  const mask: Record<number, boolean> = {};
  list.forEach((it, i) => {
    mask[i] = Boolean(it.requirePhoto);
  });
  return mask;
}

function parseDraft(draft: Draft): QcChecklistItem[] {
  const lines = draft.text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.map((title, i) => ({
    title: title.slice(0, 120),
    requirePhoto: Boolean(draft.requirePhotoMask[i]),
  }));
}

export function QcMappingClient({ projectId, items }: Props) {
  const initialDrafts = useMemo(() => {
    const map: Record<string, Draft> = {};
    for (const it of items) {
      map[it.id] = {
        text: checklistToText(it.qcChecklist),
        requirePhotoMask: checklistToMask(it.qcChecklist),
      };
    }
    return map;
  }, [items]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initialDrafts);
  const [savedSnapshot, setSavedSnapshot] = useState<Record<string, Draft>>(initialDrafts);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const out: Record<PhaseCode, Item[]> = {
      "01": [],
      "02": [],
      "03": [],
      "04": [],
      "05": [],
      "06": [],
      "07": [],
      "08": [],
      "09": [],
    };
    for (const it of items) out[it.phaseCode].push(it);
    return out;
  }, [items]);

  const updateText = (id: string, text: string) => {
    setDrafts((prev) => {
      const cur = prev[id] ?? { text: "", requirePhotoMask: {} };
      return { ...prev, [id]: { ...cur, text } };
    });
  };

  const togglePhoto = (id: string, index: number) => {
    setDrafts((prev) => {
      const cur = prev[id] ?? { text: "", requirePhotoMask: {} };
      const mask = { ...cur.requirePhotoMask, [index]: !cur.requirePhotoMask[index] };
      return { ...prev, [id]: { ...cur, requirePhotoMask: mask } };
    });
  };

  const isDirty = (id: string) => {
    const a = drafts[id];
    const b = savedSnapshot[id];
    if (!a || !b) return false;
    if (a.text !== b.text) return true;
    const parsed = parseDraft(a);
    for (let i = 0; i < parsed.length; i += 1) {
      if (Boolean(a.requirePhotoMask[i]) !== Boolean(b.requirePhotoMask[i])) return true;
    }
    return false;
  };

  const save = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    const checklist = parseDraft(draft);
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      const r = await fetch(`/api/projects/${projectId}/budget/items/${id}/qc`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qcChecklist: checklist.length === 0 ? null : checklist }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message || "Lưu thất bại");
        return;
      }
      toast.success(`Đã lưu ${checklist.length} mục QC`);
      const newSaved: Draft = {
        text: checklistToText(checklist),
        requirePhotoMask: checklistToMask(checklist),
      };
      setSavedSnapshot((s) => ({ ...s, [id]: newSaved }));
      setDrafts((s) => ({ ...s, [id]: newSaved }));
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const clear = (id: string) => {
    setDrafts((s) => ({ ...s, [id]: { text: "", requirePhotoMask: {} } }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <h2 className="text-lg font-semibold text-[#f0f2ff]">Cấu hình QC theo đầu việc</h2>
        <div className="mt-1 text-xs text-[#8892b0]">
          Mỗi dòng = một mục cần kiểm. Tick &quot;Ảnh&quot; nếu mục đó bắt buộc đính kèm ảnh. Để trống = đầu việc
          không có hold-point (vẫn dùng flow duyệt cũ).
        </div>
      </div>

      {PHASE_CODES.map((phaseCode) => {
        const list = grouped[phaseCode];
        if (list.length === 0) return null;
        return (
          <div key={phaseCode} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <div className="mb-3 text-sm font-semibold text-[#f0f2ff]">
              {PHASE_CODE_LABEL[phaseCode]} ({list.length} đầu việc)
            </div>
            <div className="space-y-3">
              {list.map((it) => {
                const draft = drafts[it.id] ?? { text: "", requirePhotoMask: {} };
                const parsed = parseDraft(draft);
                const dirty = isDirty(it.id);
                return (
                  <div key={it.id} className="rounded-lg border border-[#252840] bg-[#0f1220] p-3">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-[#f0f2ff]">{it.name}</div>
                        <div className="text-xs text-[#8892b0]">Đơn vị: {it.unit}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {parsed.length > 0 && (
                          <span className="rounded bg-[#252840] px-2 py-0.5 text-[10px] text-[#8892b0]">
                            {parsed.length} mục
                          </span>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => clear(it.id)}
                          disabled={!draft.text}
                        >
                          Xoá
                        </Button>
                        <Button
                          onClick={() => save(it.id)}
                          disabled={!dirty || saving[it.id]}
                        >
                          {saving[it.id] ? "Đang lưu..." : "Lưu"}
                        </Button>
                      </div>
                    </div>
                    <textarea
                      value={draft.text}
                      onChange={(e) => updateText(it.id, e.target.value)}
                      placeholder="VD:&#10;Kiểm tra cốt thép đúng bản vẽ&#10;Cao độ đáy móng&#10;Sạch đáy hố trước khi đổ bê tông"
                      rows={Math.max(3, parsed.length + 1)}
                      maxLength={2000}
                      className="w-full rounded border border-[#252840] bg-[#0f1220] px-2 py-2 text-sm text-[#f0f2ff]"
                    />
                    {parsed.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {parsed.map((line, i) => (
                          <label key={i} className="flex items-center gap-2 text-xs text-[#8892b0]">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.requirePhotoMask[i])}
                              onChange={() => togglePhoto(it.id, i)}
                              className="h-3.5 w-3.5"
                            />
                            <span>Mục {i + 1}: bắt buộc ảnh</span>
                            <span className="text-[#3a3f5e]">— {line.title}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          Dự án chưa có đầu việc nhân công trong dự toán.
        </div>
      )}
    </div>
  );
}
