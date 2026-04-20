import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { parse } from "csv-parse/sync";
import { PrismaClient, TaskPhase, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

type CsvTaskTemplateRow = {
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

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Thiếu DATABASE_URL trong .env");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function parsePhase(value: string): TaskPhase {
  const normalized = value.trim() as TaskPhase;
  const allowed = new Set<string>([
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

  if (!allowed.has(normalized)) {
    throw new Error(`Phase không hợp lệ trong CSV: ${value}`);
  }

  return normalized;
}

async function seedAdmin() {
  const passwordHash = await bcrypt.hash("ChangeMe@2026", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@congty.vn" },
    create: {
      email: "admin@congty.vn",
      passwordHash,
      fullName: "Quản trị hệ thống",
      phone: null,
      role: UserRole.admin,
      isActive: true,
    },
    update: {
      fullName: "Quản trị hệ thống",
      role: UserRole.admin,
      isActive: true,
    },
  });

  return admin;
}

async function seedTaskTemplates() {
  const csvPath = path.join(process.cwd(), "prisma", "seeds", "task_templates_seed.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Không tìm thấy file CSV: ${csvPath}`);
  }

  const csvRaw = fs.readFileSync(csvPath, "utf8");
  const rows = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvTaskTemplateRow[];

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const code = row.code.trim();
    const templateCategory = row.template_category.trim();

    const existing = await prisma.taskTemplate.findFirst({
      where: {
        code,
        templateCategory,
      },
      select: { id: true },
    });

    const data = {
      code,
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
      templateCategory,
    };

    if (existing) {
      await prisma.taskTemplate.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    } else {
      await prisma.taskTemplate.create({ data });
      created += 1;
    }
  }

  return {
    totalRows: rows.length,
    created,
    updated,
  };
}

async function main() {
  const startedAt = Date.now();

  const admin = await seedAdmin();
  const templateResult = await seedTaskTemplates();

  const elapsedMs = Date.now() - startedAt;

  console.log("[SEED] Hoàn tất seed dữ liệu");
  console.log(`[SEED] Admin upsert: ${admin.email}`);
  console.log(`[SEED] Task templates tổng CSV: ${templateResult.totalRows}`);
  console.log(`[SEED] Task templates tạo mới: ${templateResult.created}`);
  console.log(`[SEED] Task templates cập nhật: ${templateResult.updated}`);
  console.log(`[SEED] Thời gian chạy: ${elapsedMs} ms`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error) => {
    console.error("[SEED] Lỗi:", error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
