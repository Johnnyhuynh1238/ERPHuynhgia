import OpenAI from "openai";
import { Prisma, ProjectAiAuditAction, ProjectAiConflictType, ProjectAiProposalAction, ProjectAiProposalSection, ProjectAiRunStatus, ProjectChangeDraftMode, ProjectDocumentCategory } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildFileContext, type AiFileInput } from "@/lib/project-ai-analyzer";
import { computeDocumentSignature } from "@/lib/project-document-permissions";

export const runtime = "nodejs";

const TOOL_NAME = "submit_project_intake_analysis";
const PROMPT_VERSION = "project-intake-v2";

const proposalSchema = z.object({
  section: z.nativeEnum(ProjectAiProposalSection),
  fieldPath: z.string().min(1),
  suggestedValue: z.unknown(),
  action: z.nativeEnum(ProjectAiProposalAction),
  confidence: z.number().min(0).max(1).optional().nullable(),
  reason: z.string().optional().nullable(),
});

const conflictSchema = z.object({
  fieldPath: z.string().min(1),
  currentValue: z.unknown().optional().nullable(),
  suggestedValue: z.unknown().optional().nullable(),
  conflictType: z.nativeEnum(ProjectAiConflictType),
  reason: z.string().optional().nullable(),
});

const analysisSchema = z.object({
  summary: z.record(z.string(), z.unknown()).optional().default({}),
  proposals: z.array(proposalSchema).optional().default([]),
  conflicts: z.array(conflictSchema).optional().default([]),
});

const toolInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "object", additionalProperties: true },
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section: { type: "string", enum: Object.values(ProjectAiProposalSection) },
          fieldPath: { type: "string" },
          suggestedValue: {},
          action: { type: "string", enum: Object.values(ProjectAiProposalAction) },
          confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
          reason: { type: ["string", "null"] },
        },
        required: ["section", "fieldPath", "suggestedValue", "action"],
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fieldPath: { type: "string" },
          currentValue: {},
          suggestedValue: {},
          conflictType: { type: "string", enum: Object.values(ProjectAiConflictType) },
          reason: { type: ["string", "null"] },
        },
        required: ["fieldPath", "conflictType"],
      },
    },
  },
  required: ["summary", "proposals", "conflicts"],
};

type Proposal = z.infer<typeof proposalSchema>;
type Conflict = z.infer<typeof conflictSchema>;

const VALID_PROPOSAL_ACTIONS = new Set<string>(Object.values(ProjectAiProposalAction));
const VALID_PROPOSAL_SECTIONS = new Set<string>(Object.values(ProjectAiProposalSection));
const VALID_CONFLICT_TYPES = new Set<string>(Object.values(ProjectAiConflictType));
const ARRAY_LIKE_FIELDS = new Set(["paymentSchedules", "drawings", "documents", "members"]);

function isArrayLikeFieldPath(rawPath: string) {
  const normalized = rawPath.replace(/^formData\./, "").replace(/^payload\./, "").split(/[.\[]/)[0];
  return ARRAY_LIKE_FIELDS.has(normalized);
}

function coerceAnalysisPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const root = raw as Record<string, unknown>;
  const proposals = Array.isArray(root.proposals) ? root.proposals : [];
  const conflicts = Array.isArray(root.conflicts) ? root.conflicts : [];
  const coerced: { actions: string[]; sections: string[]; conflicts: string[] } = { actions: [], sections: [], conflicts: [] };

  const fixedProposals = proposals.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const obj = { ...(entry as Record<string, unknown>) };
    const action = typeof obj.action === "string" ? obj.action : "";
    const fieldPathRaw = typeof obj.fieldPath === "string" ? obj.fieldPath : "";
    if (!VALID_PROPOSAL_ACTIONS.has(action)) {
      coerced.actions.push(action || "<rỗng>");
      obj.action = ProjectAiProposalAction.warning_only;
      const reason = typeof obj.reason === "string" && obj.reason.length > 0 ? obj.reason : "AI trả về action không hợp lệ, đã quy về cảnh báo.";
      obj.reason = `${reason} (action gốc: ${action || "<rỗng>"})`;
    } else if (action === ProjectAiProposalAction.supplement && fieldPathRaw && !isArrayLikeFieldPath(fieldPathRaw)) {
      coerced.actions.push(`supplement→fill_empty(${fieldPathRaw})`);
      obj.action = ProjectAiProposalAction.fill_empty;
      const reason = typeof obj.reason === "string" && obj.reason.length > 0 ? obj.reason : "Field này không phải mảng nên không thể supplement.";
      obj.reason = `${reason} (AI đặt supplement nhưng field không phải mảng → đã đổi sang fill_empty.)`;
    }
    const section = typeof obj.section === "string" ? obj.section : "";
    if (!VALID_PROPOSAL_SECTIONS.has(section)) {
      coerced.sections.push(section || "<rỗng>");
      obj.section = ProjectAiProposalSection.document;
    }
    return obj;
  });

  const fixedConflicts = conflicts.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const obj = { ...(entry as Record<string, unknown>) };
    const conflictType = typeof obj.conflictType === "string" ? obj.conflictType : "";
    if (!VALID_CONFLICT_TYPES.has(conflictType)) {
      coerced.conflicts.push(conflictType || "<rỗng>");
      obj.conflictType = ProjectAiConflictType.ambiguous;
    }
    return obj;
  });

  if (coerced.actions.length > 0 || coerced.sections.length > 0 || coerced.conflicts.length > 0) {
    console.warn("[project-ai] coerced AI payload enums", coerced);
  }

  return { ...root, proposals: fixedProposals, conflicts: fixedConflicts };
}

type DraftFormData = Record<string, unknown>;

type DraftProject = {
  customerName: string;
  customerPhone: string;
  customerIdNumber: string | null;
  address: string;
  name: string;
  contractValue: Prisma.Decimal | null;
  startDate: Date;
  expectedEndDate: Date;
  plannedDeadline: Date | null;
  actualEndDate: Date | null;
  status: string;
  notes: string | null;
  projectManagerId: string;
  mainEngineerId: string;
} | null;

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function normalizeProject(project: DraftProject): DraftFormData {
  if (!project) return {};
  return {
    customerName: project.customerName,
    customerPhone: project.customerPhone,
    customerIdNumber: project.customerIdNumber,
    address: project.address,
    name: project.name,
    contractValue: project.contractValue ? Number(project.contractValue) : null,
    startDate: formatDate(project.startDate),
    expectedEndDate: formatDate(project.expectedEndDate),
    plannedDeadline: formatDate(project.plannedDeadline),
    actualEndDate: formatDate(project.actualEndDate),
    status: project.status,
    notes: project.notes,
    projectManagerId: project.projectManagerId,
    mainEngineerId: project.mainEngineerId,
  };
}

function pathParts(path: string) {
  return path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

function pathValue(source: unknown, path: string) {
  if (!source || typeof source !== "object") return undefined;
  let cursor: unknown = source;
  for (const part of pathParts(path)) {
    if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function setPath(target: DraftFormData, path: string, value: unknown) {
  const parts = pathParts(path);
  let cursor: Record<string, unknown> = target;
  parts.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  });
  cursor[parts[parts.length - 1]] = value;
}

function appendPath(target: DraftFormData, path: string, value: unknown) {
  const current = pathValue(target, path);
  const currentArray = Array.isArray(current) ? current : [];
  const nextItems = Array.isArray(value) ? value : [value];
  setPath(target, path, [...currentArray, ...nextItems]);
}

function isMeaningful(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizePaymentSchedules(value: unknown) {
  if (!Array.isArray(value)) return null;

  const rows = value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const installmentNo = numberValue(row.installmentNo ?? row.stage ?? row.phaseNumber ?? row.no ?? row.dot) ?? index + 1;
      const description = stringValue(row.description, row.title, row.milestoneDescription, row.content, row.name);
      const rawPercent = numberValue(row.percent ?? row.percentage ?? row.rate);
      const percent = rawPercent === null ? undefined : rawPercent > 0 && rawPercent <= 1 ? Math.round(rawPercent * 10000) / 100 : rawPercent;
      const amount = numberValue(row.amount ?? row.money ?? row.value ?? row.soTien);
      const dueDate = stringValue(row.dueDate, row.expectedDate, row.date);
      const paymentNote = stringValue(row.paymentNote, row.note, row.ghiChu);

      if (!description || (!amount && percent === undefined)) return null;

      return {
        type: row.type === "addendum" ? "addendum" : "contract",
        installmentNo,
        description,
        ...(percent !== undefined ? { percent } : {}),
        ...(amount ? { amount } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(paymentNote ? { paymentNote } : {}),
      };
    })
    .filter((row): row is { type: "contract" | "addendum"; installmentNo: number; description: string; percent?: number; amount?: number; dueDate?: string; paymentNote?: string } => row !== null);

  return rows.length > 0 ? rows : null;
}

function normalizeProposal(proposal: Proposal, mode: ProjectChangeDraftMode, formData: DraftFormData): Proposal {
  const fieldPath = proposal.fieldPath.replace(/^formData\./, "").replace(/^payload\./, "");
  if (fieldPath !== "paymentSchedules") return { ...proposal, fieldPath };

  const paymentSchedules = normalizePaymentSchedules(proposal.suggestedValue);
  if (!paymentSchedules) return { ...proposal, fieldPath };

  const currentPayments = pathValue(formData, "paymentSchedules");
  const shouldFillEmpty = mode === ProjectChangeDraftMode.create_project && !isMeaningful(currentPayments);

  return {
    ...proposal,
    section: ProjectAiProposalSection.payment,
    fieldPath,
    suggestedValue: paymentSchedules,
    action: shouldFillEmpty ? ProjectAiProposalAction.fill_empty : proposal.action,
  };
}

function normalizeProposals(proposals: Proposal[], mode: ProjectChangeDraftMode, formData: DraftFormData) {
  return proposals.map((proposal) => normalizeProposal(proposal, mode, formData));
}

function fieldValue(formData: DraftFormData, projectData: DraftFormData, fieldPath: string) {
  const formValue = pathValue(formData, fieldPath);
  if (isMeaningful(formValue)) return formValue;
  return pathValue(projectData, fieldPath);
}

function autoApplyProposals(formData: DraftFormData, proposals: Proposal[]) {
  const nextFormData = JSON.parse(JSON.stringify(formData)) as DraftFormData;
  const appliedFields: Array<{ fieldPath: string; action: ProjectAiProposalAction }> = [];
  const skippedFields: Array<{ fieldPath: string; action: ProjectAiProposalAction; reason: string }> = [];

  for (const proposal of proposals) {
    if (proposal.action === ProjectAiProposalAction.warning_only) {
      skippedFields.push({ fieldPath: proposal.fieldPath, action: proposal.action, reason: "warning_only" });
      continue;
    }

    if (proposal.action === ProjectAiProposalAction.supplement) {
      appendPath(nextFormData, proposal.fieldPath, proposal.suggestedValue);
      appliedFields.push({ fieldPath: proposal.fieldPath, action: proposal.action });
      continue;
    }

    if (isMeaningful(pathValue(nextFormData, proposal.fieldPath))) {
      skippedFields.push({ fieldPath: proposal.fieldPath, action: proposal.action, reason: "existing_value" });
      continue;
    }

    setPath(nextFormData, proposal.fieldPath, proposal.suggestedValue);
    appliedFields.push({ fieldPath: proposal.fieldPath, action: proposal.action });
  }

  return { formData: nextFormData, appliedFields, skippedFields };
}

function enforceNoOverwrite({
  mode,
  formData,
  projectData,
  proposals,
  conflicts,
}: {
  mode: ProjectChangeDraftMode;
  formData: DraftFormData;
  projectData: DraftFormData;
  proposals: Proposal[];
  conflicts: Conflict[];
}) {
  const safeProposals: Proposal[] = [];
  const nextConflicts: Conflict[] = [...conflicts];

  for (const proposal of proposals) {
    const currentValue = fieldValue(formData, projectData, proposal.fieldPath);
    const hasCurrentValue = isMeaningful(currentValue);
    const isSupplement = proposal.action === ProjectAiProposalAction.supplement;
    const isWarning = proposal.action === ProjectAiProposalAction.warning_only;
    const blocked = hasCurrentValue && !isSupplement && (mode === ProjectChangeDraftMode.update_project || proposal.action === ProjectAiProposalAction.fill_empty);

    if (blocked) {
      nextConflicts.push({
        fieldPath: proposal.fieldPath,
        currentValue,
        suggestedValue: proposal.suggestedValue,
        conflictType: ProjectAiConflictType.existing_value,
        reason: proposal.reason || "AI không được ghi đè field đã có dữ liệu.",
      });
      continue;
    }

    safeProposals.push(isWarning ? { ...proposal, action: ProjectAiProposalAction.warning_only } : proposal);
  }

  return { proposals: safeProposals, conflicts: nextConflicts };
}

function analysisPrompt({ mode, formData, projectData }: { mode: ProjectChangeDraftMode; formData: DraftFormData; projectData: DraftFormData }) {
  return `Bạn là trợ lý nhập liệu dự án ERP thi công Huỳnh Gia. Phân tích hồ sơ HĐ/dự toán/bản vẽ/phụ lục được đính kèm và trả kết quả bằng tool ${TOOL_NAME}.

Luật bắt buộc:
- Không ghi trực tiếp DB chính, chỉ tạo đề xuất/cảnh báo.
- Field path phải dùng tên form: customerName, customerPhone, customerIdNumber, address, name, contractValue, startDate, expectedEndDate, plannedDeadline, paymentSchedules, drawings, documents.
- contractValue là TỔNG giá trị hợp đồng (VND, number). Đọc trực tiếp từ con số ghi trong hợp đồng (vd "1.500.000.000 đồng"). KHÔNG nhân diện tích × đơn giá.
- Date trả về dạng yyyy-mm-dd. Tiền trả number, không kèm ký tự đ.
- Nếu hợp đồng có bảng thanh toán dạng "ĐỢT / NỘI DUNG CÔNG VIỆC / % / SỐ TIỀN / GHI CHÚ", hãy tạo 1 proposal fieldPath=paymentSchedules, action=fill_empty cho create_project khi form chưa có đợt thanh toán. suggestedValue phải là mảng object: { type: "contract", installmentNo: number, description: string, percent: number, amount: number, dueDate?: "yyyy-mm-dd", paymentNote?: string }. Nếu bảng không có ngày hạn, bỏ dueDate để ERP tự phân bổ theo ngày khởi công - bàn giao dự kiến. Ví dụ hợp đồng mẫu có 8 đợt: tạm ứng khởi công, hoàn thành móng, hoàn thành sàn tầng 2, hoàn thành xây tô, hoàn thành lợp mái, hoàn thiện cơ bản, bàn giao tạm thời, bàn giao chính thức.
- Với hợp đồng xây dựng Việt Nam: Bên A/chủ đầu tư thường map vào customerName/customerPhone/customerIdNumber/address; tên công trình/gói thầu map vào name; địa điểm công trình map vào address nếu chưa có địa chỉ chủ nhà rõ hơn.
- Nếu có block "Nội dung OCR fallback" thì dùng nó như nguồn text chính khi document PDF có vẻ không đọc được.
- create_project: form thường đang trống, nếu đọc được field nào đủ tin cậy thì phải tạo proposal fill_empty cho field đó; không chỉ tạo conflict documents ambiguous chung chung.
- Trường action CHỈ ĐƯỢC dùng ĐÚNG 1 trong 3 chuỗi sau (lowercase, có dấu gạch dưới): "fill_empty", "supplement", "warning_only". KHÔNG được dùng bất kỳ giá trị khác như "update", "overwrite", "replace", "fill", "warn"... Nếu sai schema, tool sẽ reject.
- action=fill_empty chỉ dùng khi field đang trống.
- action=supplement dùng cho dòng bổ sung như lịch thanh toán phụ lục, bản vẽ mới, tài liệu mới.
- action=warning_only dùng khi chỉ cảnh báo, không được apply.
- Với update_project: nếu ERP/form đã có dữ liệu meaningful nhưng hồ sơ chứa thông tin KHÁC, hãy tạo proposal action=warning_only (kèm suggestedValue và reason). KHÔNG dùng "update"/"overwrite". User sẽ bấm nút "Áp dụng AI" để ghi đè thủ công.
- Nếu hồ sơ trùng khớp với dữ liệu hiện tại thì KHÔNG đề xuất gì, hoặc tạo conflict existing_value/mismatch.
- Không đoán UUID user. Nếu thấy tên GĐ/KS trong hồ sơ nhưng không có ID, chỉ cảnh báo hoặc ghi reason.
- Chỉ đưa proposal có confidence >= 0.55. Nếu thật sự không đọc được dữ liệu từ file thì tạo conflict ambiguous với reason nói rõ là OCR/PDF không trích xuất được hay nội dung thiếu field nào.

Mode: ${mode}
FormData hiện tại:
${JSON.stringify(formData, null, 2)}

Dữ liệu ERP hiện tại nếu update:
${JSON.stringify(projectData, null, 2)}
`;
}

async function markRunFailed(runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await prisma.projectAiRun.update({
    where: { id: runId },
    data: { status: ProjectAiRunStatus.failed, error: message.slice(0, 4000), finishedAt: new Date() },
  });
  return message;
}

export async function POST(request: Request, { params }: { params: { draftId: string } }) {
  let current;
  try {
    current = await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    return authError(error);
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("force") === "1";

  const draft = await prisma.projectChangeDraft.findUnique({
    where: { id: params.draftId },
    include: {
      project: {
        select: {
          customerName: true,
          customerPhone: true,
          customerIdNumber: true,
          address: true,
          name: true,
          contractValue: true,
          startDate: true,
          expectedEndDate: true,
          plannedDeadline: true,
          actualEndDate: true,
          status: true,
          notes: true,
          projectManagerId: true,
          mainEngineerId: true,
        },
      },
      files: { orderBy: { uploadedAt: "asc" } },
    },
  });

  if (!draft) return NextResponse.json({ message: "Không tìm thấy bản nháp" }, { status: 404 });

  const useProjectDocuments = draft.mode === ProjectChangeDraftMode.update_project && !!draft.projectId;

  const projectDocuments = useProjectDocuments
    ? await prisma.projectDocument.findMany({
        where: {
          projectId: draft.projectId!,
          category: { in: [ProjectDocumentCategory.contract, ProjectDocumentCategory.estimate] },
        },
        select: { id: true, fileName: true, fileUrl: true, mimeType: true, category: true, contentHash: true },
        orderBy: { uploadedAt: "asc" },
      })
    : [];

  const totalFiles = useProjectDocuments ? projectDocuments.length : draft.files.length;
  if (totalFiles === 0) {
    return NextResponse.json({ message: "Cần upload ít nhất 1 hồ sơ trước khi chạy AI" }, { status: 400 });
  }

  const aiFiles: AiFileInput[] = useProjectDocuments
    ? projectDocuments.map((doc) => ({
        fileName: doc.fileName,
        fileKind: doc.category,
        fileUrl: doc.fileUrl,
        mimeType: doc.mimeType,
      }))
    : draft.files.map((file) => ({
        fileName: file.fileName,
        fileKind: file.fileKind,
        fileUrl: file.fileUrl,
        mimeType: file.mimeType,
      }));

  const documentSignature = useProjectDocuments
    ? computeDocumentSignature(projectDocuments.map((d) => ({ id: d.id, contentHash: d.contentHash })))
    : null;

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const baseURL = process.env.OPENAI_BASE_URL;

  const cachedAnalysis = useProjectDocuments && documentSignature && !forceRefresh
    ? await prisma.projectAiAnalysisCache.findUnique({
        where: { projectId_documentSignature: { projectId: draft.projectId!, documentSignature } },
      })
    : null;

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.projectAiRun.create({
      data: {
        draftId: draft.id,
        status: ProjectAiRunStatus.running,
        model,
        promptVersion: PROMPT_VERSION,
        startedAt: new Date(),
      },
    });
    await tx.projectAiAudit.create({
      data: {
        draftId: draft.id,
        actorId: current.id,
        action: ProjectAiAuditAction.run_ai,
        payload: {
          runId: created.id,
          model,
          promptVersion: PROMPT_VERSION,
          fileCount: totalFiles,
          source: useProjectDocuments ? "project_documents" : "draft_files",
          cacheHit: !!cachedAnalysis,
          forceRefresh,
        },
      },
    });
    return created;
  });

  if (!apiKey && !cachedAnalysis) {
    await markRunFailed(run.id, "OPENAI_API_KEY missing");
    return NextResponse.json({ message: "Chưa cấu hình OPENAI_API_KEY" }, { status: 500 });
  }

  try {
    const formData = (draft.formData && typeof draft.formData === "object" && !Array.isArray(draft.formData) ? draft.formData : {}) as DraftFormData;
    const projectData = normalizeProject(draft.project);

    let parsed: z.infer<typeof analysisSchema>;
    let cacheUsed = false;

    if (cachedAnalysis) {
      const cachedRaw = (cachedAnalysis.rawResult ?? {}) as { summary?: Record<string, unknown> };
      parsed = analysisSchema.parse({
        summary: cachedRaw.summary ?? {},
        proposals: Array.isArray(cachedAnalysis.proposals) ? cachedAnalysis.proposals : [],
        conflicts: Array.isArray(cachedAnalysis.conflicts) ? cachedAnalysis.conflicts : [],
      });
      cacheUsed = true;
      console.info("[project-ai] cache hit", {
        draftId: draft.id,
        projectId: draft.projectId,
        documentSignature,
        proposalCount: parsed.proposals.length,
        conflictCount: parsed.conflicts.length,
      });
    } else {
      const fileContext = await buildFileContext(aiFiles);
      console.info("[project-ai] run request", {
        draftId: draft.id,
        mode: draft.mode,
        model,
        hasBaseURL: Boolean(baseURL),
        fileCount: aiFiles.length,
        fileKinds: aiFiles.map((file) => file.fileKind),
        mimeTypes: aiFiles.map((file) => file.mimeType),
        fileContextChars: fileContext.length,
        source: useProjectDocuments ? "project_documents" : "draft_files",
        documentSignature,
      });
      const client = new OpenAI({ apiKey: apiKey!, ...(baseURL ? { baseURL } : {}) });

      const userContent = `${analysisPrompt({ mode: draft.mode, formData, projectData })}

Hồ sơ đính kèm:
${fileContext || "(không có nội dung trích xuất được)"}`;

      const completion = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: "Bạn trích xuất dữ liệu hồ sơ xây dựng Việt Nam. Luôn trả lời bằng tool được yêu cầu, không viết prose ngoài tool." },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: TOOL_NAME,
              description: "Structured project intake proposals and conflicts for ERP draft review.",
              parameters: toolInputSchema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: TOOL_NAME } },
      });

      const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== TOOL_NAME) {
        throw new Error("OpenAI không trả về tool output hợp lệ");
      }

      const toolArgs = JSON.parse(toolCall.function.arguments);
      const coercedArgs = coerceAnalysisPayload(toolArgs);
      parsed = analysisSchema.parse(coercedArgs);

      if (useProjectDocuments && documentSignature) {
        await prisma.projectAiAnalysisCache.upsert({
          where: { projectId_documentSignature: { projectId: draft.projectId!, documentSignature } },
          create: {
            projectId: draft.projectId!,
            documentSignature,
            rawResult: toJson(parsed),
            proposals: toJson(parsed.proposals),
            conflicts: toJson(parsed.conflicts),
            model,
            promptVersion: PROMPT_VERSION,
          },
          update: {
            rawResult: toJson(parsed),
            proposals: toJson(parsed.proposals),
            conflicts: toJson(parsed.conflicts),
            model,
            promptVersion: PROMPT_VERSION,
          },
        });
      }
    }
    const normalizedProposals = normalizeProposals(parsed.proposals, draft.mode, formData);
    const enforced = enforceNoOverwrite({ mode: draft.mode, formData, projectData, proposals: normalizedProposals, conflicts: parsed.conflicts });
    const autoApplied = autoApplyProposals(formData, enforced.proposals);
    console.info("[project-ai] run result", {
      draftId: draft.id,
      runId: run.id,
      parsedProposalCount: parsed.proposals.length,
      parsedConflictCount: parsed.conflicts.length,
      enforcedProposalCount: enforced.proposals.length,
      enforcedConflictCount: enforced.conflicts.length,
      autoAppliedCount: autoApplied.appliedFields.length,
      autoSkippedCount: autoApplied.skippedFields.length,
      autoAppliedFields: autoApplied.appliedFields,
      autoSkippedFields: autoApplied.skippedFields,
      summaryKeys: Object.keys(parsed.summary),
      proposals: enforced.proposals.map((proposal) => ({
        fieldPath: proposal.fieldPath,
        action: proposal.action,
        confidence: proposal.confidence ?? null,
        reason: proposal.reason || null,
      })),
      conflicts: enforced.conflicts.map((conflict) => ({
        fieldPath: conflict.fieldPath,
        conflictType: conflict.conflictType,
        reason: conflict.reason || null,
      })),
    });

    await prisma.$transaction(async (tx) => {
      await tx.projectAiProposal.deleteMany({ where: { runId: run.id } });
      await tx.projectAiConflict.deleteMany({ where: { runId: run.id } });

      if (enforced.proposals.length > 0) {
        await tx.projectAiProposal.createMany({
          data: enforced.proposals.map((proposal) => ({
            runId: run.id,
            section: proposal.section,
            fieldPath: proposal.fieldPath,
            suggestedValue: toJson(proposal.suggestedValue),
            action: proposal.action,
            confidence: proposal.confidence ?? null,
            reason: proposal.reason || null,
          })),
        });
      }

      if (enforced.conflicts.length > 0) {
        await tx.projectAiConflict.createMany({
          data: enforced.conflicts.map((conflict) => ({
            runId: run.id,
            fieldPath: conflict.fieldPath,
            currentValue: conflict.currentValue === undefined ? Prisma.JsonNull : toJson(conflict.currentValue),
            suggestedValue: conflict.suggestedValue === undefined ? Prisma.JsonNull : toJson(conflict.suggestedValue),
            conflictType: conflict.conflictType,
          })),
        });
      }

      await tx.projectAiRun.update({
        where: { id: run.id },
        data: {
          status: ProjectAiRunStatus.done,
          rawResult: toJson({ ...parsed, enforced, autoApplied }),
          finishedAt: new Date(),
        },
      });

      await tx.projectChangeDraft.update({
        where: { id: draft.id },
        data: { formData: toJson(autoApplied.formData), aiSummary: toJson(parsed.summary), updatedBy: current.id },
      });

      if (autoApplied.appliedFields.length > 0 || autoApplied.skippedFields.length > 0) {
        await tx.projectAiAudit.create({
          data: {
            draftId: draft.id,
            actorId: current.id,
            action: ProjectAiAuditAction.apply_proposal,
            payload: toJson(autoApplied),
          },
        });
      }
    });

    const latestRun = await prisma.projectAiRun.findUnique({
      where: { id: run.id },
      include: {
        proposals: { orderBy: { createdAt: "asc" } },
        conflicts: { orderBy: { createdAt: "asc" } },
      },
    });
    const runWithConflictReasons = latestRun
      ? {
          ...latestRun,
          conflicts: latestRun.conflicts.map((conflict, index) => ({
            ...conflict,
            reason: enforced.conflicts[index]?.reason || null,
          })),
        }
      : latestRun;

    return NextResponse.json({
      run: runWithConflictReasons,
      draft: { id: draft.id, formData: autoApplied.formData },
      autoApplied,
      cacheUsed,
      message: cacheUsed
        ? "AI dùng lại kết quả phân tích đã lưu trước đó (không gọi LLM)"
        : autoApplied.appliedFields.length > 0
          ? "AI đã phân tích và điền form"
          : "AI đã phân tích hồ sơ",
    });
  } catch (error) {
    const message = await markRunFailed(run.id, error);
    console.error("[project-ai] run failed", { draftId: draft.id, runId: run.id, message });
    return NextResponse.json({ message: "AI phân tích thất bại", error: message }, { status: 500 });
  }
}
