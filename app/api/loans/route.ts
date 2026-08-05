import { NextResponse } from "next/server";
import { LoanStatus, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  PAID_EXPENSE,
  PENDING_EXPENSE,
  PENDING_RECEIPT,
  RECEIVED_RECEIPT,
  summarizeLoan,
} from "@/lib/debts";

const VIEW_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

function canView(role: string) {
  return VIEW_ROLES.has(role);
}
function canCreate(role: string) {
  return role === UserRole.admin || role === UserRole.accountant;
}

async function nextLoanCode() {
  const now = new Date();
  const yymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `VAY-${yymm}-`;
  const last = await prisma.loan.findFirst({
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

  const loans = await prisma.loan.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      expenses: {
        where: { status: { in: [PAID_EXPENSE, ...PENDING_EXPENSE] } },
        select: { amount: true, status: true, category: { select: { code: true } } },
      },
      receipts: {
        where: { status: { in: [RECEIVED_RECEIPT, ...PENDING_RECEIPT] } },
        select: { amount: true, status: true },
      },
    },
    take: 500,
  });

  return NextResponse.json({
    rows: loans.map((l) => ({
      id: l.id,
      code: l.code,
      lender: l.lender,
      interestRate: l.interestRate != null ? Number(l.interestRate) : null,
      disbursedAt: l.disbursedAt,
      dueDate: l.dueDate,
      status: l.status,
      note: l.note,
      createdAt: l.createdAt,
      ...summarizeLoan(l),
    })),
  });
}

const createSchema = z.object({
  lender: z.string().trim().min(1, "Nhập bên cho vay").max(255),
  principal: z.coerce.number().positive("Số tiền gốc phải lớn hơn 0"),
  interestRate: z.coerce.number().min(0).max(1000).optional().nullable(),
  disbursedAt: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
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
  const code = await nextLoanCode();
  const loan = await prisma.loan.create({
    data: {
      code,
      lender: data.lender.trim(),
      principal: new Prisma.Decimal(data.principal),
      interestRate: data.interestRate != null ? new Prisma.Decimal(data.interestRate) : null,
      disbursedAt: data.disbursedAt || null,
      dueDate: data.dueDate || null,
      note: data.note?.trim() || null,
      status: LoanStatus.active,
      createdBy: user.id,
    },
  });
  return NextResponse.json({ id: loan.id, code: loan.code }, { status: 201 });
}
