import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { Prisma, ProjectAiAuditAction, ProjectAiConflictType, ProjectAiProposalAction, ProjectAiProposalSection, ProjectAiRunStatus, ProjectChangeDraftMode } from "@prisma/client";
import * as mammoth from "mammoth";
import readExcelFile from "read-excel-file/node";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const TOOL_NAME = "submit_project_intake_analysis";
const PROMPT_VERSION = "project-intake-v2";
const MAX_TEXT_CHARS_PER_FILE = 30_000;
const MAX_OCR_CHARS_PER_FILE = 20_000;
const MAX_PDF_TEXT_PAGES_PER_FILE = 8;
const MAX_OCR_PAGES_PER_FILE = 2;

const execFileAsync = promisify(execFile);

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

const toolInputSchema: Tool.InputSchema = {
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

type DraftFormData = Record<string, unknown>;

type DraftProject = {
  customerName: string;
  customerPhone: string;
  customerIdNumber: string | null;
  address: string;
  name: string;
  areaM2: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
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

function minioKey(url: string) {
  return url.startsWith("minio://") ? url.slice("minio://".length) : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function truncateText(text: string) {
  return text.length > MAX_TEXT_CHARS_PER_FILE ? `${text.slice(0, MAX_TEXT_CHARS_PER_FILE)}\n\n[Đã cắt bớt nội dung file do quá dài]` : text;
}

function truncateOcrText(text: string) {
  return text.length > MAX_OCR_CHARS_PER_FILE ? `${text.slice(0, MAX_OCR_CHARS_PER_FILE)}\n\n[Đã cắt bớt nội dung OCR do quá dài]` : text;
}

async function extractPdfPlainText(buffer: Buffer, fileName: string) {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "project-ai-pdf-text-"));
    const inputPath = join(dir, "input.pdf");
    await writeFile(inputPath, buffer);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", "-f", "1", "-l", String(MAX_PDF_TEXT_PAGES_PER_FILE), inputPath, "-"], {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const text = truncateText(String(stdout).trim());
    console.info("[project-ai] pdf text fallback", { fileName, extractedChars: text.length });
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[project-ai] pdf text fallback failed", { fileName, message });
    return "";
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function commandOutputText(error: unknown) {
  const output = error as { stdout?: unknown; stderr?: unknown; message?: string };
  return {
    stdout: output.stdout ? String(output.stdout) : "",
    stderr: output.stderr ? String(output.stderr) : output.message || String(error),
  };
}

async function extractPdfOcrText(buffer: Buffer, fileName: string) {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "project-ai-pdf-"));
    const inputPath = join(dir, "input.pdf");
    const outputPattern = join(dir, "page-%03d.png");
    await writeFile(inputPath, buffer);

    await execFileAsync(
      "gs",
      [
        "-q",
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=pnggray",
        "-r120",
        "-dFirstPage=1",
        `-dLastPage=${MAX_OCR_PAGES_PER_FILE}`,
        `-sOutputFile=${outputPattern}`,
        inputPath,
      ],
      { timeout: 90_000, maxBuffer: 1024 * 1024 },
    );

    const imageFiles = (await readdir(dir)).filter((entry) => entry.startsWith("page-") && entry.endsWith(".png")).sort();
    const chunks: string[] = [];
    for (const imageFile of imageFiles) {
      try {
        const { stdout } = await execFileAsync("tesseract", [join(dir, imageFile), "stdout", "-l", "vie+eng", "--psm", "11"], {
          timeout: 90_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        const text = String(stdout).trim();
        if (text) chunks.push(text);
      } catch (error) {
        const output = commandOutputText(error);
        if (output.stdout.trim()) chunks.push(output.stdout.trim());
        console.warn("[project-ai] pdf ocr page failed", { fileName, imageFile, message: output.stderr.slice(0, 500) });
      }
      if (chunks.join("\n\n").length >= MAX_OCR_CHARS_PER_FILE) break;
    }

    const text = truncateOcrText(chunks.join("\n\n"));
    console.info("[project-ai] pdf ocr fallback", { fileName, renderedPages: imageFiles.length, extractedChars: text.length });
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[project-ai] pdf ocr fallback failed", { fileName, message });
    return "";
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
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
    areaM2: Number(project.areaM2),
    unitPrice: Number(project.unitPrice),
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

async function extractSpreadsheetText(buffer: Buffer) {
  const sheets = (await readExcelFile(buffer)) as Array<{ sheet: string; data: unknown[][] }>;
  return sheets
    .map((sheet) => {
      const rows = sheet.data.slice(0, 120).map((row) => row.map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : cell ?? "")).join(" | "));
      return `# Sheet: ${sheet.sheet}\n${rows.join("\n")}`;
    })
    .join("\n\n");
}

async function buildFileBlocks(files: Array<{ fileName: string; fileKind: string; fileUrl: string; mimeType: string }>) {
  const blocks: ContentBlockParam[] = [];
  const unsupported: string[] = [];

  for (const file of files) {
    const key = minioKey(file.fileUrl);
    if (!key) {
      unsupported.push(`${file.fileName}: đường dẫn không phải MinIO`);
      continue;
    }

    const object = await getObjectFromMinio(key);
    const name = file.fileName.toLowerCase();
    const header = `Loại hồ sơ: ${file.fileKind}\nTên file: ${file.fileName}`;

    if (file.mimeType === "application/pdf" || name.endsWith(".pdf")) {
      blocks.push({
        type: "document",
        title: file.fileName,
        context: header,
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: object.buffer.toString("base64"),
        },
      });

      const plainText = await extractPdfPlainText(object.buffer, file.fileName);
      const ocrText = plainText.length >= 500 ? "" : await extractPdfOcrText(object.buffer, file.fileName);
      const extractedText = [plainText, ocrText].filter((text) => text.trim()).join("\n\n");
      if (extractedText.trim()) {
        blocks.push({
          type: "text",
          text: `${header}\nNội dung text fallback từ PDF, ưu tiên dùng để trích xuất field nếu document PDF không đọc được:\n${extractedText}`,
        });
      }
      continue;
    }

    if (name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: object.buffer });
      blocks.push({
        type: "document",
        title: file.fileName,
        context: header,
        source: {
          type: "text",
          media_type: "text/plain",
          data: truncateText(result.value || ""),
        },
      });
      continue;
    }

    if (name.endsWith(".xlsx")) {
      const text = await extractSpreadsheetText(object.buffer);
      blocks.push({
        type: "document",
        title: file.fileName,
        context: header,
        source: {
          type: "text",
          media_type: "text/plain",
          data: truncateText(text),
        },
      });
      continue;
    }

    unsupported.push(`${file.fileName}: định dạng legacy chưa parse tự động trong AI (.doc/.xls)`);
  }

  if (unsupported.length > 0) {
    blocks.push({
      type: "text",
      text: `Các file sau chưa đọc được nội dung tự động, hãy tạo warning nếu chúng quan trọng:\n${unsupported.join("\n")}`,
    });
  }

  return blocks;
}

function analysisPrompt({ mode, formData, projectData }: { mode: ProjectChangeDraftMode; formData: DraftFormData; projectData: DraftFormData }) {
  return `Bạn là trợ lý nhập liệu dự án ERP thi công Huỳnh Gia. Phân tích hồ sơ HĐ/dự toán/bản vẽ/phụ lục được đính kèm và trả kết quả bằng tool ${TOOL_NAME}.

Luật bắt buộc:
- Không ghi trực tiếp DB chính, chỉ tạo đề xuất/cảnh báo.
- Field path phải dùng tên form: customerName, customerPhone, customerIdNumber, address, name, areaM2, unitPrice, startDate, expectedEndDate, plannedDeadline, paymentSchedules, drawings, documents.
- Date trả về dạng yyyy-mm-dd. Tiền/diện tích trả number, không kèm ký tự đ.
- Nếu hợp đồng có bảng thanh toán dạng "ĐỢT / NỘI DUNG CÔNG VIỆC / % / SỐ TIỀN / GHI CHÚ", hãy tạo 1 proposal fieldPath=paymentSchedules, action=fill_empty cho create_project khi form chưa có đợt thanh toán. suggestedValue phải là mảng object: { type: "contract", installmentNo: number, description: string, percent: number, amount: number, dueDate?: "yyyy-mm-dd", paymentNote?: string }. Nếu bảng không có ngày hạn, bỏ dueDate để ERP tự phân bổ theo ngày khởi công - bàn giao dự kiến. Ví dụ hợp đồng mẫu có 8 đợt: tạm ứng khởi công, hoàn thành móng, hoàn thành sàn tầng 2, hoàn thành xây tô, hoàn thành lợp mái, hoàn thiện cơ bản, bàn giao tạm thời, bàn giao chính thức.
- Với hợp đồng xây dựng Việt Nam: Bên A/chủ đầu tư thường map vào customerName/customerPhone/customerIdNumber/address; tên công trình/gói thầu map vào name; địa điểm công trình map vào address nếu chưa có địa chỉ chủ nhà rõ hơn.
- Nếu có block "Nội dung OCR fallback" thì dùng nó như nguồn text chính khi document PDF có vẻ không đọc được.
- create_project: form thường đang trống, nếu đọc được field nào đủ tin cậy thì phải tạo proposal fill_empty cho field đó; không chỉ tạo conflict documents ambiguous chung chung.
- action=fill_empty chỉ dùng khi field đang trống.
- action=supplement dùng cho dòng bổ sung như lịch thanh toán phụ lục, bản vẽ mới, tài liệu mới.
- action=warning_only dùng khi chỉ cảnh báo, không được apply.
- Với update_project: nếu ERP/form đã có dữ liệu meaningful thì KHÔNG đề xuất ghi đè; nếu hồ sơ khác dữ liệu hiện tại thì tạo conflict existing_value hoặc mismatch.
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

export async function POST(_request: Request, { params }: { params: { draftId: string } }) {
  let current;
  try {
    current = await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    return authError(error);
  }

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
          areaM2: true,
          unitPrice: true,
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
  if (draft.files.length === 0) return NextResponse.json({ message: "Cần upload ít nhất 1 hồ sơ trước khi chạy AI" }, { status: 400 });

  const oauthToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const credential = oauthToken || apiKey;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const baseURL = process.env.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_API_BASE_URL;
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
        payload: { runId: created.id, model, promptVersion: PROMPT_VERSION, fileCount: draft.files.length },
      },
    });
    return created;
  });

  if (!credential) {
    await markRunFailed(run.id, "ANTHROPIC credential missing");
    return NextResponse.json({ message: "Chưa cấu hình ANTHROPIC_AUTH_TOKEN hoặc ANTHROPIC_API_KEY" }, { status: 500 });
  }

  try {
    const formData = (draft.formData && typeof draft.formData === "object" && !Array.isArray(draft.formData) ? draft.formData : {}) as DraftFormData;
    const projectData = normalizeProject(draft.project);
    const fileBlocks = await buildFileBlocks(draft.files);
    console.info("[project-ai] run request", {
      draftId: draft.id,
      mode: draft.mode,
      model,
      hasBaseURL: Boolean(baseURL),
      fileCount: draft.files.length,
      fileKinds: draft.files.map((file) => file.fileKind),
      mimeTypes: draft.files.map((file) => file.mimeType),
      fileBlockCount: fileBlocks.length,
    });
    const client = oauthToken
      ? new Anthropic({
          authToken: oauthToken,
          defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
          ...(baseURL ? { baseURL } : {}),
        })
      : new Anthropic({ apiKey: apiKey!, ...(baseURL ? { baseURL } : {}) });

    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: "Bạn trích xuất dữ liệu hồ sơ xây dựng Việt Nam. Luôn trả lời bằng tool được yêu cầu, không viết prose ngoài tool.",
      tools: [
        {
          name: TOOL_NAME,
          description: "Structured project intake proposals and conflicts for ERP draft review.",
          input_schema: toolInputSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: analysisPrompt({ mode: draft.mode, formData, projectData }) }, ...fileBlocks],
        },
      ],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === TOOL_NAME);
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude không trả về tool output hợp lệ");

    const parsed = analysisSchema.parse(toolUse.input);
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
      message: autoApplied.appliedFields.length > 0 ? "AI đã phân tích và điền form" : "AI đã phân tích hồ sơ",
    });
  } catch (error) {
    const message = await markRunFailed(run.id, error);
    console.error("[project-ai] run failed", { draftId: draft.id, runId: run.id, message });
    return NextResponse.json({ message: "AI phân tích thất bại", error: message }, { status: 500 });
  }
}
