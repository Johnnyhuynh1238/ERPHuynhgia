import { NextResponse } from "next/server";
import { AdvanceStatus, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  PAID_EXPENSE,
  PENDING_EXPENSE,
  PENDING_RECEIPT,
  RECEIVED_RECEIPT,
  summarizeAdvance,
} from "@/lib/debts";

const VIEW_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

function canView(role: string) {
  return VIEW_ROLES.has(role);
}
function canCreate(role: string) {
  return role === UserRole.admin || role === UserRole.accountant;
}

async function nextAdvanceCode() {
  const now = new Date();
  const yymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `TU-${yymm}-`;
  const last = await prisma.advance.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNo = last ? Number(last.code.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(lastNo + 1).padStart(4, "0")}`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canView(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const advances = await prisma.advance.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      expenses: {
        where: { status: { in: [PAID_EXPENSE, ...PENDING_EXPENSE] } },
        select: { amount: true, status: true },
      },
      receipts: {
        where: { status: { in: [RECEIVED_RECEIPT, ...PENDING_RECEIPT] } },
        select: { amount: true, status: true },
      },
    },
    take: 500,
  });

  return NextResponse.json({
    rows: advances.map((a) => ({
      id: a.id,
      code: a.code,
      recipient: a.recipient,
      advancedAt: a.advancedAt,
      purpose: a.purpose,
      status: a.status,
      note: a.note,
      createdAt: a.createdAt,
      ...summarizeAdvance(a),
    })),
  });
}

const createSchema = z.object({
  recipient: z.string().trim().min(1, "Nhập người nhận tạm ứng").max(255),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  advancedAt: z.coerce.date().optional().nullable(),
  purpose: z.string().trim().max(2000).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canCreate(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const data = parsed.data;
  const code = await nextAdvanceCode();
  const advance = await prisma.advance.create({
    data: {
      code,
      recipient: data.recipient.trim(),
      amount: new Prisma.Decimal(data.amount),
      advancedAt: data.advancedAt || null,
      purpose: data.purpose?.trim() || null,
      note: data.note?.trim() || null,
      status: AdvanceStatus.open,
      createdBy: user.id,
    },
  });
  return NextResponse.json({ id: advance.id, code: advance.code }, { status: 201 });
}
