import { NextResponse } from "next/server";
import { Prisma, ReceiptSource, ReceiptStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyReceiptCreated } from "@/lib/notifications";

const VIEW_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

function canCreate(role: string) {
  return role === UserRole.admin;
}

function canView(role: string) {
  return VIEW_ROLES.has(role);
}

async function nextReceiptCode() {
  const now = new Date();
  const yymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `THU-${yymm}-`;
  const last = await prisma.receipt.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNo = last ? Number(last.code.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(lastNo + 1).padStart(4, "0")}`;
}

const createSchema = z.object({
  source: z.enum(["customer", "loan", "advance_return", "other"]),
  projectId: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  payer: z.string().trim().max(255).optional().nullable(),
  paymentMethod: z.enum(["cash", "transfer"]).optional(),
  note: z.string().trim().max(2000).optional().nullable(),
  attachmentUrl: z.string().trim().max(500).optional().nullable(),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canView(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const projectId = url.searchParams.get("projectId");
  const search = url.searchParams.get("search")?.trim();

  const where: Prisma.ReceiptWhereInput = {};
  if (status && (status === "pending" || status === "received" || status === "cancelled")) {
    where.status = status as ReceiptStatus;
  }
  if (source && (source === "customer" || source === "loan" || source === "advance_return" || source === "other")) {
    where.source = source as ReceiptSource;
  }
  if (projectId === "none") where.projectId = null;
  else if (projectId) where.projectId = projectId;
  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { payer: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.receipt.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, fullName: true } },
      receiver: { select: { id: true, fullName: true } },
    },
    take: 500,
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      receivedAmount: r.receivedAmount != null ? Number(r.receivedAmount) : null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canCreate(user.role)) {
    return NextResponse.json({ message: "Chỉ admin được tạo lệnh thu" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const data = parsed.data;
  if (data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: data.projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ message: "Dự án không tồn tại" }, { status: 400 });
  }

  const code = await nextReceiptCode();
  const receipt = await prisma.receipt.create({
    data: {
      code,
      source: data.source as ReceiptSource,
      projectId: data.projectId || null,
      amount: new Prisma.Decimal(data.amount),
      payer: data.payer?.trim() || null,
      paymentMethod: data.paymentMethod || null,
      note: data.note?.trim() || null,
      attachmentUrl: data.attachmentUrl?.trim() || null,
      status: ReceiptStatus.pending,
      createdBy: user.id,
    },
    include: {
      project: { select: { id: true, code: true, name: true } },
    },
  });

  fireAndForget(
    notifyReceiptCreated({
      receiptId: receipt.id,
      code: receipt.code,
      amount: Number(receipt.amount),
      source: receipt.source,
      payer: receipt.payer,
      projectLabel: receipt.project ? `${receipt.project.code} — ${receipt.project.name}` : null,
      actorUserId: user.id,
      actorName: user.name || user.email || "Admin",
    }),
  );

  return NextResponse.json({
    receipt: { ...receipt, amount: Number(receipt.amount), receivedAmount: null },
    message: "Đã tạo lệnh thu. Đang chờ KT xác nhận đã thu.",
  });
}
