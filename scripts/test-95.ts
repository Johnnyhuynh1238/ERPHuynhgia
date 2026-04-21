import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { mapCsvRowToTemplateData, parseTaskTemplateCsv } from "../lib/task-template-csv";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Thiếu DATABASE_URL");
const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type T = { id: number; name: string; pass: boolean; detail?: string };

async function upsertFromCsvText(csv: string) {
  const rows = parseTaskTemplateCsv(csv).map((r) => mapCsvRowToTemplateData(r));
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.taskTemplate.findFirst({
      where: { code: row.code, templateCategory: row.templateCategory },
      select: { id: true },
    });

    if (existing) {
      await prisma.taskTemplate.update({ where: { id: existing.id }, data: row });
      updated += 1;
    } else {
      await prisma.taskTemplate.create({ data: row });
      created += 1;
    }
  }

  return { created, updated };
}

async function main() {
  const out: T[] = [];

  // 1) Non-admin blocked (code-level check)
  const adminPage = fs.readFileSync(path.join(process.cwd(), "app/admin/templates/page.tsx"), "utf8");
  out.push({
    id: 1,
    name: "Non-admin vào /admin/templates -> bị chặn",
    pass: adminPage.includes('user.role !== "admin"') && adminPage.includes('redirect("/?denied=1")'),
  });

  // 2) 69 templates sorted by displayOrder (count active)
  const activeTemplates = await prisma.taskTemplate.findMany({
    where: { templateCategory: "nha_pho_1t1l", isActive: true },
    orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
  });
  const sorted = activeTemplates.every((t, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1];
    return prev.displayOrder <= t.displayOrder;
  });
  out.push({
    id: 2,
    name: "Admin thấy 69 template sort theo displayOrder",
    pass: activeTemplates.length === 69 && sorted,
    detail: `count=${activeTemplates.length}`,
  });

  // 3) edit 1.01 duration 1->2
  const t101 = await prisma.taskTemplate.findFirst({
    where: { code: "1.01", templateCategory: "nha_pho_1t1l", isActive: true },
  });
  let pass3 = false;
  if (t101) {
    await prisma.taskTemplate.update({ where: { id: t101.id }, data: { defaultDurationDays: 2 } });
    const after = await prisma.taskTemplate.findUnique({ where: { id: t101.id } });
    pass3 = after?.defaultDurationDays === 2;
  }
  out.push({ id: 3, name: "Sửa template 1.01 duration 1->2 lưu thành công", pass: pass3 });

  // 4) snapshot tasks project demo unaffected
  const demoTask101 = await prisma.task.findFirst({
    where: {
      code: "1.01",
      project: { code: "DA-2026-DEMO" },
    },
    select: { durationDays: true },
  });
  out.push({
    id: 4,
    name: "Task 1.01 dự án demo vẫn duration=1 cũ",
    pass: demoTask101?.durationDays === 1,
    detail: `duration=${demoTask101?.durationDays}`,
  });

  // 5-8 create/delete/restore 99.99
  await prisma.taskTemplate.deleteMany({ where: { code: "99.99", templateCategory: "nha_pho_1t1l" } });

  const created9999 = await prisma.taskTemplate.create({
    data: {
      code: "99.99",
      phase: "P9_BAN_GIAO",
      name: "Template test 99.99",
      defaultOffsetDays: 999,
      defaultDurationDays: 1,
      defaultTeam: "Đội test",
      defaultInspector: "KS test",
      materialsNeeded: "test",
      proposerRole: "KS",
      ordererRole: "Mua hàng",
      receiverRole: "Kho",
      qcChecklist: "• Test",
      isMilestone: false,
      displayOrder: 999,
      templateCategory: "nha_pho_1t1l",
      isActive: true,
    },
  });

  const inList = await prisma.taskTemplate.findFirst({ where: { id: created9999.id, isActive: true } });
  out.push({ id: 5, name: 'Tạo template mới code "99.99" -> xuất hiện list', pass: !!inList });

  await prisma.taskTemplate.update({ where: { id: created9999.id }, data: { isActive: false } });
  const inActiveList = await prisma.taskTemplate.findFirst({ where: { id: created9999.id, isActive: true } });
  out.push({ id: 6, name: 'Xóa template "99.99" (soft) -> biến mất list', pass: !inActiveList });

  const inAll = await prisma.taskTemplate.findFirst({ where: { id: created9999.id } });
  out.push({ id: 7, name: 'Toggle "Hiển thị đã xóa" -> thấy lại dòng disabled', pass: !!inAll && inAll.isActive === false });

  await prisma.taskTemplate.update({ where: { id: created9999.id }, data: { isActive: true } });
  const restored = await prisma.taskTemplate.findFirst({ where: { id: created9999.id, isActive: true } });
  out.push({ id: 8, name: "Khôi phục -> xuất hiện list bình thường", pass: !!restored });

  // 9-10 CSV import 3 lines
  const csvCodes = ["98.01", "98.02", "98.03"];
  await prisma.taskTemplate.deleteMany({ where: { code: { in: csvCodes }, templateCategory: "nha_pho_1t1l" } });

  const header =
    "code,phase,name,default_offset_days,default_duration_days,default_team,default_inspector,materials_needed,proposer_role,orderer_role,receiver_role,qc_checklist,is_milestone,display_order,template_category\n";
  const rows = [
    "98.01,P1_CHUAN_BI,Test 98.01,1,1,Đội A,KS A,Vật tư A,KS,Mua hàng,Kho,\"• Mục A\",false,9801,nha_pho_1t1l",
    "98.02,P2_MONG,Test 98.02,2,2,Đội B,KS B,Vật tư B,KS,Mua hàng,Kho,\"• Mục B\",false,9802,nha_pho_1t1l",
    "98.03,P3_KHUNG_TRET,Test 98.03,3,3,Đội C,KS C,Vật tư C,KS,Mua hàng,Kho,\"• Mục C\",false,9803,nha_pho_1t1l",
  ].join("\n");
  const csv = header + rows + "\n";

  const import1 = await upsertFromCsvText(csv);
  out.push({
    id: 9,
    name: 'Import CSV lần 1 -> "Tạo mới 3, cập nhật 0"',
    pass: import1.created === 3 && import1.updated === 0,
    detail: `created=${import1.created}, updated=${import1.updated}`,
  });

  const import2 = await upsertFromCsvText(csv);
  out.push({
    id: 10,
    name: 'Import CSV lần 2 -> "Tạo mới 0, cập nhật 3"',
    pass: import2.created === 0 && import2.updated === 3,
    detail: `created=${import2.created}, updated=${import2.updated}`,
  });

  const failed = out.filter((x) => !x.pass);
  for (const t of out) {
    console.log(`${t.pass ? "PASS" : "FAIL"} ${t.id}. ${t.name}${t.detail ? ` (${t.detail})` : ""}`);
  }

  if (failed.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
