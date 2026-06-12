import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type LogAction =
  | "create"
  | "update"
  | "update_status"
  | "update_dates"
  | "update_assignment"
  | "update_customer_visibility"
  | "update_technical"
  | "update_progress"
  | "update_password"
  | "update_access"
  | "update_deadline"
  | "delete"
  | "cancel"
  | "request"
  | "note_updated"
  | "approve"
  | "reject"
  | "mark_paid"
  | "mark_done"
  | "internal_approve"
  | "qc_approve"
  | "qc_reject"
  | "qc_pass"
  | "qc_unpass"
  | "qc_submit"
  | "request_payment"
  | "activate"
  | "complete"
  | "upload"
  | "upsert"
  | "remove_file"
  | "reset"
  | "reset_token"
  | "restore"
  | "clone"
  | "clone_source"
  | "reorder"
  | "note"
  | "grant_access"
  | "revoke_access"
  | "lock"
  | "other";

export type LogEntity =
  | "project"
  | "payment_schedule"
  | "sub_contract"
  | "sub_contract_file"
  | "sub_contract_evaluation"
  | "sub_evaluation"
  | "sub_payment"
  | "project_member"
  | "project_drawing"
  | "project_document"
  | "project_phase"
  | "task"
  | "task_attachment"
  | "task_photo"
  | "task_material"
  | "task_qc_item"
  | "task_qc_photo"
  | "task_qc_log"
  | "task_qc_result"
  | "task_log"
  | "task_technical_report"
  | "task_material_report"
  | "task_labor_report"
  | "task_equipment_report"
  | "task_report_photo"
  | "customer_portal"
  | "design_photo_group"
  | "design_group"
  | "design_photo"
  | "site_rest_day"
  | "customer_comment"
  | "project_budget"
  | "project_budget_amendment"
  | "work_order"
  | "work_order_output"
  | "worker_timesheet"
  | "other";

type LogInput = {
  projectId: string;
  actorId: string | null;
  entity: LogEntity;
  entityId?: string | null;
  action: LogAction;
  summary: string;
  diff?: Record<string, { from: unknown; to: unknown }> | null;
  snapshot?: unknown;
  metadata?: Record<string, unknown> | null;
};

export async function logProjectActivity(db: DbClient, input: LogInput) {
  await db.projectActivityLog.create({
    data: {
      projectId: input.projectId,
      actorId: input.actorId,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      diff: input.diff == null ? Prisma.JsonNull : (input.diff as Prisma.InputJsonValue),
      snapshot: input.snapshot == null ? Prisma.JsonNull : (input.snapshot as Prisma.InputJsonValue),
      metadata: input.metadata == null ? Prisma.JsonNull : (input.metadata as Prisma.InputJsonValue),
    },
  });
}

const VND = new Intl.NumberFormat("vi-VN");
const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function fmtMoney(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : typeof v === "object" && v && "toString" in v ? Number(String(v)) : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${VND.format(n)}đ`;
}

export function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return DATE_FMT.format(d);
}

export function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === "boolean") return v ? "có" : "không";
  return String(v);
}

type FieldSpec<T> = {
  key: keyof T;
  label: string;
  format?: (v: unknown) => string;
};

type FieldSpecInput<T> = FieldSpec<T> | [keyof T, string] | [keyof T, string, (v: unknown) => string];

function normalizeFieldSpec<T>(spec: FieldSpecInput<T>): FieldSpec<T> {
  if (Array.isArray(spec)) {
    return { key: spec[0], label: spec[1], format: spec[2] };
  }
  return spec;
}

export function buildDiff<T extends Record<string, unknown>>(
  before: Partial<T> | null | undefined,
  after: Partial<T> | null | undefined,
  fields: FieldSpecInput<T>[]
) {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const lines: string[] = [];
  for (const raw of fields) {
    const f = normalizeFieldSpec(raw);
    const a = before?.[f.key];
    const b = after?.[f.key];
    if (normalize(a) === normalize(b)) continue;
    diff[String(f.key)] = { from: a ?? null, to: b ?? null };
    const fmt = f.format ?? fmtVal;
    lines.push(`${f.label}: ${fmt(a)} → ${fmt(b)}`);
  }
  return { diff, lines };
}

function normalize(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v && "toString" in v) return String(v);
  return String(v);
}

export function joinSummary(prefix: string, lines: string[], fallback: string): string {
  if (lines.length === 0) return fallback;
  return `${prefix}: ${lines.join("; ")}`;
}
