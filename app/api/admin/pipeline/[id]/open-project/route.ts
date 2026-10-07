import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { loadPipelineState, parseContractTerms } from "@/lib/pipeline-server";

// Chốt giai đoạn 3 · Hợp đồng: mở luôn giai đoạn 4 · Thiết kế + tạo dự án thật (status planning)
// gắn vào pipeline, kèm lịch thu khách theo các đợt trong HĐ → kế toán lập lệnh thu ở dự án như cũ.
// Giá trị + diện tích + đợt thu lấy từ contract_terms (AI ghi lúc nạp file HĐ), không nhập lại.
// Không chặn theo tiền cọc (anh nhận cọc trước khi bấm chốt, lệnh thu đợt 1 lập sau).
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const p = await prisma.projectPipeline.findUnique({
    where: { id: params.id },
    select: {
      name: true,
      customerName: true,
      customerPhone: true,
      address: true,
      stage: true,
      stageDates: true,
      projectId: true,
      contractVersionNo: true,
      contractTerms: true,
    },
  });
  if (!p)
    return NextResponse.json(
      { message: "Không tìm thấy dự án" },
      { status: 404 },
    );
  if (p.stage !== 3)
    return NextResponse.json(
      { message: "Dự án không ở giai đoạn Hợp đồng" },
      { status: 400 },
    );
  if (p.projectId)
    return NextResponse.json(
      { message: "Dự án đã được tạo rồi" },
      { status: 409 },
    );

  const d = parseContractTerms(p.contractTerms);
  if (!d)
    return NextResponse.json(
      {
        message:
          "Hợp đồng chưa có số liệu (giá trị + các đợt thu). Nhờ AI nạp lại file HĐ kèm số liệu.",
      },
      { status: 400 },
    );

  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const expectedEnd = new Date(start);
  expectedEnd.setUTCDate(expectedEnd.getUTCDate() + 120);
  const codePrefix = `DA-${start.getUTCFullYear()}-`;
  const area = d.areaM2 ?? 0;

  // Đợt cuối nhận phần dư làm tròn → tổng các đợt khớp đúng giá trị HĐ.
  let left = d.value;
  const amounts = d.installments.map((x, i) => {
    if (i === d.installments.length - 1) return left;
    const a = Math.round((d.value * x.percent) / 100);
    left -= a;
    return a;
  });

  await prisma.$transaction(async (tx) => {
    const codes = await tx.project.findMany({
      where: { code: { startsWith: codePrefix } },
      select: { code: true },
    });
    const maxNo = codes.reduce((m, c) => {
      const n = parseInt(c.code.slice(codePrefix.length), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const code = `${codePrefix}${String(maxNo + 1).padStart(3, "0")}`;

    const project = await tx.project.create({
      data: {
        code,
        name: p.name,
        customerName: p.customerName,
        customerPhone: p.customerPhone ?? "",
        customerPortalToken: randomUUID(),
        customerPortalEnabled: true,
        address: p.address ?? "",
        areaM2: new Prisma.Decimal(area),
        unitPrice: new Prisma.Decimal(
          area > 0 ? Math.round(d.value / area) : 0,
        ),
        contractValue: new Prisma.Decimal(d.value),
        startDate: start,
        expectedEndDate: expectedEnd,
        // Chưa có KS phụ trách lúc ký HĐ → tạm là admin, đổi trong dự án sau.
        projectManagerId: user!.id,
        mainEngineerId: user!.id,
        status: ProjectStatus.planning,
        notes: "Tạo khi chốt hợp đồng (Dự án theo tiến độ)",
        contractMeta: {
          fromPipelineId: params.id,
          contractVersionNo: p.contractVersionNo,
          contractSignDate: start.toISOString().slice(0, 10),
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await tx.paymentSchedule.createMany({
      data: d.installments.map((x, i) => ({
        projectId: project.id,
        phaseNumber: i + 1,
        milestoneDescription: x.label,
        percent: new Prisma.Decimal(x.percent),
        amount: new Prisma.Decimal(amounts[i]),
        type: "contract" as const,
        installmentNo: i + 1,
        description: x.label,
        createdBy: user!.id,
      })),
    });

    const old = (p.stageDates || {}) as Record<string, string>;
    const nowIso = now.toISOString();
    await tx.projectPipeline.update({
      where: { id: params.id },
      data: {
        projectId: project.id,
        stage: 4,
        stageDates: {
          "1": old["1"] || nowIso,
          "2": old["2"] || nowIso,
          "3": nowIso,
        },
      },
    });
  });

  return NextResponse.json(await loadPipelineState(params.id));
}
