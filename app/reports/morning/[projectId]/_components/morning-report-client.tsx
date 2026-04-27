"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReportDecision } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MorningTaskRow = {
  taskId: string;
  id: string;
  code: string;
  name: string;
  phase: string;
  status: string;
  group: "A" | "B" | "C";
  overdueDays: number;
  groupOrder: number;
  decision: ReportDecision;
  plannedActivity: string;
  pauseReason: string | null;
  pauseNote: string;
};

type MorningReportPayload = {
  id: string;
  submittedAt: string | null;
  isOnTime: boolean;
  overallNote: string | null;
};

type SiteRestDayPayload = {
  id: string;
  reason: string;
  note: string | null;
};

const GROUP_LABEL: Record<"A" | "B" | "C", string> = {
  A: "TRỄ HẠN",
  B: "ĐANG CHẠY",
  C: "BẮT ĐẦU HÔM NAY",
};

const PAUSE_REASON_OPTIONS = [
  { value: "RAIN", label: "Mưa" },
  { value: "LACK_MATERIAL", label: "Thiếu vật tư" },
  { value: "WAIT_INSPECTION", label: "Chờ nghiệm thu" },
  { value: "WAIT_SUBCONTRACTOR", label: "Chờ thầu phụ" },
  { value: "WAIT_CUSTOMER", label: "Chờ chủ nhà duyệt" },
  { value: "OTHER", label: "Khác" },
] as const;

function formatDate(dateIso: string) {
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatTime(dateIso: string | null) {
  if (!dateIso) return "-";

  const match = dateIso.match(/T(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }

  const d = new Date(dateIso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function computeMorningDeadlineLabel(reportDateIso: string) {
  const reportDate = new Date(reportDateIso);
  const deadline = new Date(reportDate.getUTCFullYear(), reportDate.getUTCMonth(), reportDate.getUTCDate(), 8, 0, 0, 0);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();

  if (diffMs <= 0) return "Đã quá hạn 8h";

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `Còn ${hours}h ${minutes}p tới 8h`;
}

function submittedLabel(submittedAt: string | null, isOnTime: boolean) {
  if (!submittedAt) return "Chưa nộp";
  if (isOnTime) return `Đã nộp lúc ${formatTime(submittedAt)} ✓`;
  return `Nộp trễ lúc ${formatTime(submittedAt)}`;
}

function toYmd(dateIso: string) {
  return dateIso.slice(0, 10);
}

export function MorningReportClient({
  project,
  reportDate,
  isGoLive,
  siteRestDay,
  morningReport,
  initialTasks,
}: {
  project: { id: string; code: string; name: string };
  reportDate: string;
  isGoLive: boolean;
  siteRestDay: SiteRestDayPayload | null;
  morningReport: MorningReportPayload | null;
  initialTasks: MorningTaskRow[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [overallNote, setOverallNote] = useState(morningReport?.overallNote || "");
  const [submittedAt, setSubmittedAt] = useState(morningReport?.submittedAt || null);
  const [isOnTime, setIsOnTime] = useState(morningReport?.isOnTime || false);
  const [saving, setSaving] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const grouped = useMemo(() => {
    const byGroup = {
      A: [] as MorningTaskRow[],
      B: [] as MorningTaskRow[],
      C: [] as MorningTaskRow[],
    };
    for (const row of tasks) {
      byGroup[row.group].push(row);
    }
    return byGroup;
  }, [tasks]);

  const orderedSteps = useMemo(() => {
    const steps: Array<{ group: "A" | "B" | "C"; row: MorningTaskRow }> = [];
    (Object.keys(grouped) as Array<"A" | "B" | "C">).forEach((group) => {
      grouped[group].forEach((row) => {
        steps.push({ group, row });
      });
    });
    return steps;
  }, [grouped]);

  useEffect(() => {
    if (orderedSteps.length === 0) {
      setCurrentStep(0);
      return;
    }
    if (currentStep > orderedSteps.length - 1) {
      setCurrentStep(orderedSteps.length - 1);
    }
  }, [orderedSteps.length, currentStep]);

  const canProgressStep = orderedSteps.length > 0 && currentStep < orderedSteps.length - 1;
  const canGoBackStep = orderedSteps.length > 0 && currentStep > 0;
  const activeStep = orderedSteps[currentStep] || null;
  const canEdit = !submittedAt;

  function updateRow(taskId: string, patch: Partial<MorningTaskRow>) {
    setTasks((prev) => prev.map((row) => (row.taskId === taskId ? { ...row, ...patch } : row)));
  }

  function validateRows() {
    for (const row of tasks) {
      if (row.decision === ReportDecision.WORK) {
        if ((row.plannedActivity || "").trim().length < 10) {
          return `Task ${row.code}: kế hoạch tối thiểu 10 ký tự`;
        }
        continue;
      }

      if (!row.pauseReason) {
        return `Task ${row.code}: phải chọn lý do tạm dừng`;
      }

      if ((row.pauseNote || "").trim().length < 5) {
        return `Task ${row.code}: ghi chú tạm dừng tối thiểu 5 ký tự`;
      }
    }

    return null;
  }

  async function submitReport(submit: boolean) {
    const validationError = validateRows();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (submit) {
      const ok = window.confirm("Sau khi chốt, anh/chị có thể chỉnh sửa trong ngày nhưng mỗi lần chỉnh sẽ ghi log. Xác nhận?");
      if (!ok) return;
    }

    setSaving(true);
    const res = await fetch("/api/reports/morning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        reportDate: toYmd(reportDate),
        overallNote: overallNote.trim() || null,
        submit,
        tasks: tasks.map((row) => ({
          taskId: row.taskId,
          decision: row.decision,
          plannedActivity: row.decision === ReportDecision.WORK ? row.plannedActivity : null,
          pauseReason: row.decision === ReportDecision.PAUSE ? row.pauseReason : null,
          pauseNote: row.decision === ReportDecision.PAUSE ? row.pauseNote : null,
        })),
      }),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Không thể lưu báo cáo sáng");
      return;
    }

    if (submit) {
      setSubmittedAt(json.report?.submittedAt || new Date().toISOString());
      setIsOnTime(Boolean(json.report?.isOnTime));
    }

    toast.success(json.message || (submit ? "Đã chốt báo cáo sáng" : "Đã lưu tạm báo cáo sáng"));
    router.refresh();
  }

  const dayName = new Date(reportDate).toLocaleDateString("vi-VN", { weekday: "long" });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-xs text-slate-500">{project.code}</div>
        <h1 className="text-2xl font-semibold text-orange-300">Báo cáo sáng · {project.name}</h1>
        <div className="mt-1 text-sm text-slate-600">
          {dayName}, {formatDate(reportDate)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{computeMorningDeadlineLabel(reportDate)}</div>
          <div className={`rounded-full px-3 py-1 text-xs ${submittedAt ? (isOnTime ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700") : "bg-blue-100 text-blue-700"}`}>
            {submittedLabel(submittedAt, isOnTime)}
          </div>
        </div>
      </div>

      {!isGoLive ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700">
          Dự án chưa kích hoạt hệ thống báo cáo. Liên hệ admin.
        </div>
      ) : null}

      {siteRestDay ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
          Công trường nghỉ hôm nay ({siteRestDay.reason}){siteRestDay.note ? ` - ${siteRestDay.note}` : ""}. Không cần báo cáo.
        </div>
      ) : null}

      {isGoLive && !siteRestDay ? (
        <>
          {submittedAt ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
              Báo cáo đã chốt, chỉ có thể xem lại dữ liệu.
            </div>
          ) : null}

          <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-4 border-0 p-0">
            {isReviewMode || !canEdit ? (
              (Object.keys(grouped) as Array<"A" | "B" | "C">).map((group) => (
                <div key={group} className="space-y-3">
                  <h2 className={`text-sm font-semibold ${group === "A" ? "text-red-700" : "text-slate-700"}`}>{GROUP_LABEL[group]}</h2>
                  {grouped[group].length === 0 ? (
                    <div className="rounded-xl border bg-white p-4 text-sm text-slate-500">Không có task trong nhóm này.</div>
                  ) : (
                    grouped[group].map((row) => (
                      <div key={row.taskId} className={`rounded-xl border bg-white p-4 ${group === "A" ? "border-red-300" : ""}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-orange-300">{row.code}</div>
                          <div className="rounded bg-slate-100 px-2 py-0.5 text-xs">{row.phase}</div>
                          {group === "A" ? <div className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">TRỄ {row.overdueDays} NGÀY</div> : null}
                        </div>
                        <div className="mt-1 font-medium">{row.name}</div>

                        <div className="mt-3 space-y-2 text-sm">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={row.decision === ReportDecision.WORK}
                              onChange={() => updateRow(row.taskId, { decision: ReportDecision.WORK })}
                            />
                            Làm được
                          </label>
                          {row.decision === ReportDecision.WORK ? (
                            <textarea
                              className="w-full rounded border px-3 py-2 text-sm"
                              rows={3}
                              value={row.plannedActivity}
                              onChange={(e) => updateRow(row.taskId, { plannedActivity: e.target.value })}
                              placeholder="Kế hoạch hôm nay làm gì"
                            />
                          ) : null}

                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={row.decision === ReportDecision.PAUSE}
                              onChange={() => updateRow(row.taskId, { decision: ReportDecision.PAUSE })}
                            />
                            Tạm dừng
                          </label>
                          {row.decision === ReportDecision.PAUSE ? (
                            <div className="grid gap-2 md:grid-cols-2">
                              <select
                                className="rounded border px-3 py-2 text-sm"
                                value={row.pauseReason || ""}
                                onChange={(e) => updateRow(row.taskId, { pauseReason: e.target.value || null })}
                              >
                                <option value="">Chọn lý do</option>
                                {PAUSE_REASON_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="rounded border px-3 py-2 text-sm"
                                value={row.pauseNote}
                                onChange={(e) => updateRow(row.taskId, { pauseNote: e.target.value })}
                                placeholder="Ghi chú tạm dừng"
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ))
            ) : orderedSteps.length ? (
              <div className="space-y-3">
                <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
                  <div className="font-medium text-slate-800">Nhập theo từng bước</div>
                  <div className="mt-1">
                    Bước {currentStep + 1}/{orderedSteps.length} · Nhóm {GROUP_LABEL[activeStep?.group || "B"]}
                  </div>
                </div>
                {activeStep ? (
                  <div className={`rounded-xl border bg-white p-4 ${activeStep.group === "A" ? "border-red-300" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-orange-300">{activeStep.row.code}</div>
                      <div className="rounded bg-slate-100 px-2 py-0.5 text-xs">{activeStep.row.phase}</div>
                      {activeStep.group === "A" ? <div className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">TRỄ {activeStep.row.overdueDays} NGÀY</div> : null}
                    </div>
                    <div className="mt-1 font-medium">{activeStep.row.name}</div>

                    <div className="mt-3 space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={activeStep.row.decision === ReportDecision.WORK}
                          onChange={() => updateRow(activeStep.row.taskId, { decision: ReportDecision.WORK })}
                        />
                        Làm được
                      </label>
                      {activeStep.row.decision === ReportDecision.WORK ? (
                        <textarea
                          className="w-full rounded border px-3 py-2 text-sm"
                          rows={3}
                          value={activeStep.row.plannedActivity}
                          onChange={(e) => updateRow(activeStep.row.taskId, { plannedActivity: e.target.value })}
                          placeholder="Kế hoạch hôm nay làm gì"
                        />
                      ) : null}

                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={activeStep.row.decision === ReportDecision.PAUSE}
                          onChange={() => updateRow(activeStep.row.taskId, { decision: ReportDecision.PAUSE })}
                        />
                        Tạm dừng
                      </label>
                      {activeStep.row.decision === ReportDecision.PAUSE ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <select
                            className="rounded border px-3 py-2 text-sm"
                            value={activeStep.row.pauseReason || ""}
                            onChange={(e) => updateRow(activeStep.row.taskId, { pauseReason: e.target.value || null })}
                          >
                            <option value="">Chọn lý do</option>
                            {PAUSE_REASON_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <input
                            className="rounded border px-3 py-2 text-sm"
                            value={activeStep.row.pauseNote}
                            onChange={(e) => updateRow(activeStep.row.taskId, { pauseNote: e.target.value })}
                            placeholder="Ghi chú tạm dừng"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 0))} disabled={!canGoBackStep}>
                    Bước trước
                  </Button>
                  <Button variant="outline" onClick={() => setCurrentStep((prev) => Math.min(prev + 1, orderedSteps.length - 1))} disabled={!canProgressStep}>
                    Bước tiếp theo
                  </Button>
                  <Button variant="outline" onClick={() => setIsReviewMode(true)}>
                    Xem lại toàn bộ
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-white p-4 text-sm text-slate-500">Không có task cần báo cáo sáng hôm nay.</div>
            )}

            <div className="rounded-xl border bg-white p-4">
              <label className="mb-2 block text-sm font-medium">Ghi chú tổng (optional)</label>
              <textarea
                className="w-full rounded border px-3 py-2 text-sm"
                rows={3}
                value={overallNote}
                onChange={(e) => setOverallNote(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {isReviewMode && canEdit ? (
                  <Button variant="outline" disabled={saving} onClick={() => setIsReviewMode(false)}>
                    Quay lại từng bước
                  </Button>
                ) : null}
                <Button variant="outline" disabled={saving || !canEdit} onClick={() => submitReport(false)}>
                  {saving ? "Đang lưu..." : "Lưu tạm"}
                </Button>
                <Button className="bg-orange-500 hover:bg-orange-600" disabled={saving || !canEdit} onClick={() => submitReport(true)}>
                  {saving ? "Đang chốt..." : "Chốt báo cáo sáng"}
                </Button>
              </div>
            </div>
          </fieldset>
        </>
      ) : null}
    </div>
  );
}
