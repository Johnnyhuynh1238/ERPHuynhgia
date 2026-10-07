import { NextResponse } from "next/server";
import { z } from "zod";
import { SubContractStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { buildBudgetPlan } from "@/lib/budget-plan";
import { PREP_STEPS } from "@/lib/prep-steps";

// Màn GĐ 5 Chuẩn bị: tóm tắt từng mục checklist + ngày chốt (project_pipelines.prep_done).
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      projectManager: { select: { fullName: true, role: true } },
      mainEngineer: { select: { fullName: true, role: true } },
    },
  });
  if (!project)
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const [pipe, gvRows, plan, subs, adjusts] = await Promise.all([
    prisma.projectPipeline.findUnique({
      where: { projectId: params.id },
      select: { prepDone: true },
    }),
    // Giá vốn dự toán = Σ khoán + Σ VT dự toán (giống Tổng quan dự án).
    prisma.$queryRaw<{ gia_von: number; dong: number }[]>`
      SELECT
        coalesce((SELECT sum(value) FROM estimate_db_khoan WHERE project_id = ${params.id}::uuid), 0)::float8
      + coalesce((SELECT sum(quantity * unit_price) FROM estimate_db_materials WHERE project_id = ${params.id}::uuid), 0)::float8
        AS gia_von,
        ((SELECT count(*) FROM estimate_db_khoan WHERE project_id = ${params.id}::uuid)
       + (SELECT count(*) FROM estimate_db_materials WHERE project_id = ${params.id}::uuid))::int AS dong`,
    buildBudgetPlan(params.id),
    prisma.subContract.findMany({
      where: { projectId: params.id, status: { not: SubContractStatus.cancelled } },
      select: { contractValue: true },
    }),
    prisma.purchaseGuideAdjust.count({ where: { projectId: params.id } }),
  ]);

  const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;
  const gv = gvRows[0];
  const pm = project.projectManager;
  const ks = project.mainEngineer;
  const staffTemp = pm.role === "admin" || ks.role === "admin";

  const info: Record<string, { text: string; warn?: boolean }> = {
    du_toan: gv?.dong
      ? { text: `${gv.dong} dòng · giá vốn ${money(gv.gia_von)}` }
      : { text: "Chưa có dự toán", warn: true },
    ngan_sach: plan.exists
      ? {
          text: `${plan.lines.length} hạng mục · ${money(plan.totals.budget)}${plan.status === "locked" ? " · đã khoá" : ""}`,
        }
      : { text: "Chưa lập ngân sách", warn: true },
    hd_mua_hang: {
      text: adjusts ? `Theo HĐ · ${adjusts} điều chỉnh` : "Theo hợp đồng (chưa điều chỉnh)",
    },
    hd_giam_sat: { text: "Vật tư · tiêu chí nghiệm thu · bản in" },
    thau_phu: subs.length
      ? {
          text: `${subs.length} hợp đồng · ${money(subs.reduce((s, x) => s + Number(x.contractValue), 0))}`,
        }
      : { text: "Chưa có hợp đồng thầu phụ", warn: true },
    nhan_su: {
      text: `QL: ${pm.fullName} · KS: ${ks.fullName}${staffTemp ? " (đang tạm để admin)" : ""}`,
      warn: staffTemp,
    },
  };

  return NextResponse.json({
    done: (pipe?.prepDone || {}) as Record<string, string>,
    info,
  });
}

const DoneSchema = z.object({
  step: z.enum(PREP_STEPS.map((s) => s.key) as [string, ...string[]]),
  done: z.boolean(),
});

// Chốt / mở lại 1 mục chuẩn bị.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const parsed = DoneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const pipe = await prisma.projectPipeline.findUnique({
    where: { projectId: params.id },
    select: { id: true, prepDone: true },
  });
  if (!pipe)
    return NextResponse.json({ message: "Dự án chưa gắn tiến độ" }, { status: 404 });

  const next = { ...((pipe.prepDone || {}) as Record<string, string>) };
  if (parsed.data.done) next[parsed.data.step] = new Date().toISOString();
  else delete next[parsed.data.step];

  await prisma.projectPipeline.update({
    where: { id: pipe.id },
    data: { prepDone: next },
  });
  return NextResponse.json({ done: next });
}
