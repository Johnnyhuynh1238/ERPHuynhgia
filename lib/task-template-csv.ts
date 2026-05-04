import { TaskCategory, TaskPhase } from "@prisma/client";
import { parse } from "csv-parse/sync";

export type CsvTaskTemplateRow = {
  code: string;
  phase: string;
  name: string;
  default_offset_days: string;
  default_duration_days: string;
  default_team: string;
  default_inspector: string;
  materials_needed: string;
  proposer_role: string;
  orderer_role: string;
  receiver_role: string;
  qc_checklist: string;
  is_milestone: string;
  display_order: string;
  template_category: string;
  category?: string;
  duration?: string;
};

const PHASE_META: Record<TaskPhase, { code: string; name: string; order: number }> = {
  P1_CHUAN_BI: { code: "P1", name: "Chuẩn bị", order: 1 },
  P2_MONG: { code: "P2", name: "Móng", order: 2 },
  P3_KHUNG_TRET: { code: "P3", name: "Khung trệt", order: 3 },
  P4_KHUNG_LAU: { code: "P4", name: "Khung lầu", order: 4 },
  P5_ME_XAY_TO: { code: "P5", name: "M&E + xây tô", order: 5 },
  P6_OP_LAT: { code: "P6", name: "Ốp lát", order: 6 },
  P7_SON_BA: { code: "P7", name: "Sơn bả", order: 7 },
  P8_LAP_TB: { code: "P8", name: "Lắp thiết bị", order: 8 },
  P9_BAN_GIAO: { code: "P9", name: "Bàn giao", order: 9 },
};

const allowedPhases = new Set<string>(Object.keys(PHASE_META));

const allowedCategories = new Set<string>(Object.values(TaskCategory));

export function parsePhase(value: string): TaskPhase {
  const normalized = value.trim() as TaskPhase;
  if (!allowedPhases.has(normalized)) {
    throw new Error(`Phase không hợp lệ trong CSV: ${value}`);
  }
  return normalized;
}

export function getPhaseMeta(phase: TaskPhase) {
  return PHASE_META[phase];
}

export function parseTaskTemplateCsv(csvText: string) {
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvTaskTemplateRow[];
}

function parseCategory(value?: string) {
  const normalized = (value || "").trim();
  if (!normalized) return TaskCategory.normal;
  if (!allowedCategories.has(normalized)) {
    throw new Error(`Category không hợp lệ trong CSV: ${value}`);
  }
  return normalized as TaskCategory;
}

function parseDuration(durationValue: string | undefined, fallback: number) {
  const parsed = Number(durationValue);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function mapCsvRowToTemplateData(row: CsvTaskTemplateRow) {
  const phase = parsePhase(row.phase);
  const phaseMeta = getPhaseMeta(phase);
  const defaultDurationDays = Number(row.default_duration_days);
  const duration = parseDuration(row.duration, defaultDurationDays);

  return {
    code: row.code.trim(),
    phase,
    phaseCode: phaseMeta.code,
    phaseName: phaseMeta.name,
    phaseOrder: phaseMeta.order,
    phaseDuration: defaultDurationDays,
    name: row.name,
    defaultOffsetDays: Number(row.default_offset_days),
    defaultDurationDays,
    duration,
    defaultTeam: row.default_team,
    defaultInspector: row.default_inspector,
    materialsNeeded: row.materials_needed,
    proposerRole: row.proposer_role,
    ordererRole: row.orderer_role,
    receiverRole: row.receiver_role,
    qcChecklist: row.qc_checklist,
    isMilestone: row.is_milestone.trim().toLowerCase() === "true",
    displayOrder: Number(row.display_order),
    templateCategory: row.template_category.trim() || "nha_pho_1t1l",
    category: parseCategory(row.category),
    isActive: true,
  };
}
