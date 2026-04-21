import { parse } from "csv-parse/sync";
import { TaskPhase } from "@prisma/client";

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
};

const allowedPhases = new Set<string>([
  "P1_CHUAN_BI",
  "P2_MONG",
  "P3_KHUNG_TRET",
  "P4_KHUNG_LAU",
  "P5_ME_XAY_TO",
  "P6_OP_LAT",
  "P7_SON_BA",
  "P8_LAP_TB",
  "P9_BAN_GIAO",
]);

export function parsePhase(value: string): TaskPhase {
  const normalized = value.trim() as TaskPhase;
  if (!allowedPhases.has(normalized)) {
    throw new Error(`Phase không hợp lệ trong CSV: ${value}`);
  }
  return normalized;
}

export function parseTaskTemplateCsv(csvText: string) {
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvTaskTemplateRow[];
}

export function mapCsvRowToTemplateData(row: CsvTaskTemplateRow) {
  return {
    code: row.code.trim(),
    phase: parsePhase(row.phase),
    name: row.name,
    defaultOffsetDays: Number(row.default_offset_days),
    defaultDurationDays: Number(row.default_duration_days),
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
    isActive: true,
  };
}
