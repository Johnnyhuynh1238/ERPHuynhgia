"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type QcMissionTemplate = {
  id: string;
  preparationSteps: string | null;
  executionSteps: string | null;
  commonMistakes: string | null;
  beforeQcSteps: string | null;
};

type QcTemplateResponse = {
  taskId: string;
  qcChecklist?: string | null;
  qcTemplate: QcMissionTemplate | null;
  items: Array<{
    id: string;
    displayOrder: number;
    title: string;
    description: string | null;
    requirePhoto: boolean;
  }>;
};

type QcResultRow = {
  item: {
    id: string;
    displayOrder: number;
    title: string;
    description: string | null;
    requirePhoto: boolean;
  };
  result: {
    id: string;
    isPassed: boolean;
    photoUrl: string | null;
    note: string | null;
    checkedAt: string;
    updatedAt: string;
    checkedBy: { id: string; fullName: string; email: string };
  } | null;
};

type QcResultsResponse = {
  taskId: string;
  status: string;
  canUpdate: boolean;
  items: QcResultRow[];
  summary: {
    total: number;
    passed: number;
    remaining: number;
    completed: boolean;
  };
};

type QcSubTab = "missions" | "checklist";

function fmtDateTime(input: string | null | undefined) {
  if (!input) return "-";
  return new Date(input).toLocaleString("vi-VN");
}

export function QcSection({
  taskId,
  canUpdateQc,
}: {
  taskId: string;
  canUpdateQc: boolean;
  canManageItem?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<QcSubTab>("missions");
  const [loading, setLoading] = useState(false);
  const [savingByItem, setSavingByItem] = useState<Record<string, boolean>>({});
  const [mission, setMission] = useState<QcTemplateResponse | null>(null);
  const [results, setResults] = useState<QcResultsResponse | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [pendingPassedItems, setPendingPassedItems] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [photoPreview, setPhotoPreview] = useState<{ title: string; photos: string[]; index: number } | null>(null);

  const locked = useMemo(() => {
    const status = results?.status || "";
    return ["done", "internal_approved", "completed"].includes(status);
  }, [results?.status]);

  const canEdit = canUpdateQc && Boolean(results?.canUpdate) && !locked;

  async function loadData() {
    setLoading(true);
    try {
      const [templateRes, resultsRes] = await Promise.all([
        fetch(`/api/tasks/${taskId}/qc-template`, { cache: "no-store" }),
        fetch(`/api/tasks/${taskId}/qc-results`, { cache: "no-store" }),
      ]);

      const templateJson = await templateRes.json().catch(() => ({} as { message?: string }));
      const resultsJson = await resultsRes.json().catch(() => ({} as { message?: string }));

      if (!templateRes.ok) throw new Error(templateJson.message || "Không tải được nhiệm vụ QC");
      if (!resultsRes.ok) throw new Error(resultsJson.message || "Không tải được checklist QC");

      setMission(templateJson);
      setResults(resultsJson);
      setPendingPassedItems({});
      const nextNotes: Record<string, string> = {};
      (resultsJson.items || []).forEach((row: QcResultRow) => {
        nextNotes[row.item.id] = row.result?.note || "";
      });
      setNotes(nextNotes);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được dữ liệu QC");
    } finally {
      setLoading(false);
    }
  }

  async function uploadPhoto(file: File) {
    const form = new FormData();
    form.append("files", file);
    const res = await fetch(`/api/tasks/${taskId}/photos`, {
      method: "POST",
      body: form,
    });
    const json = await res.json().catch(() => ({} as { message?: string; photos?: Array<{ photoUrl: string }> }));
    if (!res.ok) {
      throw new Error(json.message || "Upload ảnh thất bại");
    }
    const photoUrl = json.photos?.[0]?.photoUrl;
    if (!photoUrl) {
      throw new Error("Không lấy được URL ảnh upload");
    }
    return photoUrl;
  }

  async function saveItem(itemId: string, isPassed: boolean, photoFile?: File | null) {
    const row = results?.items.find((x) => x.item.id === itemId);
    if (!row || !results) return;

    setSavingByItem((prev) => ({ ...prev, [itemId]: true }));

    try {
      let photoUrl = row.result?.photoUrl || "";
      const picked = photoFile ?? files[itemId];
      if (picked) {
        photoUrl = await uploadPhoto(picked);
      }

      if (isPassed && row.item.requirePhoto && !photoUrl) {
        throw new Error("Tiêu chí này bắt buộc ảnh minh chứng");
      }

      const res = await fetch(`/api/tasks/${taskId}/qc-results/${itemId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPassed,
          photoUrl: photoUrl || undefined,
          note: notes[itemId] || undefined,
        }),
      });

      const json = await res.json().catch(() => ({} as { message?: string }));
      if (!res.ok) {
        throw new Error(json.message || "Lưu checklist QC thất bại");
      }

      setFiles((prev) => ({ ...prev, [itemId]: null }));
      toast.success("Đã auto-save checklist QC");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu checklist QC thất bại");
    } finally {
      setSavingByItem((prev) => ({ ...prev, [itemId]: false }));
    }
  }

  function handlePassedChange(row: QcResultRow, isPassed: boolean) {
    setPendingPassedItems((prev) => ({ ...prev, [row.item.id]: isPassed }));
    setExpandedItems((prev) => ({ ...prev, [row.item.id]: isPassed }));

    if (isPassed && row.item.requirePhoto && !row.result?.photoUrl && !files[row.item.id]) {
      return;
    }

    void saveItem(row.item.id, isPassed);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("missions")}
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
            activeTab === "missions" ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] text-[#8891aa]"
          }`}
        >
          Nhiệm vụ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("checklist")}
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
            activeTab === "checklist" ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] text-[#8891aa]"
          }`}
        >
          Checklist QC
        </button>
      </div>

      {activeTab === "missions" ? (
        <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Hướng dẫn nhiệm vụ QC</div>
          {loading ? <div className="text-sm text-[#8891aa]">Đang tải...</div> : null}

          {!loading && !mission?.qcTemplate && !mission?.qcChecklist ? (
            <div className="text-sm text-[#8891aa]">Task này không có checklist QC mẫu.</div>
          ) : null}

          {mission?.qcTemplate?.preparationSteps ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Chuẩn bị trước khi làm</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcTemplate.preparationSteps}</div>
            </div>
          ) : null}

          {mission?.qcTemplate?.executionSteps ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Các bước thực hiện</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcTemplate.executionSteps}</div>
            </div>
          ) : null}

          {mission?.qcTemplate?.commonMistakes ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Lỗi thường gặp</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcTemplate.commonMistakes}</div>
            </div>
          ) : null}

          {mission?.qcTemplate?.beforeQcSteps ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Trước khi gọi QC</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcTemplate.beforeQcSteps}</div>
            </div>
          ) : null}

          {!mission?.qcTemplate && mission?.qcChecklist ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Checklist tham chiếu</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcChecklist}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "checklist" ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Checklist QC auto-save</div>
              <Button variant="outline" className="border-[#2e3347] bg-[#222637]" onClick={loadData} disabled={loading}>
                {loading ? "Đang tải..." : "Làm mới"}
              </Button>
            </div>
            <div className="mt-2 text-xs text-[#8891aa]">
              Đạt {results?.summary.passed || 0}/{results?.summary.total || 0} · Còn {results?.summary.remaining || 0}
            </div>
            {locked ? <div className="mt-2 text-xs text-amber-300">Task đã Done/Approved, checklist chỉ xem.</div> : null}
          </div>

          {(results?.items || []).length === 0 ? (
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 text-sm text-[#8891aa]">Chưa có tiêu chí checklist.</div>
          ) : (
            (results?.items || []).map((row) => {
              const saving = Boolean(savingByItem[row.item.id]);
              const checked = Boolean(row.result?.isPassed) || Boolean(pendingPassedItems[row.item.id]);
              const requirePhoto = row.item.requirePhoto;

              const expanded = Boolean(expandedItems[row.item.id]);
              const hasSavedPhoto = Boolean(row.result?.photoUrl);

              return (
                <div key={row.item.id} className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#f0f2f8]">
                        {row.item.displayOrder}. {row.item.title}
                      </div>
                      {row.result?.checkedAt ? <div className="mt-1 text-[11px] text-[#8891aa]">Cập nhật: {fmtDateTime(row.result.checkedAt)}</div> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {hasSavedPhoto ? (
                        <button
                          type="button"
                          onClick={() => setPhotoPreview({ title: row.item.title, photos: [row.result!.photoUrl!], index: 0 })}
                          className="rounded-full border border-amber-500/50 px-3 py-1 text-xs text-amber-300"
                        >
                          Xem ảnh
                        </button>
                      ) : null}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setExpandedItems((prev) => ({ ...prev, [row.item.id]: !expanded }))}
                          className="rounded-full border border-[#2e3347] px-3 py-1 text-xs text-[#c8d0e8]"
                        >
                          {expanded ? "Ẩn" : "Sửa"}
                        </button>
                      ) : null}
                      <label className="inline-flex items-center gap-2 text-xs text-[#c8d0e8]">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canEdit || saving}
                          onChange={(e) => handlePassedChange(row, e.target.checked)}
                        />
                        Đạt
                      </label>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="space-y-3 rounded-xl border border-[#2e3347] bg-[#222637] p-3">
                      {row.item.description ? <div className="text-xs text-[#8891aa]">{row.item.description}</div> : null}
                      <div className="text-xs text-[#8891aa]">{requirePhoto ? "Bắt buộc ảnh minh chứng" : "Ảnh tùy chọn"}</div>

                      {canEdit ? (
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="block w-full text-xs"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setFiles((prev) => ({ ...prev, [row.item.id]: file }));
                            e.currentTarget.value = "";
                            if (file && checked) {
                              void saveItem(row.item.id, true, file);
                            }
                          }}
                        />
                      ) : null}

                      {files[row.item.id] ? <div className="text-xs text-amber-300">Đã chọn ảnh mới: {files[row.item.id]?.name}</div> : null}

                      <textarea
                        value={notes[row.item.id] || ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [row.item.id]: e.target.value }))}
                        onBlur={() => {
                          if (!canEdit || saving) return;
                          void saveItem(row.item.id, checked || Boolean(files[row.item.id]));
                        }}
                        disabled={!canEdit || saving}
                        rows={2}
                        placeholder="Ghi chú QC (auto-save khi rời ô)"
                        className="w-full rounded-xl border border-[#2e3347] bg-[#1a1d27] px-3 py-2 text-sm"
                      />
                    </div>
                  ) : null}

                  {saving ? <div className="text-xs text-[#8891aa]">Đang lưu...</div> : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {photoPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPhotoPreview(null)}>
          <div className="w-full max-w-3xl rounded-2xl border border-[#2e3347] bg-[#11131b] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[#f0f2f8]">{photoPreview.title}</div>
                <div className="text-xs text-[#8891aa]">
                  Ảnh {photoPreview.index + 1}/{photoPreview.photos.length}
                </div>
              </div>
              <button type="button" onClick={() => setPhotoPreview(null)} className="rounded-full border border-[#2e3347] px-3 py-1 text-xs text-[#c8d0e8]">
                Đóng
              </button>
            </div>

            <div className="flex items-center gap-3">
              {photoPreview.photos.length > 1 ? (
                <button
                  type="button"
                  className="rounded-full border border-[#2e3347] px-3 py-2 text-sm text-[#c8d0e8]"
                  onClick={() =>
                    setPhotoPreview((prev) =>
                      prev ? { ...prev, index: (prev.index - 1 + prev.photos.length) % prev.photos.length } : prev,
                    )
                  }
                >
                  ‹
                </button>
              ) : null}
              <div className="min-h-[240px] flex-1 overflow-hidden rounded-xl border border-[#2e3347] bg-black">
                <img src={photoPreview.photos[photoPreview.index]} alt={photoPreview.title} className="max-h-[75vh] w-full object-contain" />
              </div>
              {photoPreview.photos.length > 1 ? (
                <button
                  type="button"
                  className="rounded-full border border-[#2e3347] px-3 py-2 text-sm text-[#c8d0e8]"
                  onClick={() =>
                    setPhotoPreview((prev) => (prev ? { ...prev, index: (prev.index + 1) % prev.photos.length } : prev))
                  }
                >
                  ›
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
