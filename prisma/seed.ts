import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, ProjectMemberRole, ProjectStatus, TaskStatus, UserRole } from "@prisma/client";
import { mapCsvRowToTemplateData, parseTaskTemplateCsv } from "../lib/task-template-csv";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

type SeedUserInput = {
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Thiếu DATABASE_URL trong .env");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = "ChangeMe@2026";

async function upsertUser(input: SeedUserInput, passwordHash: string) {
  return prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone ?? null,
      role: input.role,
      isActive: true,
      mustChangePassword: true,
    },
    update: {
      passwordHash,
      fullName: input.fullName,
      role: input.role,
      isActive: true,
      mustChangePassword: true,
      phone: input.phone ?? null,
    },
  });
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const users = await Promise.all([
    upsertUser(
      {
        email: "admin@congty.vn",
        fullName: "Quản trị hệ thống",
        role: UserRole.admin,
      },
      passwordHash,
    ),
    upsertUser(
      {
        email: "gdtc.test@congty.vn",
        fullName: "GĐ Thi Công Phạm D",
        role: UserRole.construction_manager,
      },
      passwordHash,
    ),
    upsertUser(
      {
        email: "ks.test@congty.vn",
        fullName: "KS Nguyễn Văn A",
        role: UserRole.engineer,
      },
      passwordHash,
    ),
    upsertUser(
      {
        email: "doitruong.test@congty.vn",
        fullName: "Đội trưởng Trần B",
        role: UserRole.foreman,
      },
      passwordHash,
    ),
    upsertUser(
      {
        email: "ketoan.test@congty.vn",
        fullName: "Kế toán Lê Thị C",
        role: UserRole.accountant,
      },
      passwordHash,
    ),
  ]);

  return {
    admin: users[0],
    constructionManager: users[1],
    engineer: users[2],
    foreman: users[3],
    accountant: users[4],
  };
}

async function seedTaskTemplates() {
  const csvPath = path.join(process.cwd(), "prisma", "seeds", "task_templates_seed.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Không tìm thấy file CSV: ${csvPath}`);
  }

  const csvRaw = fs.readFileSync(csvPath, "utf8");
  const rows = parseTaskTemplateCsv(csvRaw);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const data = mapCsvRowToTemplateData(row);

    const existing = await prisma.taskTemplate.findFirst({
      where: {
        code: data.code,
        templateCategory: data.templateCategory,
      },
      select: { id: true },
    });

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

function addDays(baseDate: Date, offsetDays: number) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

async function seedDemoProject(userIds: { adminId: string; engineerId: string; foremanId: string; accountantId: string }) {
  const areaM2 = 208;
  const unitPrice = 4_300_000;
  const contractValue = areaM2 * unitPrice;

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const expectedEndDate = addDays(startDate, 120);

  const project = await prisma.project.upsert({
    where: { code: "DA-2026-DEMO" },
    create: {
      code: "DA-2026-DEMO",
      name: "Dự án demo - Nhà anh Demo",
      customerName: "Anh Demo",
      customerPhone: "0909000999",
      address: "Đường demo, Quận 7, TP.HCM",
      areaM2,
      unitPrice,
      contractValue,
      startDate,
      expectedEndDate,
      actualEndDate: null,
      projectManagerId: userIds.adminId,
      mainEngineerId: userIds.engineerId,
      status: ProjectStatus.in_progress,
      notes: "Dự án mẫu để kiểm thử hệ thống nội bộ",
    },
    update: {
      name: "Dự án demo - Nhà anh Demo",
      customerName: "Anh Demo",
      customerPhone: "0909000999",
      address: "Đường demo, Quận 7, TP.HCM",
      areaM2,
      unitPrice,
      contractValue,
      startDate,
      expectedEndDate,
      projectManagerId: userIds.adminId,
      mainEngineerId: userIds.engineerId,
      status: ProjectStatus.in_progress,
      notes: "Dự án mẫu để kiểm thử hệ thống nội bộ",
    },
  });

  // Luôn reset membership/tasks/payments của project demo để seed idempotent không duplicate
  await prisma.projectMember.deleteMany({ where: { projectId: project.id } });
  await prisma.taskLog.deleteMany({ where: { task: { projectId: project.id } } });
  await prisma.taskPhoto.deleteMany({ where: { task: { projectId: project.id } } });
  await prisma.task.deleteMany({ where: { projectId: project.id } });
  await prisma.paymentSchedule.deleteMany({ where: { projectId: project.id } });

  await prisma.projectMember.createMany({
    data: [
      {
        projectId: project.id,
        userId: userIds.engineerId,
        roleInProject: ProjectMemberRole.engineer,
        addedBy: userIds.adminId,
      },
    ],
  });

  const templates = await prisma.taskTemplate.findMany({
    where: { templateCategory: "nha_pho_1t1l" },
    orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
  });

  for (const template of templates) {
    const plannedStartDate = addDays(startDate, template.defaultOffsetDays);
    const plannedEndDate = addDays(plannedStartDate, template.defaultDurationDays - 1);

    await prisma.task.create({
      data: {
        projectId: project.id,
        templateId: template.id,
        code: template.code,
        phase: template.phase,
        name: template.name,
        offsetDays: template.defaultOffsetDays,
        durationDays: template.defaultDurationDays,
        plannedStartDate,
        plannedEndDate,
        assignedEngineerId: userIds.engineerId,
        assignedForemanId: userIds.foremanId,
        team: template.defaultTeam,
        inspectorName: template.defaultInspector,
        materialsNeeded: template.materialsNeeded,
        proposerRole: template.proposerRole,
        ordererRole: template.ordererRole,
        receiverRole: template.receiverRole,
        qcChecklist: template.qcChecklist,
        isMilestone: template.isMilestone,
        status: TaskStatus.not_started,
        isActive: true,
        displayOrder: template.displayOrder,
        notes: null,
      },
    });
  }

  const paymentTemplate = [
    { phaseNumber: 1, milestoneDescription: "Ký HĐ, tạm ứng khởi công", percent: 0.15, dayOffset: -3 },
    { phaseNumber: 2, milestoneDescription: "Xong móng, nghiệm thu GĐ1", percent: 0.2, dayOffset: 21 },
    { phaseNumber: 3, milestoneDescription: "Xong sàn T1, nghiệm thu GĐ2", percent: 0.2, dayOffset: 42 },
    { phaseNumber: 4, milestoneDescription: "Xong sàn mái (cất nóc), nghiệm thu GĐ3", percent: 0.2, dayOffset: 63 },
    { phaseNumber: 5, milestoneDescription: "Xong tô trát + CT, nghiệm thu GĐ4", percent: 0.15, dayOffset: 87 },
    { phaseNumber: 6, milestoneDescription: "Bàn giao, nghiệm thu tổng thể", percent: 0.1, dayOffset: 120 },
  ];

  await prisma.paymentSchedule.createMany({
    data: paymentTemplate.map((item) => ({
      projectId: project.id,
      phaseNumber: item.phaseNumber,
      milestoneDescription: item.milestoneDescription,
      percent: item.percent,
      amount: Math.round(contractValue * item.percent),
      expectedDate: addDays(startDate, item.dayOffset),
      dayOffset: item.dayOffset,
      status: "not_collected",
      actualPaidDate: null,
      actualPaidAmount: null,
      notes: null,
    })),
  });

  return {
    project,
    taskCount: templates.length,
    paymentCount: paymentTemplate.length,
  };
}

async function seedSubcontractorMasterData() {
  const specialties = [
    { code: "masonry", name: "Nề (xây tô)", icon: "🧱", sortOrder: 1 },
    { code: "reinforcement", name: "Sắt thép", icon: "🔩", sortOrder: 2 },
    { code: "electrical", name: "Điện", icon: "⚡", sortOrder: 3 },
    { code: "plumbing", name: "Nước", icon: "🚰", sortOrder: 4 },
    { code: "painting", name: "Sơn", icon: "🎨", sortOrder: 5 },
    { code: "aluminum", name: "Nhôm kính", icon: "🪟", sortOrder: 6 },
    { code: "flooring", name: "Lát gạch", icon: "🟫", sortOrder: 7 },
    { code: "carpentry", name: "Mộc", icon: "🪵", sortOrder: 8 },
    { code: "roofing", name: "Mái", icon: "🏠", sortOrder: 9 },
    { code: "waterproofing", name: "Chống thấm", icon: "💧", sortOrder: 10 },
  ];

  const criteria = [
    { code: "quality", name: "Chất lượng", weight: 1.5, sortOrder: 1, isDefault: true },
    { code: "schedule", name: "Tiến độ", weight: 1.3, sortOrder: 2, isDefault: true },
    { code: "communication", name: "Giao tiếp", weight: 1.0, sortOrder: 3, isDefault: true },
    { code: "professionalism", name: "Chuyên nghiệp", weight: 1.0, sortOrder: 4, isDefault: true },
    { code: "enthusiasm", name: "Nhiệt tình", weight: 0.8, sortOrder: 5, isDefault: true },
  ];

  for (const item of specialties) {
    await prisma.subcontractorSpecialty.upsert({
      where: { code: item.code },
      create: {
        ...item,
        isActive: true,
      },
      update: {
        name: item.name,
        icon: item.icon,
        sortOrder: item.sortOrder,
      },
    });
  }

  for (const item of criteria) {
    await prisma.evaluationCriterion.upsert({
      where: { code: item.code },
      create: {
        ...item,
        isActive: true,
      },
      update: {
        name: item.name,
        weight: item.weight,
        sortOrder: item.sortOrder,
        isDefault: item.isDefault,
      },
    });
  }

  return {
    specialties: specialties.length,
    criteria: criteria.length,
  };
}

async function main() {
  const startedAt = Date.now();

  const users = await seedUsers();
  const templateResult = await seedTaskTemplates();
  const subcontractorResult = await seedSubcontractorMasterData();
  const demoResult = await seedDemoProject({
    adminId: users.admin.id,
    engineerId: users.engineer.id,
    foremanId: users.foreman.id,
    accountantId: users.accountant.id,
  });

  const elapsedMs = Date.now() - startedAt;

  console.log("[SEED] Hoàn tất seed dữ liệu");
  console.log(
    `[SEED] User upsert: admin=${users.admin.email}, construction_manager=${users.constructionManager.email}, engineer=${users.engineer.email}, foreman=${users.foreman.email}, accountant=${users.accountant.email}`,
  );
  console.log(`[SEED] Password mặc định cho user test: ${DEFAULT_PASSWORD}`);
  console.log(`[SEED] Task templates tổng CSV: ${templateResult.totalRows}`);
  console.log(`[SEED] Task templates tạo mới: ${templateResult.created}`);
  console.log(`[SEED] Task templates cập nhật: ${templateResult.updated}`);
  console.log(`[SEED] Demo project: ${demoResult.project.code}`);
  console.log(`[SEED] Demo project tasks: ${demoResult.taskCount}`);
  console.log(`[SEED] Demo project payment schedules: ${demoResult.paymentCount}`);
  console.log(`[SEED] Subcontractor specialties seed: ${subcontractorResult.specialties}`);
  console.log(`[SEED] Evaluation criteria seed: ${subcontractorResult.criteria}`);
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
