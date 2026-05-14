"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const phoneVNRegex = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

const paymentScheduleFormSchema = z.object({
  type: z.enum(["contract", "addendum"]).optional(),
  installmentNo: z.number().int().min(1, "Đợt phải >= 1"),
  description: z.string().trim().min(1, "Nội dung thanh toán là bắt buộc"),
  percent: z.number().min(0).max(100).optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().optional().nullable(),
  paymentNote: z.string().optional().nullable(),
});

const formSchema = z.object({
  customerName: z.string().trim().min(2, "Tên chủ nhà tối thiểu 2 ký tự"),
  customerPhone: z.string().trim().regex(phoneVNRegex, "SĐT chủ nhà không hợp lệ"),
  customerIdNumber: z.string().trim().optional().nullable(),
  customerPermanentAddress: z.string().trim().optional().nullable(),
  address: z.string().trim().min(5, "Địa chỉ tối thiểu 5 ký tự"),
  name: z.string().trim().min(3, "Tên dự án tối thiểu 3 ký tự"),
  areaM2: z.number().min(1, "Diện tích phải > 0").optional(),
  unitPrice: z.number().min(1_000_000, "Đơn giá tối thiểu 1.000.000").optional(),
  contractSignDate: z.string().optional().nullable(),
  startDate: z.string().min(1, "Ngày khởi công là bắt buộc"),
  expectedEndDate: z.string().min(1, "Ngày bàn giao dự kiến là bắt buộc"),
  plannedDeadline: z.string().optional().nullable(),
  templateCategory: z.enum(["nha_pho_1t1l", "blank"]),
  projectManagerId: z.string().uuid("Vui lòng chọn GĐ Thi Công").optional(),
  mainEngineerId: z.string().uuid("Vui lòng chọn KS chính"),
  warrantyTotalMonths: z.number().int().min(0).optional(),
  warrantyStructureYears: z.number().int().min(0).optional(),
  warrantyLeakYears: z.number().int().min(0).optional(),
  status: z.enum(["planning", "in_progress", "completed", "paused"]),
  actualEndDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  members: z.array(
    z.object({
      userId: z.string().uuid("Vui lòng chọn user"),
      roleInProject: z.enum(["engineer", "foreman", "accountant", "construction_manager"]),
    }),
  ),
  paymentSchedules: z.array(paymentScheduleFormSchema).optional(),
  drawings: z.array(z.unknown()).optional(),
});

export type ProjectEditorFormValues = z.infer<typeof formSchema>;

type OptionUser = {
  id: string;
  fullName: string;
  email: string;
  role?: string;
};

type TemplatePhaseItem = {
  code: string;
  name: string;
  order: number;
  duration: number;
};

type TemplatePhaseSummaryResponse = {
  templateCategory: string;
  phases: TemplatePhaseItem[];
  totalDuration: number;
};

type DraftFile = {
  id: string;
  fileKind: "contract" | "estimate" | "drawing" | "appendix" | "other";
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  viewUrl: string;
};

type AiProposal = {
  id: string;
  section: string;
  fieldPath: string;
  suggestedValue: unknown;
  action: "fill_empty" | "supplement" | "warning_only";
  confidence: string | number | null;
  reason: string | null;
};

type AiConflict = {
  id: string;
  fieldPath: string;
  currentValue: unknown;
  suggestedValue: unknown;
  conflictType: string;
  reason?: string | null;
};

type DraftAudit = {
  id: string;
  action: string;
  payload: unknown;
  createdAt: string;
  actor?: { fullName: string | null } | null;
};

type ProjectEditorFormProps = {
  mode: "create" | "update";
  projectId?: string;
  initialDraftId?: string;
  currentUserId: string;
  currentUserRole: "admin";
  currentUserName: string;
  initialValues?: Partial<ProjectEditorFormValues>;
};

const fileKindOptions: Array<{ value: DraftFile["fileKind"]; label: string }> = [
  { value: "contract", label: "Hợp đồng" },
  { value: "estimate", label: "Dự toán" },
  { value: "drawing", label: "Bản vẽ" },
  { value: "appendix", label: "Phụ lục" },
  { value: "other", label: "Khác" },
];

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "0 đ";
  return `${Math.round(value).toLocaleString("vi-VN")} đ`;
}

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayIso() {
  return toIsoDate(new Date());
}

function todayPlusDaysIso(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return toIsoDate(now);
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDateVi(date: Date | null) {
  if (!date) return "--/--/----";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateTimeVi(value: string) {
  return new Date(value).toLocaleString("vi-VN", { hour12: false });
}

function dateInput(value: unknown) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatAiValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function normalizeAiFieldPath(fieldPath: string) {
  return fieldPath
    .replace(/^formData\./, "")
    .replace(/^payload\./, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .trim();
}

type AiFieldMarker = {
  kind: "proposal" | "warning";
  title: string;
};

function mergeDraftFormData(current: ProjectEditorFormValues, formData: unknown): ProjectEditorFormValues {
  if (!formData || typeof formData !== "object" || Array.isArray(formData)) return current;
  const data = formData as Partial<ProjectEditorFormValues>;
  return {
    ...current,
    ...data,
    areaM2: data.areaM2 === null || data.areaM2 === undefined ? undefined : Number(data.areaM2),
    unitPrice: data.unitPrice === null || data.unitPrice === undefined ? undefined : Number(data.unitPrice),
    members: Array.isArray(data.members) ? data.members : current.members,
    paymentSchedules: Array.isArray(data.paymentSchedules) ? data.paymentSchedules : current.paymentSchedules,
    drawings: Array.isArray(data.drawings) ? data.drawings : current.drawings,
  };
}

function buildDefaultValues(currentUserId: string, initialValues?: Partial<ProjectEditorFormValues>): ProjectEditorFormValues {
  return {
    customerName: initialValues?.customerName || "",
    customerPhone: initialValues?.customerPhone || "",
    customerIdNumber: initialValues?.customerIdNumber || "",
    customerPermanentAddress: initialValues?.customerPermanentAddress || "",
    address: initialValues?.address || "",
    name: initialValues?.name || "",
    areaM2: initialValues?.areaM2 === undefined || initialValues.areaM2 === null ? undefined : Number(initialValues.areaM2),
    unitPrice: initialValues?.unitPrice === undefined || initialValues.unitPrice === null ? undefined : Number(initialValues.unitPrice),
    contractSignDate: dateInput(initialValues?.contractSignDate) || "",
    startDate: dateInput(initialValues?.startDate) || todayIso(),
    expectedEndDate: dateInput(initialValues?.expectedEndDate) || todayPlusDaysIso(120),
    plannedDeadline: dateInput(initialValues?.plannedDeadline) || "",
    templateCategory: initialValues?.templateCategory || "nha_pho_1t1l",
    projectManagerId: initialValues?.projectManagerId || "",
    mainEngineerId: initialValues?.mainEngineerId || "",
    status: initialValues?.status || "planning",
    actualEndDate: dateInput(initialValues?.actualEndDate),
    notes: initialValues?.notes || "",
    warrantyTotalMonths: initialValues?.warrantyTotalMonths ?? 12,
    warrantyStructureYears: initialValues?.warrantyStructureYears ?? 5,
    warrantyLeakYears: initialValues?.warrantyLeakYears ?? 2,
    members: initialValues?.members || [],
    paymentSchedules: initialValues?.paymentSchedules || [],
    drawings: initialValues?.drawings || [],
  };
}

function draftFormData(values: ProjectEditorFormValues) {
  return {
    ...values,
    areaM2: Number.isFinite(values.areaM2) ? values.areaM2 : null,
    unitPrice: Number.isFinite(values.unitPrice) ? values.unitPrice : null,
    plannedDeadline: values.plannedDeadline || null,
    actualEndDate: values.actualEndDate || null,
    notes: values.notes || null,
  };
}

export function ProjectEditorForm({ mode, projectId, initialDraftId, currentUserId, currentUserRole, currentUserName, initialValues }: ProjectEditorFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [applyingProposals, setApplyingProposals] = useState(false);
  const [applyingSupplements, setApplyingSupplements] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingTemplateSummary, setLoadingTemplateSummary] = useState(true);
  const [admins, setAdmins] = useState<OptionUser[]>([]);
  const [engineers, setEngineers] = useState<OptionUser[]>([]);
  const [members, setMembers] = useState<OptionUser[]>([]);
  const [templatePhases, setTemplatePhases] = useState<TemplatePhaseItem[]>([]);
  const [templateTotalDuration, setTemplateTotalDuration] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId || null);
  const [draftFiles, setDraftFiles] = useState<DraftFile[]>([]);
  const [aiProposals, setAiProposals] = useState<AiProposal[]>([]);
  const [aiConflicts, setAiConflicts] = useState<AiConflict[]>([]);
  const [draftAudits, setDraftAudits] = useState<DraftAudit[]>([]);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [fileKind, setFileKind] = useState<DraftFile["fileKind"]>("contract");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isCreate = mode === "create";

  const form = useForm<ProjectEditorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaultValues(currentUserId, initialValues),
    mode: "onChange",
  });

  const membersFieldArray = useFieldArray({
    control: form.control,
    name: "members",
  });

  const paymentSchedulesFieldArray = useFieldArray({
    control: form.control,
    name: "paymentSchedules",
  });

  useEffect(() => {
    async function loadOptions() {
      const res = await fetch("/api/admin/users/options", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        admins?: OptionUser[];
        engineers?: OptionUser[];
        members?: OptionUser[];
        message?: string;
      };

      setLoadingOptions(false);

      if (!res.ok) {
        toast.error("Không tải được danh sách user", { description: data.message || "Vui lòng thử lại" });
        return;
      }

      setAdmins(data.admins || []);
      setEngineers(data.engineers || []);
      setMembers(data.members || []);

      if (!form.getValues("projectManagerId") && data.admins?.[0]) {
        form.setValue("projectManagerId", data.admins[0].id);
      }
    }

    loadOptions();
  }, [currentUserId, form]);

  const areaM2 = form.watch("areaM2");
  const unitPrice = form.watch("unitPrice");
  const selectedMembers = form.watch("members");
  const startDateValue = form.watch("startDate");
  const plannedDeadlineValue = form.watch("plannedDeadline");
  const templateCategoryValue = form.watch("templateCategory");
  const paymentSchedulesValue = form.watch("paymentSchedules") || [];
  const drawingsValue = form.watch("drawings") || [];
  const supplementalPaymentCount = Array.isArray(paymentSchedulesValue) ? paymentSchedulesValue.length : 0;
  const supplementalDrawingCount = Array.isArray(drawingsValue) ? drawingsValue.length : 0;

  useEffect(() => {
    let mounted = true;

    async function loadTemplateSummary() {
      if (templateCategoryValue === "blank") {
        setTemplatePhases([]);
        setTemplateTotalDuration(0);
        setLoadingTemplateSummary(false);
        return;
      }
      setLoadingTemplateSummary(true);
      const params = new URLSearchParams({ templateCategory: templateCategoryValue });
      const res = await fetch(`/api/projects/template-phase-summary?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as TemplatePhaseSummaryResponse & { message?: string };

      if (!mounted) return;

      if (!res.ok) {
        setTemplatePhases([]);
        setTemplateTotalDuration(0);
        setLoadingTemplateSummary(false);
        toast.error("Không tải được phase template", { description: data.message || "Vui lòng thử lại" });
        return;
      }

      setTemplatePhases(data.phases || []);
      setTemplateTotalDuration(Number(data.totalDuration || 0));
      setLoadingTemplateSummary(false);
    }

    loadTemplateSummary();

    return () => {
      mounted = false;
    };
  }, [templateCategoryValue]);

  const contractValue = useMemo(() => Number(areaM2 || 0) * Number(unitPrice || 0), [areaM2, unitPrice]);

  const hasDuplicateMembers = useMemo(() => {
    const ids = selectedMembers.map((m) => m.userId).filter(Boolean);
    return new Set(ids).size !== ids.length;
  }, [selectedMembers]);

  const calculatedEndDate = useMemo(() => {
    if (!startDateValue || templateTotalDuration < 1) return null;
    const startDate = parseIsoDate(startDateValue);
    return addDays(startDate, templateTotalDuration - 1);
  }, [startDateValue, templateTotalDuration]);

  const exceedDays = useMemo(() => {
    if (!calculatedEndDate || !plannedDeadlineValue) return 0;
    const plannedDeadline = parseIsoDate(plannedDeadlineValue);
    const diffMs = calculatedEndDate.getTime() - plannedDeadline.getTime();
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / 86400000);
  }, [calculatedEndDate, plannedDeadlineValue]);

  const isSubmitDisabled = submitting || hasDuplicateMembers || loadingOptions || loadingTemplateSummary;

  const aiFieldMarkers = useMemo(() => {
    const markerMap = new Map<string, AiFieldMarker[]>();

    const appendMarker = (rawPath: string, marker: AiFieldMarker) => {
      const path = normalizeAiFieldPath(rawPath);
      if (!path) return;
      const list = markerMap.get(path) || [];
      list.push(marker);
      markerMap.set(path, list);
    };

    aiProposals.forEach((proposal) => {
      appendMarker(proposal.fieldPath, {
        kind: proposal.action === "warning_only" ? "warning" : "proposal",
        title: [
          `AI ${proposal.action === "warning_only" ? "cảnh báo" : "đề xuất"}`,
          `Field: ${proposal.fieldPath}`,
          `Giá trị: ${formatAiValue(proposal.suggestedValue)}`,
          proposal.reason ? `Mô tả: ${proposal.reason}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    });

    aiConflicts.forEach((conflict) => {
      appendMarker(conflict.fieldPath, {
        kind: "warning",
        title: [
          "AI cảnh báo xung đột",
          `Field: ${conflict.fieldPath}`,
          `Hiện tại: ${formatAiValue(conflict.currentValue)}`,
          `Hồ sơ: ${formatAiValue(conflict.suggestedValue)}`,
          conflict.reason ? `Mô tả: ${conflict.reason}` : `Loại xung đột: ${conflict.conflictType}`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    });

    return markerMap;
  }, [aiConflicts, aiProposals]);

  const getFieldMarkers = useCallback((fieldName: string) => {
    const normalizedField = normalizeAiFieldPath(fieldName);
    const entries: AiFieldMarker[] = [];

    aiFieldMarkers.forEach((markers, path) => {
      if (
        path === normalizedField
        || path.endsWith(`.${normalizedField}`)
        || normalizedField.endsWith(`.${path}`)
        || path.startsWith(`${normalizedField}.`)
        || normalizedField.startsWith(`${path}.`)
      ) {
        entries.push(...markers);
      }
    });

    const dedup = new Set<string>();
    return entries.filter((entry) => {
      const key = `${entry.kind}::${entry.title}`;
      if (dedup.has(key)) return false;
      dedup.add(key);
      return true;
    });
  }, [aiFieldMarkers]);

  const hasFieldWarning = useCallback((fieldName: string) => getFieldMarkers(fieldName).some((marker) => marker.kind === "warning"), [getFieldMarkers]);

  const getFieldInputClassName = useCallback((fieldName: string) => {
    if (hasFieldWarning(fieldName)) return "w-full rounded-md border border-amber-400 px-3 py-2 text-sm";
    if (getFieldMarkers(fieldName).length > 0) return "w-full rounded-md border border-emerald-400 px-3 py-2 text-sm";
    return "w-full rounded-md border px-3 py-2 text-sm";
  }, [getFieldMarkers, hasFieldWarning]);

  function renderFieldMarker(fieldName: string) {
    const markers = getFieldMarkers(fieldName);
    if (markers.length === 0) return null;

    return (
      <span className="ml-2 inline-flex items-center gap-1 align-middle">
        {markers.map((marker, index) => (
          <span key={`${fieldName}-${marker.kind}-${index}`} className="group relative inline-flex">
            <span
              tabIndex={0}
              aria-label={marker.title}
              className={marker.kind === "warning" ? "inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-[11px] leading-none text-amber-700" : "inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-emerald-300 bg-emerald-100 text-[11px] leading-none text-emerald-700"}
            >
              {marker.kind === "warning" ? "!" : "AI"}
            </span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-72 -translate-x-1/2 whitespace-pre-line rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg group-hover:block group-focus-within:block">
              {marker.title}
            </span>
          </span>
        ))}
      </span>
    );
  }

  function addPaymentSchedule() {
    paymentSchedulesFieldArray.append({
      type: "contract",
      installmentNo: paymentSchedulesFieldArray.fields.length + 1,
      description: "",
      percent: undefined,
      amount: undefined,
      dueDate: "",
      paymentNote: "",
    });
  }

  function validateFinancial(values: ProjectEditorFormValues) {
    if (!Number.isFinite(values.areaM2) || Number(values.areaM2) < 1) {
      toast.error("Diện tích quy đổi là bắt buộc");
      return false;
    }
    if (!Number.isFinite(values.unitPrice) || Number(values.unitPrice) < 1_000_000) {
      toast.error("Đơn giá là bắt buộc");
      return false;
    }
    return true;
  }

  const refreshDraft = useCallback(async (nextDraftId: string) => {
    const res = await fetch(`/api/project-drafts/${nextDraftId}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      draft?: {
        formData?: unknown;
        files?: DraftFile[];
        audits?: DraftAudit[];
        latestAiRun?: { proposals?: AiProposal[]; conflicts?: AiConflict[] } | null;
      };
      message?: string;
    };
    if (!res.ok) {
      toast.error("Không tải được bản nháp", { description: data.message || "Vui lòng thử lại" });
      return;
    }
    form.reset(mergeDraftFormData(form.getValues(), data.draft?.formData));
    setDraftFiles(data.draft?.files || []);
    setAiProposals(data.draft?.latestAiRun?.proposals || []);
    setAiConflicts(data.draft?.latestAiRun?.conflicts || []);
    setDraftAudits(data.draft?.audits || []);
    setSelectedProposalIds([]);
  }, [form]);

  useEffect(() => {
    if (!initialDraftId) return;
    setDraftId(initialDraftId);
    refreshDraft(initialDraftId);
  }, [initialDraftId, refreshDraft]);

  async function saveDraft() {
    setSavingDraft(true);
    const values = form.getValues();
    const payload = {
      mode: isCreate ? "create_project" : "update_project",
      projectId: isCreate ? null : projectId,
      formData: draftFormData(values),
    };

    const res = await fetch(draftId ? `/api/project-drafts/${draftId}` : "/api/project-drafts", {
      method: draftId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftId ? { formData: payload.formData } : payload),
    });
    const data = (await res.json().catch(() => ({}))) as { draft?: { id: string }; message?: string };
    setSavingDraft(false);

    if (!res.ok || !data.draft?.id) {
      toast.error("Lưu nháp thất bại", { description: data.message || "Vui lòng thử lại" });
      return null;
    }

    setDraftId(data.draft.id);
    if (isCreate) {
      router.replace(`/projects/new?draftId=${data.draft.id}`);
    } else if (projectId) {
      router.replace(`/projects/${projectId}/edit?draftId=${data.draft.id}`);
    }
    toast.success(data.message || "Đã lưu bản nháp");
    await refreshDraft(data.draft.id);
    return data.draft.id;
  }

  async function uploadDraftFile() {
    if (!selectedFile) {
      toast.error("Vui lòng chọn file hồ sơ");
      return;
    }

    setUploadingFile(true);
    const nextDraftId = draftId || (await saveDraft());
    if (!nextDraftId) {
      setUploadingFile(false);
      return;
    }

    const body = new FormData();
    body.append("fileKind", fileKind);
    body.append("file", selectedFile);

    const res = await fetch(`/api/project-drafts/${nextDraftId}/files`, { method: "POST", body });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setUploadingFile(false);

    if (!res.ok) {
      toast.error("Upload hồ sơ thất bại", { description: data.message || "Vui lòng thử lại" });
      return;
    }

    toast.success(data.message || "Đã upload hồ sơ");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await refreshDraft(nextDraftId);
  }

  async function deleteDraftFile(fileId: string) {
    if (!draftId) return;
    const res = await fetch(`/api/project-drafts/${draftId}/files/${fileId}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      toast.error("Xóa hồ sơ thất bại", { description: data.message || "Vui lòng thử lại" });
      return;
    }
    toast.success(data.message || "Đã xóa hồ sơ");
    await refreshDraft(draftId);
  }

  async function runAiAnalysis() {
    setAnalyzingAi(true);
    const nextDraftId = draftId || (await saveDraft());
    if (!nextDraftId) {
      setAnalyzingAi(false);
      return;
    }

    const res = await fetch(`/api/project-drafts/${nextDraftId}/ai-run`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      run?: { proposals?: AiProposal[]; conflicts?: AiConflict[] };
      draft?: { formData?: unknown };
      autoApplied?: { appliedFields?: Array<{ fieldPath: string; action: string }>; skippedFields?: Array<{ fieldPath: string; action: string; reason: string }> };
      message?: string;
      error?: string;
    };
    setAnalyzingAi(false);

    if (!res.ok) {
      toast.error("AI phân tích thất bại", { description: data.message || data.error || "Vui lòng thử lại" });
      return;
    }

    const proposals = data.run?.proposals || [];
    const conflicts = data.run?.conflicts || [];
    setAiProposals(proposals);
    setAiConflicts(conflicts);
    setSelectedProposalIds([]);

    const serverAppliedCount = data.autoApplied?.appliedFields?.length || 0;
    if (serverAppliedCount > 0) {
      form.reset(mergeDraftFormData(form.getValues(), data.draft?.formData));
      toast.success(`AI đã điền tự động ${serverAppliedCount} đề xuất`);
      await refreshDraft(nextDraftId);
      return;
    }

    const autoApplyIds = proposals.filter((proposal) => proposal.action !== "warning_only").map((proposal) => proposal.id);
    if (autoApplyIds.length > 0) {
      const applyRes = await fetch(`/api/project-drafts/${nextDraftId}/apply-proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: autoApplyIds }),
      });
      const applyData = (await applyRes.json().catch(() => ({}))) as { draft?: { formData?: unknown }; message?: string };

      if (!applyRes.ok) {
        toast.error("AI phân tích xong nhưng apply tự động thất bại", { description: applyData.message || "Vui lòng bấm Apply thủ công" });
        await refreshDraft(nextDraftId);
        return;
      }

      form.reset(mergeDraftFormData(form.getValues(), applyData.draft?.formData));
      toast.success(`AI đã điền tự động ${autoApplyIds.length} đề xuất`);
      await refreshDraft(nextDraftId);
      return;
    }

    const diagnostic = [
      ...conflicts.slice(0, 2).map((conflict) => conflict.reason || `${conflict.fieldPath}: ${conflict.conflictType}`),
      ...proposals.filter((proposal) => proposal.action === "warning_only").slice(0, 2).map((proposal) => proposal.reason || `${proposal.fieldPath}: warning`),
    ]
      .filter(Boolean)
      .join("\n");
    toast(proposals.length === 0 ? "AI chưa tìm được dữ liệu để điền form" : "AI chỉ tạo cảnh báo, chưa có đề xuất điền form", {
      description: diagnostic || "PDF có thể là bản scan/ảnh hoặc thiếu dữ liệu khớp với field của form.",
    });
    await refreshDraft(nextDraftId);
  }

  function toggleProposal(proposalId: string) {
    setSelectedProposalIds((prev) => (prev.includes(proposalId) ? prev.filter((id) => id !== proposalId) : [...prev, proposalId]));
  }

  async function applySelectedProposals() {
    if (!draftId || selectedProposalIds.length === 0) {
      toast.error("Vui lòng chọn đề xuất cần apply");
      return;
    }

    setApplyingProposals(true);
    const res = await fetch(`/api/project-drafts/${draftId}/apply-proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalIds: selectedProposalIds }),
    });
    const data = (await res.json().catch(() => ({}))) as { draft?: { formData?: unknown }; message?: string };
    setApplyingProposals(false);

    if (!res.ok) {
      toast.error("Apply đề xuất thất bại", { description: data.message || "Vui lòng thử lại" });
      return;
    }

    form.reset(mergeDraftFormData(form.getValues(), data.draft?.formData));
    toast.success(data.message || "Đã apply đề xuất vào form");
    await refreshDraft(draftId);
  }

  async function applySupplementData(targetProjectId?: string) {
    if (!draftId) {
      toast.error("Cần lưu nháp trước khi ghi dữ liệu bổ sung");
      return false;
    }
    if (!targetProjectId) {
      toast.error("Cần dự án chính thức trước khi ghi dữ liệu bổ sung");
      return false;
    }

    setApplyingSupplements(true);
    const res = await fetch(`/api/project-drafts/${draftId}/apply-supplements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: targetProjectId }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setApplyingSupplements(false);

    if (!res.ok) {
      toast.error("Ghi dữ liệu bổ sung thất bại", { description: data.message || "Vui lòng thử lại" });
      return false;
    }

    toast.success(data.message || "Đã ghi dữ liệu bổ sung");
    await refreshDraft(draftId);
    router.refresh();
    return true;
  }

  async function submitCreate(values: ProjectEditorFormValues) {
    const payload = {
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      customerIdNumber: values.customerIdNumber || null,
      customerPermanentAddress: values.customerPermanentAddress || null,
      address: values.address,
      name: values.name,
      areaM2: values.areaM2,
      unitPrice: values.unitPrice,
      contractSignDate: values.contractSignDate || null,
      startDate: values.startDate,
      expectedEndDate: values.expectedEndDate,
      plannedDeadline: values.plannedDeadline || null,
      templateCategory: values.templateCategory,
      projectManagerId: values.projectManagerId,
      mainEngineerId: values.mainEngineerId,
      warrantyTotalMonths: values.warrantyTotalMonths,
      warrantyStructureYears: values.warrantyStructureYears,
      warrantyLeakYears: values.warrantyLeakYears,
      members: values.members,
      paymentSchedules: values.paymentSchedules || [],
    };

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; code?: string; message?: string };

    if (!res.ok || !data.id) {
      toast.error("Tạo dự án thất bại", { description: data.message || "Vui lòng kiểm tra dữ liệu đầu vào." });
      return;
    }

    toast.success(data.message || `Đã tạo dự án ${data.code || ""}`);
    if (draftId && supplementalDrawingCount > 0) {
      await applySupplementData(data.id);
    }
    router.push(`/projects/${data.id}`);
    router.refresh();
  }

  async function submitUpdate(values: ProjectEditorFormValues) {
    if (!projectId) return;
    const currentStartDate = dateInput(initialValues?.startDate);
    if (currentStartDate && values.startDate !== currentStartDate) {
      const ok = window.confirm(
        "Việc đổi ngày khởi công sẽ tự cập nhật lại ngày dự kiến của công tác và các đợt thanh toán. Các ngày THỰC TẾ đã nhập không bị ảnh hưởng.",
      );
      if (!ok) return;
    }

    const requests = [
      fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "owner",
          payload: {
            customerName: values.customerName,
            customerPhone: values.customerPhone,
            customerIdNumber: values.customerIdNumber || null,
            address: values.address,
          },
        }),
      }),
      fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "project",
          payload: {
            name: values.name,
            areaM2: Number(values.areaM2),
            unitPrice: Number(values.unitPrice),
            startDate: values.startDate,
            expectedEndDate: values.expectedEndDate,
            plannedDeadline: values.plannedDeadline || null,
            actualEndDate: values.actualEndDate || null,
            status: values.status,
            notes: values.notes || null,
          },
        }),
      }),
      fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "assignment",
          payload: {
            projectManagerId: values.projectManagerId,
            mainEngineerId: values.mainEngineerId,
          },
        }),
      }),
    ];

    for (const req of requests) {
      const res = await req;
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error("Cập nhật dự án thất bại", { description: data.message || "Vui lòng thử lại" });
        return;
      }
    }

    if (draftId && (supplementalPaymentCount > 0 || supplementalDrawingCount > 0)) {
      await applySupplementData(projectId);
    }

    toast.success("Đã cập nhật dự án");
    router.push(`/projects/${projectId}`);
    router.refresh();
  }

  async function onSubmit(values: ProjectEditorFormValues) {
    if (hasDuplicateMembers) {
      toast.error("Không được chọn trùng thành viên dự án");
      return;
    }
    if (!validateFinancial(values)) return;

    setSubmitting(true);
    if (isCreate) {
      await submitCreate(values);
    } else {
      await submitUpdate(values);
    }
    setSubmitting(false);
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 text-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Hồ sơ & AI hỗ trợ nhập</h2>
            <p className="mt-1 text-sm text-slate-600">Có thể lưu nháp khi chưa đủ field bắt buộc, upload HĐ/dự toán/bản vẽ/phụ lục rồi phân tích ở bước AI.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={saveDraft} disabled={savingDraft}>
              {savingDraft ? "Đang lưu nháp..." : draftId ? "Lưu lại bản nháp" : "Lưu nháp"}
            </Button>
            <Button type="button" variant="outline" onClick={runAiAnalysis} disabled={analyzingAi || savingDraft}>
              {analyzingAi ? "AI đang phân tích..." : "AI phân tích hỗ trợ nhập"}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <select className="rounded-md border px-3 py-2 text-sm" value={fileKind} onChange={(e) => setFileKind(e.target.value as DraftFile["fileKind"])}>
            {fileKindOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input ref={fileInputRef} type="file" className="rounded-md border bg-white px-3 py-2 text-sm" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
          <Button type="button" variant="outline" onClick={uploadDraftFile} disabled={uploadingFile}>
            {uploadingFile ? "Đang upload..." : "Upload hồ sơ"}
          </Button>
        </div>

        {draftFiles.length > 0 ? (
          <div className="mt-4 space-y-2">
            {draftFiles.map((file) => (
              <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                <div>
                  <a href={file.viewUrl} target="_blank" rel="noreferrer" className="font-medium text-[#1F4E79] underline">{file.fileName}</a>
                  <span className="ml-2 text-xs text-slate-500">{fileSizeLabel(file.fileSize)} · {fileKindOptions.find((opt) => opt.value === file.fileKind)?.label}</span>
                </div>
                <Button type="button" variant="outline" onClick={() => deleteDraftFile(file.id)}>Xóa</Button>
              </div>
            ))}
          </div>
        ) : null}

        {(!isCreate && supplementalPaymentCount > 0) || supplementalDrawingCount > 0 ? (
          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Dữ liệu bổ sung đã duyệt</h3>
                <p className="text-xs">{!isCreate ? `${supplementalPaymentCount} lịch thanh toán · ` : ""}{supplementalDrawingCount} bản vẽ</p>
              </div>
              {!isCreate ? (
                <Button type="button" variant="outline" onClick={() => applySupplementData(projectId)} disabled={applyingSupplements || !draftId}>
                  {applyingSupplements ? "Đang ghi bổ sung..." : "Ghi bổ sung vào dự án"}
                </Button>
              ) : null}
            </div>
            {isCreate ? <p className="mt-2 text-xs">Khi bấm Tạo dự án, các dữ liệu bổ sung đã duyệt sẽ được ghi sau khi dự án chính thức được tạo.</p> : null}
          </div>
        ) : null}

        {draftAudits.length > 0 ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-slate-800">Lịch sử xử lý</h3>
            <div className="mt-2 space-y-2 text-xs text-slate-700">
              {draftAudits.slice(0, 8).map((audit) => (
                <div key={audit.id} className="rounded border bg-slate-50 px-2 py-1">
                  <div className="font-medium">{audit.action} · {formatDateTimeVi(audit.createdAt)}</div>
                  <div>Người thao tác: {audit.actor?.fullName || "Admin"}</div>
                  <div>Kết quả: {formatAiValue(audit.payload)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-white p-5 text-slate-900">
        <h2 className="mb-4 text-lg font-semibold">Section A - Thông tin chủ nhà</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Tên chủ nhà *{renderFieldMarker("customerName")}</label>
            <input className={getFieldInputClassName("customerName")} {...form.register("customerName")} />
            {form.formState.errors.customerName ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.customerName.message}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">SĐT chủ nhà *{renderFieldMarker("customerPhone")}</label>
            <input className={getFieldInputClassName("customerPhone")} {...form.register("customerPhone")} />
            {form.formState.errors.customerPhone ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.customerPhone.message}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">CMND/CCCD (tuỳ chọn){renderFieldMarker("customerIdNumber")}</label>
            <input className={getFieldInputClassName("customerIdNumber")} {...form.register("customerIdNumber")} />
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Địa chỉ thường trú (tuỳ chọn){renderFieldMarker("customerPermanentAddress")}</label>
          <textarea rows={2} className={getFieldInputClassName("customerPermanentAddress")} {...form.register("customerPermanentAddress")} />
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Địa chỉ công trình *{renderFieldMarker("address")}</label>
          <textarea rows={2} className={getFieldInputClassName("address")} {...form.register("address")} />
          {form.formState.errors.address ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.address.message}</p> : null}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 text-slate-900">
        <h2 className="mb-4 text-lg font-semibold">Section B - Thông tin dự án</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Tên dự án *{renderFieldMarker("name")}</label>
            <input className={getFieldInputClassName("name")} placeholder="Nhà anh/chị [Tên] - [Quận]" {...form.register("name")} />
            {form.formState.errors.name ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Loại công trình *{renderFieldMarker("templateCategory")}</label>
            <select className={getFieldInputClassName("templateCategory")} {...form.register("templateCategory")} disabled={!isCreate}>
              <option value="nha_pho_1t1l">Nhà phố 1T1L</option>
              <option value="blank">Tạo trống (tự thêm phase/task sau)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Diện tích quy đổi m2 *{renderFieldMarker("areaM2")}</label>
            <input type="number" min={1} className={getFieldInputClassName("areaM2")} {...form.register("areaM2", { valueAsNumber: true })} />
            {form.formState.errors.areaM2 ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.areaM2.message}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Đơn giá đồng/m2 *{renderFieldMarker("unitPrice")}</label>
            <input type="number" min={1_000_000} className={getFieldInputClassName("unitPrice")} {...form.register("unitPrice", { valueAsNumber: true })} />
            {form.formState.errors.unitPrice ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.unitPrice.message}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Giá trị HĐ (readonly)</label>
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm font-medium">{formatMoney(contractValue)}</div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Ngày ký HĐ (tuỳ chọn){renderFieldMarker("contractSignDate")}</label>
            <input type="date" className={getFieldInputClassName("contractSignDate")} {...form.register("contractSignDate")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Ngày khởi công *{renderFieldMarker("startDate")}</label>
            <input type="date" className={getFieldInputClassName("startDate")} {...form.register("startDate")} />
            {form.formState.errors.startDate ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.startDate.message}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Ngày bàn giao dự kiến *{renderFieldMarker("expectedEndDate")}</label>
            <input type="date" className={getFieldInputClassName("expectedEndDate")} {...form.register("expectedEndDate")} />
            {form.formState.errors.expectedEndDate ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.expectedEndDate.message}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Deadline phase timeline (tuỳ chọn){renderFieldMarker("plannedDeadline")}</label>
            <input type="date" className={getFieldInputClassName("plannedDeadline")} {...form.register("plannedDeadline")} />
          </div>

          {!isCreate ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Bàn giao thực tế{renderFieldMarker("actualEndDate")}</label>
                <input type="date" className={getFieldInputClassName("actualEndDate")} {...form.register("actualEndDate")} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Trạng thái{renderFieldMarker("status")}</label>
                <select className={getFieldInputClassName("status")} {...form.register("status")}>
                  <option value="planning">planning</option>
                  <option value="in_progress">in_progress</option>
                  <option value="completed">completed</option>
                  <option value="paused">paused</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">Ghi chú{renderFieldMarker("notes")}</label>
                <textarea rows={2} className={getFieldInputClassName("notes")} {...form.register("notes")} />
              </div>
            </>
          ) : null}
        </div>

        {templateCategoryValue === "blank" ? (
          <div className="mt-5 rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-slate-600">
            Chế độ tạo trống: dự án sẽ không có phase/task. Anh sẽ thêm thủ công sau khi tạo dự án.
          </div>
        ) : (
          <div className="mt-5 rounded-lg border bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold">Phase từ template</h3>
            {loadingTemplateSummary ? (
              <div className="text-sm text-slate-500">Đang tải phase template...</div>
            ) : templatePhases.length === 0 ? (
              <div className="text-sm text-slate-500">Không có dữ liệu phase template.</div>
            ) : (
              <div className="space-y-2">
                {templatePhases.map((phase) => (
                  <div key={phase.code} className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm">
                    <span>{phase.code} {phase.name}</span>
                    <span className="font-medium">{phase.duration} ngày</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-1 text-sm">
              <div className="text-slate-700">Tổng: <span className="font-semibold">{templateTotalDuration} ngày</span></div>
              <div className="text-slate-700">KT dự kiến: <span className="font-semibold">{formatDateVi(calculatedEndDate)}</span></div>
            </div>
            {exceedDays > 0 ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Vượt deadline {exceedDays} ngày. Hãy giảm duration phase hoặc dời deadline.
              </div>
            ) : null}
          </div>
        )}
      </div>

      {isCreate ? (
        <div className="rounded-xl border bg-white p-5 text-slate-900">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Section C - Các đợt thanh toán{renderFieldMarker("paymentSchedules")}</h2>
              <p className="mt-1 text-sm text-slate-600">Theo mẫu HĐ: Đợt, nội dung công việc, %, số tiền, ghi chú. Nếu AI đọc được hợp đồng, AI sẽ tự điền đủ các đợt vào đây.</p>
            </div>
            <Button type="button" variant="outline" onClick={addPaymentSchedule}>+ Thêm đợt</Button>
          </div>

          {paymentSchedulesFieldArray.fields.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm text-slate-500">Chưa có đợt thanh toán. Có thể bấm + để nhập thủ công, hoặc upload hợp đồng rồi chạy AI.</div>
          ) : (
            <div className="space-y-3">
              {paymentSchedulesFieldArray.fields.map((field, idx) => {
                const rowErrors = form.formState.errors.paymentSchedules?.[idx];
                return (
                  <div key={field.id} className="rounded-lg border bg-slate-50 p-3">
                    <div className="grid gap-3 md:grid-cols-[90px_1fr_100px_150px_150px_auto]">
                      <div>
                        <label className="mb-1 block text-xs font-medium">Đợt{renderFieldMarker(`paymentSchedules.${idx}.installmentNo`)}</label>
                        <input type="number" min={1} className={getFieldInputClassName(`paymentSchedules.${idx}.installmentNo`)} {...form.register(`paymentSchedules.${idx}.installmentNo` as const, { setValueAs: (value) => (value === "" ? undefined : Number(value)) })} />
                        {rowErrors?.installmentNo ? <p className="mt-1 text-xs text-red-600">{rowErrors.installmentNo.message}</p> : null}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Nội dung công việc{renderFieldMarker(`paymentSchedules.${idx}.description`)}</label>
                        <input className={getFieldInputClassName(`paymentSchedules.${idx}.description`)} placeholder="VD: Tạm ứng khởi công" {...form.register(`paymentSchedules.${idx}.description` as const)} />
                        {rowErrors?.description ? <p className="mt-1 text-xs text-red-600">{rowErrors.description.message}</p> : null}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">%{renderFieldMarker(`paymentSchedules.${idx}.percent`)}</label>
                        <input type="number" min={0} max={100} step="0.01" className={getFieldInputClassName(`paymentSchedules.${idx}.percent`)} {...form.register(`paymentSchedules.${idx}.percent` as const, { setValueAs: (value) => (value === "" ? undefined : Number(value)) })} />
                        {rowErrors?.percent ? <p className="mt-1 text-xs text-red-600">{rowErrors.percent.message}</p> : null}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Số tiền{renderFieldMarker(`paymentSchedules.${idx}.amount`)}</label>
                        <input type="number" min={1} className={getFieldInputClassName(`paymentSchedules.${idx}.amount`)} {...form.register(`paymentSchedules.${idx}.amount` as const, { setValueAs: (value) => (value === "" ? undefined : Number(value)) })} />
                        {rowErrors?.amount ? <p className="mt-1 text-xs text-red-600">{rowErrors.amount.message}</p> : null}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Ngày hạn{renderFieldMarker(`paymentSchedules.${idx}.dueDate`)}</label>
                        <input type="date" className={getFieldInputClassName(`paymentSchedules.${idx}.dueDate`)} {...form.register(`paymentSchedules.${idx}.dueDate` as const)} />
                      </div>
                      <div className="flex items-end">
                        <Button type="button" variant="outline" onClick={() => paymentSchedulesFieldArray.remove(idx)}>Xóa</Button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-medium">Ghi chú{renderFieldMarker(`paymentSchedules.${idx}.paymentNote`)}</label>
                      <input className={getFieldInputClassName(`paymentSchedules.${idx}.paymentNote`)} placeholder="VD: Chủ đầu tư thanh toán phần còn lại" {...form.register(`paymentSchedules.${idx}.paymentNote` as const)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border bg-white p-5 text-slate-900">
        <h2 className="mb-4 text-lg font-semibold">Section D - Phân công</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">GĐ Thi Công *{renderFieldMarker("projectManagerId")}</label>
            <select className={getFieldInputClassName("projectManagerId")} {...form.register("projectManagerId")}>
              <option value="">Chọn GĐ Thi Công</option>
              {admins.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>)}
            </select>
            {form.formState.errors.projectManagerId ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.projectManagerId.message}</p> : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">KS chính *{renderFieldMarker("mainEngineerId")}</label>
            <select className={getFieldInputClassName("mainEngineerId")} {...form.register("mainEngineerId")}>
              <option value="">Chọn KS chính</option>
              {engineers.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>)}
            </select>
            {form.formState.errors.mainEngineerId ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.mainEngineerId.message}</p> : null}
          </div>
        </div>

        {isCreate ? (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Thành viên dự án (multi select){renderFieldMarker("members")}</h3>
              <Button type="button" variant="outline" onClick={() => membersFieldArray.append({ userId: "", roleInProject: "engineer" })}>+ Thêm thành viên</Button>
            </div>
            {membersFieldArray.fields.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-sm text-slate-500">Chưa thêm thành viên.</div>
            ) : (
              membersFieldArray.fields.map((field, idx) => (
                <div key={field.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_220px_auto]">
                  <select className={hasFieldWarning(`members.${idx}.userId`) ? "rounded-md border border-amber-400 px-3 py-2 text-sm" : getFieldMarkers(`members.${idx}.userId`).length > 0 ? "rounded-md border border-emerald-400 px-3 py-2 text-sm" : "rounded-md border px-3 py-2 text-sm"} {...form.register(`members.${idx}.userId`)}>
                    <option value="">Chọn user</option>
                    {members.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>)}
                  </select>
                  <select className={hasFieldWarning(`members.${idx}.roleInProject`) ? "rounded-md border border-amber-400 px-3 py-2 text-sm" : getFieldMarkers(`members.${idx}.roleInProject`).length > 0 ? "rounded-md border border-emerald-400 px-3 py-2 text-sm" : "rounded-md border px-3 py-2 text-sm"} {...form.register(`members.${idx}.roleInProject`)}>
                    <option value="engineer">engineer</option>
                    <option value="foreman">foreman</option>
                    <option value="accountant">accountant</option>
                    <option value="construction_manager">construction_manager</option>
                  </select>
                  <Button type="button" variant="outline" onClick={() => membersFieldArray.remove(idx)}>Xóa</Button>
                </div>
              ))
            )}
            {hasDuplicateMembers ? <p className="text-xs text-red-600">Không được chọn trùng user trong thành viên dự án.</p> : null}
          </div>
        ) : (
          <div className="mt-5 rounded-md border border-dashed p-3 text-sm text-slate-500">Thành viên phụ cập nhật ở tab Thành viên; màn này chỉ cập nhật GĐ Thi Công và KS chính.</div>
        )}
      </div>

      {isCreate ? (
        <div className="rounded-xl border bg-white p-5 text-slate-900">
          <h2 className="mb-4 text-lg font-semibold">Section E - Điều khoản HĐ</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Bảo hành tổng (tháng){renderFieldMarker("warrantyTotalMonths")}</label>
              <input type="number" min={0} className={getFieldInputClassName("warrantyTotalMonths")} {...form.register("warrantyTotalMonths", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Bảo hành kết cấu (năm){renderFieldMarker("warrantyStructureYears")}</label>
              <input type="number" min={0} className={getFieldInputClassName("warrantyStructureYears")} {...form.register("warrantyStructureYears", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Bảo hành chống thấm (năm){renderFieldMarker("warrantyLeakYears")}</label>
              <input type="number" min={0} className={getFieldInputClassName("warrantyLeakYears")} {...form.register("warrantyLeakYears", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={saveDraft} disabled={savingDraft}>{savingDraft ? "Đang lưu nháp..." : "Lưu nháp"}</Button>
        <Button type="submit" disabled={isSubmitDisabled} className="bg-orange-500 hover:bg-orange-600">
          {submitting ? (isCreate ? "Đang tạo dự án..." : "Đang cập nhật dự án...") : isCreate ? "Tạo dự án" : "Cập Nhật Dự Án"}
        </Button>
      </div>
    </form>
  );
}
