import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, ProjectMemberRole, ProjectStatus, TaskCategory, TaskStatus, UserRole } from "@prisma/client";
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

type QcSeedPreset = {
  code: string;
  category: TaskCategory;
  preparationSteps: string;
  executionSteps: string;
  commonMistakes: string;
  beforeQcSteps: string;
  items: Array<{
    displayOrder: number;
    title: string;
    description?: string | null;
    requirePhoto: boolean;
  }>;
};

const ADMIN_QC_TEMPLATE_SEEDS: QcSeedPreset[] = [
  {
    code: "T2.04",
    category: TaskCategory.internal_milestone,
    preparationSteps: "- Mặt bằng móng sạch và đúng cao độ.\n- Đủ thép, kẽm buộc, con kê bê tông.\n- Có bản vẽ kết cấu mới nhất tại công trường.",
    executionSteps: "- Gia công thép đúng chủng loại theo bản vẽ.\n- Buộc giao điểm chắc, không thiếu mối nối.\n- Đảm bảo lớp bảo vệ và chiều dài neo theo yêu cầu.",
    commonMistakes: "- Sai đường kính thép chủ hoặc thép đai.\n- Thiếu lớp bảo vệ đáy, kê thép không đủ.\n- Mối nối chồng không đạt chiều dài.",
    beforeQcSteps: "- Kiểm tra lại toàn bộ tim trục và cao độ.\n- Chụp ảnh các vị trí góc, mối nối, lớp bảo vệ.\n- Dọn sạch đáy móng trước khi mời QC.",
    items: [
      { displayOrder: 1, title: "Đường kính thép đúng bản vẽ", requirePhoto: true },
      { displayOrder: 2, title: "Khoảng cách thép đai đúng thiết kế", requirePhoto: true },
      { displayOrder: 3, title: "Lớp bảo vệ thép đạt yêu cầu", requirePhoto: true },
      { displayOrder: 4, title: "Chiều dài neo và nối chồng đạt chuẩn", requirePhoto: true },
      { displayOrder: 5, title: "Vệ sinh đáy móng trước nghiệm thu", requirePhoto: false },
    ],
  },
  {
    code: "T2.05",
    category: TaskCategory.major_milestone,
    preparationSteps: "- Kiểm tra cốp pha, cốt thép đã nghiệm thu.\n- Chuẩn bị đầy đủ nhân lực đổ và đầm.\n- Xác nhận nguồn bê tông và thời gian cấp phối.",
    executionSteps: "- Đổ bê tông liên tục theo lớp phù hợp.\n- Đầm đúng kỹ thuật, không bỏ sót chân cột/góc khuất.\n- Kiểm soát cao độ mặt hoàn thiện theo mốc chuẩn.",
    commonMistakes: "- Đổ gián đoạn gây mạch ngừng không kiểm soát.\n- Đầm thiếu dẫn tới rỗ tổ ong.\n- Sai cao độ, khó xử lý ở bước sau.",
    beforeQcSteps: "- Hoàn thiện bề mặt, vệ sinh khu vực đổ.\n- Chụp ảnh tổng thể và các vị trí trọng yếu.\n- Ghi nhận thời gian bắt đầu/kết thúc đổ.",
    items: [
      { displayOrder: 1, title: "Bê tông đúng mác theo chỉ định", requirePhoto: true },
      { displayOrder: 2, title: "Đầm bê tông đầy đủ, không rỗ tổ ong", requirePhoto: true },
      { displayOrder: 3, title: "Cao độ mặt bê tông đạt yêu cầu", requirePhoto: true },
      { displayOrder: 4, title: "Không phát sinh mạch ngừng ngoài kế hoạch", requirePhoto: true },
      { displayOrder: 5, title: "Có biên nhận/thông tin xe bê tông", requirePhoto: true },
    ],
  },
  {
    code: "T3.05",
    category: TaskCategory.internal_milestone,
    preparationSteps: "- Đầy đủ bản vẽ cột và chi tiết nối thép.\n- Chuẩn bị thép đúng quy cách, con kê và đai định vị.\n- Kiểm tra vị trí chờ thép từ đợt trước.",
    executionSteps: "- Lắp dựng lồng thép đúng tim trục.\n- Siết buộc đầy đủ đai tại các vùng gia cường.\n- Căn chỉnh thẳng đứng trước khi nghiệm thu.",
    commonMistakes: "- Lắp sai chiều dài nối thép cột.\n- Thiếu đai ở vị trí liên kết dầm cột.\n- Lồng thép lệch tim, khó chỉnh về sau.",
    beforeQcSteps: "- Soát tim trục từng cột với mốc chuẩn.\n- Chụp ảnh các mối nối và vùng gia cường.\n- Khóa cố định lồng thép tránh xô lệch.",
    items: [
      { displayOrder: 1, title: "Lồng thép cột đúng chủng loại", requirePhoto: true },
      { displayOrder: 2, title: "Mối nối cột đạt chiều dài theo thiết kế", requirePhoto: true },
      { displayOrder: 3, title: "Đai cột bố trí đúng bước", requirePhoto: true },
      { displayOrder: 4, title: "Tim cột đúng trục định vị", requirePhoto: true },
    ],
  },
  {
    code: "T3.07",
    category: TaskCategory.major_milestone,
    preparationSteps: "- Đà kiềng đã lắp cốt thép và cốp pha hoàn chỉnh.\n- Kiểm tra liên kết với cột/chân tường.\n- Chuẩn bị phương án đổ liên tục.",
    executionSteps: "- Đổ bê tông theo phân đoạn hợp lý.\n- Đầm kỹ tại góc giao và đầu dầm.\n- Cân chỉnh cao độ mặt đà kiềng.",
    commonMistakes: "- Đầm không đều tại vị trí giao cắt.\n- Sai cao độ cục bộ gây khó xây tường.\n- Cốp pha hở gây mất vữa.",
    beforeQcSteps: "- Kiểm tra bề mặt bê tông sau đổ.\n- Chụp ảnh toàn tuyến đà kiềng và điểm nối.\n- Ghi nhận vị trí cần bảo dưỡng đặc biệt.",
    items: [
      { displayOrder: 1, title: "Cốp pha kín, không mất nước xi", requirePhoto: true },
      { displayOrder: 2, title: "Đầm bê tông đạt, không rỗ", requirePhoto: true },
      { displayOrder: 3, title: "Cao độ đà kiềng đúng thiết kế", requirePhoto: true },
      { displayOrder: 4, title: "Liên kết với cột đạt yêu cầu", requirePhoto: true },
    ],
  },
  {
    code: "T4.01",
    category: TaskCategory.internal_milestone,
    preparationSteps: "- Vật tư gạch, cát, xi đảm bảo chất lượng.\n- Mốc xây và cao độ đã được định vị.\n- Khu vực xây sạch, đủ nước trộn.",
    executionSteps: "- Xây theo dây chuẩn, mạch đều và no vữa.\n- Bố trí thép râu và giằng tường đúng vị trí.\n- Kiểm soát độ thẳng đứng và phẳng bề mặt.",
    commonMistakes: "- Mạch đứng trùng gây yếu tường.\n- Thiếu no vữa hoặc gạch không ngâm đủ.\n- Tường nghiêng, lệch tim với trục.",
    beforeQcSteps: "- Soát độ thẳng đứng theo từng đoạn.\n- Chụp ảnh các vị trí giao tường/cột.\n- Dọn sạch vữa thừa, bảo dưỡng ban đầu.",
    items: [
      { displayOrder: 1, title: "Gạch đúng chủng loại và quy cách", requirePhoto: true },
      { displayOrder: 2, title: "Mạch vữa đầy, đều, không rỗng", requirePhoto: true },
      { displayOrder: 3, title: "Tường thẳng đứng và đúng trục", requirePhoto: true },
      { displayOrder: 4, title: "Liên kết tường với cột chắc chắn", requirePhoto: true },
    ],
  },
];

async function seedAdminTemplateQcLibrary(adminUserId: string) {
  let templatesFound = 0;
  let categoriesUpdated = 0;
  let qcCreated = 0;
  let qcSkipped = 0;

  for (const preset of ADMIN_QC_TEMPLATE_SEEDS) {
    const template = await prisma.taskTemplate.findFirst({
      where: {
        code: preset.code,
        templateCategory: "nha_pho_1t1l",
      },
      select: {
        id: true,
        category: true,
      },
    });

    if (!template) {
      continue;
    }

    templatesFound += 1;

    if (template.category === TaskCategory.normal && preset.category !== TaskCategory.normal) {
      await prisma.taskTemplate.update({
        where: { id: template.id },
        data: { category: preset.category },
      });
      categoriesUpdated += 1;
    }

    const existingQc = await prisma.qcChecklistTemplate.findUnique({
      where: { taskTemplateId: template.id },
      select: { id: true },
    });

    if (existingQc) {
      qcSkipped += 1;
      continue;
    }

    await prisma.qcChecklistTemplate.create({
      data: {
        taskTemplateId: template.id,
        preparationSteps: preset.preparationSteps,
        executionSteps: preset.executionSteps,
        commonMistakes: preset.commonMistakes,
        beforeQcSteps: preset.beforeQcSteps,
        createdBy: adminUserId,
        qcItems: {
          create: preset.items.map((item) => ({
            displayOrder: item.displayOrder,
            title: item.title,
            description: item.description ?? null,
            requirePhoto: item.requirePhoto,
          })),
        },
      },
    });

    qcCreated += 1;
  }

  return {
    targetTemplates: ADMIN_QC_TEMPLATE_SEEDS.length,
    templatesFound,
    categoriesUpdated,
    qcCreated,
    qcSkipped,
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
  const qcTemplateResult = await seedAdminTemplateQcLibrary(users.admin.id);
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
  console.log(`[SEED] QC template targets: ${qcTemplateResult.targetTemplates}`);
  console.log(`[SEED] QC template matched: ${qcTemplateResult.templatesFound}`);
  console.log(`[SEED] QC template categories updated: ${qcTemplateResult.categoriesUpdated}`);
  console.log(`[SEED] QC template created: ${qcTemplateResult.qcCreated}`);
  console.log(`[SEED] QC template skipped(existing): ${qcTemplateResult.qcSkipped}`);
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
