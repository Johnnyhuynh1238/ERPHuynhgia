import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { getClientIpFromHeaders } from "@/lib/customer-portal";

export const dynamic = "force-dynamic";

const signSchema = z.object({
  signatureUrl: z
    .string()
    .startsWith("data:image/", "Chữ ký không hợp lệ")
    .max(500_000, "Chữ ký quá lớn, vui lòng ký lại"),
  signerName: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
  confirmed: z.boolean().refine((v) => v === true, "Bạn chưa xác nhận đồng ý nghiệm thu"),
});

export async function POST(request: Request, { params }: { params: { token: string; milestoneId: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) {
    return NextResponse.json({ message: "Phiên không hợp lệ" }, { status: 401 });
  }

  const parsed = signSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const milestone = await prisma.acceptanceMilestone.findFirst({
    where: { id: params.milestoneId, projectId: project.id },
    select: { id: true, seq: true, title: true, status: true },
  });
  if (!milestone) return NextResponse.json({ message: "Không tìm thấy mốc nghiệm thu" }, { status: 404 });
  if (milestone.status === "signed") {
    return NextResponse.json({ message: "Mốc này đã được ký trước đó" }, { status: 409 });
  }

  const updated = await prisma.acceptanceMilestone.updateMany({
    where: { id: milestone.id, status: "pending" },
    data: {
      status: "signed",
      signatureUrl: parsed.data.signatureUrl,
      signerName: parsed.data.signerName || project.customerName,
      customerNote: parsed.data.note || null,
      signedAt: new Date(),
      ipAddress: getClientIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent") || "",
    },
  });
  if (updated.count === 0) {
    return NextResponse.json({ message: "Mốc này đã được ký trước đó" }, { status: 409 });
  }

  return NextResponse.json({
    message: "Đã ký nghiệm thu",
    redirect: `/cn/${params.token}/timeline`,
  });
}
