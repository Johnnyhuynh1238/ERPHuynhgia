import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { logAdminAudit } from "@/lib/admin-audit-log";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/customer-pipeline";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const url = new URL(req.url);
  const phone = url.searchParams.get("phone");
  if (!phone) return NextResponse.json({ message: "Thiếu phone" }, { status: 400 });
  const key = normalizePhone(phone);
  if (!key) return NextResponse.json({ message: "Phone không hợp lệ" }, { status: 400 });
  const meta = await prisma.customerPipelineMeta.findUnique({ where: { customerKey: key } });
  return NextResponse.json({ meta });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Body rỗng" }, { status: 400 });
  const { customerName, customerPhone, nextAction, nextActionDue, touchLastContact } = body as {
    customerName?: string;
    customerPhone?: string;
    nextAction?: string | null;
    nextActionDue?: string | null;
    touchLastContact?: boolean;
  };
  if (!customerPhone) return NextResponse.json({ message: "Thiếu customerPhone" }, { status: 400 });
  const key = normalizePhone(customerPhone);
  if (!key) return NextResponse.json({ message: "Phone không hợp lệ" }, { status: 400 });

  const data: Record<string, unknown> = {
    customerName: customerName ?? "",
    customerPhone,
  };
  if (nextAction !== undefined) data.nextAction = nextAction || null;
  if (nextActionDue !== undefined) data.nextActionDue = nextActionDue ? new Date(nextActionDue) : null;
  if (touchLastContact) data.lastContactAt = new Date();

  const before = await prisma.customerPipelineMeta.findUnique({ where: { customerKey: key } });
  const meta = await prisma.customerPipelineMeta.upsert({
    where: { customerKey: key },
    update: data,
    create: {
      customerKey: key,
      customerName: customerName ?? "",
      customerPhone,
      nextAction: nextAction ?? null,
      nextActionDue: nextActionDue ? new Date(nextActionDue) : null,
      lastContactAt: touchLastContact ? new Date() : null,
    },
  });

  const dueLabel = nextActionDue
    ? new Date(nextActionDue).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;
  const summaryParts: string[] = [];
  if (nextAction !== undefined) summaryParts.push(nextAction ? `nextAction="${nextAction}"` : "xoá nextAction");
  if (nextActionDue !== undefined) summaryParts.push(dueLabel ? `due=${dueLabel}` : "xoá due");
  if (touchLastContact) summaryParts.push("vừa liên hệ");
  await logAdminAudit(prisma, {
    actorId: user.id,
    entity: "customer_pipeline_meta",
    entityId: key,
    action: before ? "update" : "create",
    summary: `${customerName || customerPhone}: ${summaryParts.join(", ") || "cập nhật"}`,
    metadata: {
      customerPhone,
      nextAction: nextAction ?? null,
      nextActionDue: nextActionDue ?? null,
      touchLastContact: !!touchLastContact,
    },
  });

  return NextResponse.json({ meta });
}
