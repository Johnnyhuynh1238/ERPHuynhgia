// Seed ngân sách hạng mục cho dự án Nhà Anh Ngân – Phú Mỹ (DA-2026-002).
// Chạy 1 lần SAU khi migration project_budget_plan đã apply:
//   docker cp scripts/seed-budget-ngan.mjs erp_app_prod:/tmp/seed.mjs
//   docker exec erp_app_prod node /tmp/seed.mjs
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PROJECT_ID = "3e7328ad-1d1c-45ae-a593-77eaeaf1d922";

// Bảng ngân sách đã chốt (đơn: VND).
const LINES = [
  ["Bê tông", "tho", 15374063],
  ["Cốt thép", "tho", 34580550],
  ["Xây tường", "tho", 54158180],
  ["Tô trát & cán nền", "tho", 10403120],
  ["Mái tôn & xà gồ", "tho", 47676380],
  ["Chống thấm", "tho", 8160000],
  ["ME thô (điện–nước)", "tho", 14443750],
  ["Trần thạch cao", "hoan_thien", 17340000],
  ["Sơn nước", "hoan_thien", 53122000],
  ["Ốp lát", "hoan_thien", 30400000],
  ["Cửa nhôm kính", "hoan_thien", 71484000],
  ["Thiết bị vệ sinh", "hoan_thien", 20000000],
  ["Thiết bị điện hoàn thiện", "hoan_thien", 11170000],
  ["Nhân công khoán", "nhan_cong", 260000000],
  ["Chi phí chung", "chung", 45550000],
];

// Ánh xạ tên vật tư → hạng mục (cùng rule đã duyệt).
function hangMuc(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("sơn") || n.includes("bột bả") || n.includes("matit")) return "Sơn nước";
  if (n.includes("chống thấm") || n.includes("sika") || n.includes("raintite") || n.includes("topseal")) return "Chống thấm";
  if (n.includes("tôn") || n.includes("xà gồ") || n.includes("vì kèo") || n.includes("ống thoát nước mái")) return "Mái tôn & xà gồ";
  if (n.includes("trần thạch cao")) return "Trần thạch cao";
  if (n.includes("cửa") || n.includes("vách kính")) return "Cửa nhôm kính";
  if (n.includes("thiết bị vệ sinh")) return "Thiết bị vệ sinh";
  if (n.includes("đèn") || n.includes("ổ cắm") || n.includes("công tắc") || n.includes("aptomat") || n.includes("tủ điện") || n.includes("cb "))
    return "Thiết bị điện hoàn thiện";
  if (n.includes("dây điện") || n.includes("ống điện") || n.includes("ống cấp nước") || n.includes("ống thoát pvc") || n.includes("bịt ø") || n.includes("ppr"))
    return "ME thô (điện–nước)";
  if (n.includes("gạch lát") || n.includes("gạch ốp") || n.includes("len chân tường") || n.includes("granite")) return "Ốp lát";
  if (n.includes("thép") || n.includes("kẽm buộc")) return "Cốt thép";
  if (n.includes("gạch ống") || n.includes("gạch đinh") || n.includes("gạch đặc")) return "Xây tường";
  const btCtx = ["(bt", "đổ tay m250", "m250)", "cổ cột", "cột tầng", "giằng", "lanh tô", "đà kiềng", "móng đơn", "sàn mái", "đan nền", "vỉ móng", "bê tông", "đá 4x6", "đá 1x2"];
  const xayCtx = ["vữa xây", "bao móng"];
  const toCtx = ["vữa tô", "cán nền"];
  if (btCtx.some((k) => n.includes(k))) return "Bê tông";
  if (n.includes("xi măng") || n.includes("cát") || n.includes("đá") || n.includes("đinh")) {
    if (xayCtx.some((k) => n.includes(k))) return "Xây tường";
    if (toCtx.some((k) => n.includes(k))) return "Tô trát & cán nền";
    return "Bê tông";
  }
  return null; // không map được → để trống, soát tay
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!admin) throw new Error("Không tìm thấy user admin");

  // 1) Tạo/thay plan + lines.
  const existing = await prisma.projectBudgetPlan.findUnique({ where: { projectId: PROJECT_ID } });
  if (existing) {
    console.log("Plan đã tồn tại — bỏ qua tạo. Xoá thủ công nếu muốn seed lại.");
  }
  const total = LINES.reduce((s, l) => s + l[2], 0);
  const plan = await prisma.projectBudgetPlan.upsert({
    where: { projectId: PROJECT_ID },
    create: { projectId: PROJECT_ID, totalAmount: BigInt(total), createdById: admin.id },
    update: { totalAmount: BigInt(total) },
  });
  await prisma.projectBudgetPlanLine.deleteMany({ where: { planId: plan.id } });
  await prisma.projectBudgetPlanLine.createMany({
    data: LINES.map((l, i) => ({ planId: plan.id, name: l[0], groupKind: l[1], amount: BigInt(l[2]), sortRank: i })),
  });
  const lines = await prisma.projectBudgetPlanLine.findMany({ where: { planId: plan.id } });
  const byName = new Map(lines.map((l) => [l.name, l.id]));
  console.log(`Tạo ${lines.length} hạng mục, tổng ${total.toLocaleString("vi-VN")}đ`);

  // 2) Gắn hạng mục cho từng item đơn mua hàng.
  const orders = await prisma.mhOrder.findMany({ where: { projectId: PROJECT_ID }, select: { id: true, seq: true, items: true } });
  let mapped = 0, unmapped = 0;
  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    const next = items.map((it) => {
      const hmName = hangMuc(it.name);
      if (hmName && byName.has(hmName)) { mapped++; return { ...it, hm: byName.get(hmName) }; }
      unmapped++;
      return { ...it, hm: null };
    });
    await prisma.mhOrder.update({ where: { id: o.id }, data: { items: next } });
  }
  console.log(`Đơn mua hàng: gắn ${mapped} item, ${unmapped} item chưa map (soát tay)`);

  // 3) HĐ thầu phụ → Nhân công khoán.
  const ncId = byName.get("Nhân công khoán");
  const subUpd = await prisma.subContract.updateMany({
    where: { projectId: PROJECT_ID, budgetLineId: null },
    data: { budgetLineId: ncId },
  });
  console.log(`HĐ thầu phụ gắn Nhân công khoán: ${subUpd.count}`);

  console.log("Xong.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
