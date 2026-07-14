import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Tổng quan 1 dự án (admin) — nguồn cho màn /projects/[id]/overview.
// Tài chính tính LẠI (không theo finance cũ):
//   CHI = CHỈ sổ quỹ out (mọi khoản NCC/lương/VT đều đi qua sổ quỹ → khỏi đếm 2 lần).
//   Giá vốn dự toán = Σ khoán + Σ VT dự toán.
//   Biên LN dự kiến = HĐ − giá vốn.  Dòng tiền = đã thu − đã chi.
//   Thặng dư (earned value) = CHỜ dữ liệu tiến độ theo công tác → trả null.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, address: true, contractValue: true, startDate: true, expectedEndDate: true, status: true },
  });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const contract = Number(project.contractValue ?? 0);

  const [schedules, cashOut, categories] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: { projectId: id },
      orderBy: [{ phaseNumber: "asc" }, { installmentNo: "asc" }],
      select: {
        phaseNumber: true,
        milestoneDescription: true,
        amount: true,
        status: true,
        actualPaidAmount: true,
        paidAmount: true,
        actualPaidDate: true,
        paidAt: true,
        expectedDate: true,
        dueDate: true,
      },
    }),
    prisma.cashTransaction.findMany({
      where: { projectId: id, direction: "out" },
      select: { amount: true, categoryId: true },
    }),
    prisma.expenseCategory.findMany({ select: { id: true, name: true } }),
  ]);

  // Thu
  let collected = 0;
  let doneInstallments = 0;
  for (const s of schedules) {
    const done = s.status === "collected" || s.status === "paid";
    if (done) {
      collected += Number(s.actualPaidAmount ?? s.paidAmount ?? s.amount);
      doneInstallments += 1;
    }
  }
  const remaining = contract - collected;
  const lastPaid = [...schedules]
    .filter((s) => s.status === "collected" || s.status === "paid")
    .sort((a, b) => (b.phaseNumber ?? 0) - (a.phaseNumber ?? 0))[0];
  const nextUnpaid = schedules
    .filter((s) => !(s.status === "collected" || s.status === "paid") && (s.expectedDate || s.dueDate))
    .sort((a, b) => new Date(a.expectedDate ?? a.dueDate!).getTime() - new Date(b.expectedDate ?? b.dueDate!).getTime())[0];

  // Chi = CHỈ sổ quỹ out
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  let spent = 0;
  const byCat = new Map<string, number>();
  for (const t of cashOut) {
    const v = Number(t.amount);
    spent += v;
    const key = t.categoryId ? (catName.get(t.categoryId) ?? "Khác") : "Khác";
    byCat.set(key, (byCat.get(key) ?? 0) + v);
  }
  const costBreakdown = Array.from(byCat.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Giá vốn dự toán = Σ khoán + Σ VT dự toán
  const gvRows = await prisma.$queryRaw<{ gia_von: number }[]>`
    SELECT
      coalesce((SELECT sum(value) FROM estimate_db_khoan WHERE project_id = ${id}::uuid), 0)::float8
    + coalesce((SELECT sum(quantity * unit_price) FROM estimate_db_materials WHERE project_id = ${id}::uuid), 0)::float8
      AS gia_von`;
  const budgetCost = Number(gvRows[0]?.gia_von ?? 0);

  const grossMargin = contract - budgetCost; // biên LN dự kiến
  const remainingSpend = Math.max(0, budgetCost - spent); // còn phải chi theo dự toán
  const cashFlow = collected - spent; // dòng tiền

  // Nợ NCC (view cộng dồn)
  const nccRows = await prisma.$queryRaw<{ total: number; n: number }[]>`
    SELECT coalesce(sum(con_lai), 0)::float8 AS total, count(*)::int AS n
    FROM ncc_cong_no_du_an WHERE project_id = ${id}::uuid AND con_lai > 0`;
  const supplierDebt = Number(nccRows[0]?.total ?? 0);
  const supplierCount = Number(nccRows[0]?.n ?? 0);

  // Tiles
  const mhRows = await prisma.$queryRaw<{ n: number; total: number; received: number }[]>`
    SELECT count(*)::int AS n, coalesce(sum(total), 0)::float8 AS total,
           count(*) FILTER (WHERE status = 'received')::int AS received
    FROM mh_orders WHERE project_id = ${id}::uuid`;
  const msRows = await prisma.$queryRaw<{ total: number; signed: number }[]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'signed')::int AS signed
    FROM acceptance_milestones WHERE project_id = ${id}::uuid`;

  // Nhật ký
  const diaryRows = await prisma.$queryRaw<
    { entry_date: Date; worker_count: number | null; tasks_done: string | null; issues: string | null }[]
  >`SELECT entry_date, worker_count, tasks_done, issues
    FROM construction_diaries WHERE project_id = ${id}::uuid ORDER BY entry_date DESC LIMIT 6`;
  const diaryCntRows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM construction_diaries WHERE project_id = ${id}::uuid`;
  const diaryCount = Number(diaryCntRows[0]?.n ?? 0);

  // Tiến độ — TẠM proxy theo mốc thanh toán (chờ chốt nguồn % theo công tác)
  const progressPct = contract > 0 ? Math.round((collected / contract) * 100) : 0;
  const daysLeft = project.expectedEndDate
    ? Math.max(0, Math.ceil((new Date(project.expectedEndDate).getTime() - Date.now()) / 86400000))
    : null;

  return NextResponse.json({
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      address: project.address,
      status: project.status,
      startDate: project.startDate,
      endDate: project.expectedEndDate,
      daysLeft,
    },
    finance: {
      contract,
      collected,
      remaining,
      budgetCost,
      grossMargin,
      spent,
      remainingSpend,
      surplus: null as number | null, // thặng dư: chờ dữ liệu tiến độ công tác
      cashFlow,
      supplierDebt,
      supplierCount,
      costBreakdown,
    },
    payments: {
      doneInstallments,
      totalInstallments: schedules.length,
      lastMilestone: lastPaid?.milestoneDescription ?? null,
      next: nextUnpaid
        ? {
            label: nextUnpaid.milestoneDescription,
            amount: Number(nextUnpaid.amount),
            date: nextUnpaid.expectedDate ?? nextUnpaid.dueDate,
          }
        : null,
    },
    progress: {
      pct: progressPct,
      source: "payment", // tạm theo mốc thanh toán
    },
    tiles: {
      muaHang: { count: Number(mhRows[0]?.n ?? 0), total: Number(mhRows[0]?.total ?? 0), received: Number(mhRows[0]?.received ?? 0) },
      acceptance: { total: Number(msRows[0]?.total ?? 0), signed: Number(msRows[0]?.signed ?? 0) },
      diary: { count: diaryCount },
    },
    diary: diaryRows.map((d) => ({
      date: d.entry_date,
      workers: d.worker_count,
      tasks: d.tasks_done,
      issues: d.issues,
    })),
  });
}
