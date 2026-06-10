import { NextResponse } from "next/server";
import { z } from "zod";
import { DesignContractStepKind } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const Schema = z.object({
  leadId: z.string().uuid().nullable().optional(),
  designContractId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  targetStage: z.number().int().min(1).max(7),
});

const STEP_KINDS: DesignContractStepKind[] = [
  "mat_bang",
  "mat_tien_3d",
  "noi_that",
  "shop_drawing",
];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON không hợp lệ" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  const { leadId, designContractId, projectId, targetStage } = parsed.data;

  // Stage 1-2: chỉ update lead
  if (targetStage === 1 || targetStage === 2) {
    if (!leadId) return NextResponse.json({ message: "Cần leadId" }, { status: 400 });
    const status = targetStage === 1 ? "new" : "contacted";
    await prisma.baogiaLead.update({
      where: { id: leadId },
      data: {
        status,
        contactedAt: targetStage === 2 ? new Date() : null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // Stage 3: tạo DesignContract (nếu chưa có) + bump lead.signed
  if (targetStage === 3) {
    if (!leadId && !designContractId) {
      return NextResponse.json({ message: "Cần leadId hoặc designContractId" }, { status: 400 });
    }
    if (designContractId) {
      await prisma.designContract.update({
        where: { id: designContractId },
        data: { status: "active" },
      });
    } else if (leadId) {
      const lead = await prisma.baogiaLead.findUnique({ where: { id: leadId } });
      if (!lead) return NextResponse.json({ message: "Không tìm thấy lead" }, { status: 404 });
      await prisma.designContract.create({
        data: {
          customerName: lead.name,
          customerPhone: lead.phone,
          leadId: lead.id,
          signedAt: new Date(),
          steps: { create: STEP_KINDS.map((kind) => ({ kind })) },
        },
      });
      await prisma.baogiaLead.update({ where: { id: lead.id }, data: { status: "signed" } });
    }
    return NextResponse.json({ ok: true });
  }

  // Stage 4: cần Project; nếu chưa có Project → báo redirect /projects/new
  if (targetStage === 4) {
    if (!projectId) {
      return NextResponse.json(
        {
          message: "Chưa có dự án",
          redirect: "/projects/new",
          hint: "Tạo Project mới với status=planning để vào stage 4",
        },
        { status: 409 },
      );
    }
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "planning" },
    });
    // Đồng thời: nếu HĐ Thiết kế còn active → đánh dấu done
    if (designContractId) {
      await prisma.designContract.update({
        where: { id: designContractId },
        data: { status: "done" },
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Stage 5,6,7: chỉ update Project
  if (!projectId) {
    return NextResponse.json({ message: "Cần projectId" }, { status: 400 });
  }
  if (targetStage === 5) {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "in_progress" },
    });
  } else if (targetStage === 6) {
    // Bàn giao = completed + actualEndDate=hôm nay
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", actualEndDate: new Date() },
    });
  } else if (targetStage === 7) {
    // Bảo hành = completed (đặt actualEndDate lùi 31 ngày để vượt window 30d)
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
    const ended = project.actualEndDate
      ? project.actualEndDate
      : new Date(Date.now() - 31 * 86_400_000);
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", actualEndDate: ended },
    });
  }
  return NextResponse.json({ ok: true });
}
