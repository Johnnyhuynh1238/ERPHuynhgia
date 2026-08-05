import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma, ProjectStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { quoteSummary } from "@/lib/quote-compute";

// Chuyển HĐ thiết kế → HĐ thi công (Project).
// Điều kiện: bước "du_toan_bao_gia" đã approved + chưa từng chuyển.
// Đem theo: thông tin khách + quoteData (báo giá/dự toán). Field Project thiếu → placeholder, sửa trong dự án sau.

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const contract = await prisma.designContract.findUnique({
    where: { id: params.id },
    include: { steps: true },
  });
  if (!contract) return NextResponse.json({ message: "Không tìm thấy HĐ" }, { status: 404 });
  if (contract.projectId) {
    return NextResponse.json({ message: "HĐ đã chuyển thi công rồi" }, { status: 409 });
  }
  const quoteStep = contract.steps.find((s) => s.kind === "du_toan_bao_gia");
  if (!quoteStep || quoteStep.status !== "approved") {
    return NextResponse.json({ message: "Chưa duyệt bước Dự toán & Báo giá" }, { status: 400 });
  }
  if (contract.quoteData == null) {
    return NextResponse.json({ message: "HĐ chưa có báo giá" }, { status: 400 });
  }

  const sum = quoteSummary(contract.quoteData);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expectedEnd = new Date(start);
  expectedEnd.setDate(expectedEnd.getDate() + 90);
  const year = start.getFullYear();
  const codePrefix = `DA-${year}-`;

  const result = await prisma.$transaction(async (tx) => {
    const countThisYear = await tx.project.count({
      where: { code: { startsWith: codePrefix } },
    });
    const nextCode = `${codePrefix}${String(countThisYear + 1).padStart(3, "0")}`;

    const project = await tx.project.create({
      data: {
        code: nextCode,
        name: sum.projectName || contract.customerName,
        customerName: contract.customerName,
        customerPhone: contract.customerPhone ?? "",
        customerPortalToken: randomUUID(),
        customerPortalEnabled: true,
        address: "", // điền sau trong dự án
        areaM2: new Prisma.Decimal(sum.areaRaw || 0),
        unitPrice: new Prisma.Decimal(sum.donGiaTho || 0),
        contractValue: new Prisma.Decimal(sum.grand || 0),
        startDate: start,
        expectedEndDate: expectedEnd,
        projectManagerId: user.id, // placeholder = admin đang thao tác
        mainEngineerId: user.id,
        status: ProjectStatus.planning,
        notes: `Chuyển từ HĐ thiết kế ${contract.id}`,
        contractMeta: {
          fromDesignContractId: contract.id,
          quoteData: contract.quoteData,
        } as Prisma.InputJsonValue,
      },
      select: { id: true, code: true },
    });

    await tx.designContract.update({
      where: { id: contract.id },
      data: { projectId: project.id, status: "done" },
    });

    // Snapshot version "chốt" để lưu vết đúng trạng thái bàn giao sang dự án vận hành.
    const lastV = await tx.designContractQuoteVersion.findFirst({
      where: { contractId: contract.id },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    await tx.designContractQuoteVersion.create({
      data: {
        contractId: contract.id,
        seq: (lastV?.seq ?? 0) + 1,
        data: contract.quoteData as Prisma.InputJsonValue,
        grand: BigInt(Math.round(sum.grand || 0)),
        note: `Chốt & chuyển thi công → ${nextCode}`,
        createdById: user.id,
      },
    });

    return project;
  });

  return NextResponse.json({ ok: true, projectId: result.id, code: result.code }, { status: 201 });
}
