import { NextResponse } from "next/server";
import { ExpensePriority, ExpenseStatus, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyExpenseCreated } from "@/lib/notifications";
import { nextReminderForPriority } from "@/lib/expense-reminder";

const ROLES_VIEW = new Set<string>([UserRole.admin, UserRole.accountant]);

function canCreate(role: string) {
  return role === UserRole.admin;
}

function canView(role: string) {
  return ROLES_VIEW.has(role);
}

async function nextExpenseCode() {
  const now = new Date();
  const yymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `CHI-${yymm}-`;
  const last = await prisma.expense.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNo = last ? Number(last.code.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(lastNo + 1).padStart(4, "0")}`;
}

const createSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid("Danh mục không hợp lệ"),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  payee: z.string().trim().max(255).optional().nullable(),
  paymentMethod: z.enum(["cash", "transfer"]).optional(),
  note: z.string().trim().max(2000).optional().nullable(),
  attachmentUrl: z.string().trim().max(500).optional().nullable(),
  priority: z.enum(["normal", "urgent"]).optional(),
  payeeBankBin: z.string().trim().max(20).optional().nullable(),
  payeeAccountNumber: z.string().trim().max(40).optional().nullable(),
  payeeAccountName: z.string().trim().max(200).optional().nullable(),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canView(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("projectId");
  const categoryId = url.searchParams.get("categoryId");
  const search = url.searchParams.get("search")?.trim();

  const where: Prisma.ExpenseWhereInput = {};
  if (status && status !== "all" && (status === "pending" || status === "paid" || status === "cancelled")) {
    where.status = status as ExpenseStatus;
  }
  if (projectId === "none") where.projectId = null;
  else if (projectId) where.projectId = projectId;
  if (categoryId) where.categoryId = categoryId;
  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { payee: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.expense.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, code: true, name: true } },
      category: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
    },
    take: 500,
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canCreate(user.role)) {
    return NextResponse.json({ message: "Chỉ admin được tạo lệnh chi" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const data = parsed.data;
  const category = await prisma.expenseCategory.findUnique({ where: { id: data.categoryId } });
  if (!category || !category.active) {
    return NextResponse.json({ message: "Danh mục không tồn tại hoặc đã ngừng dùng" }, { status: 400 });
  }
  if (data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: data.projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ message: "Dự án không tồn tại" }, { status: 400 });
  }

  const code = await nextExpenseCode();
  const priority: ExpensePriority = data.priority === "urgent" ? ExpensePriority.urgent : ExpensePriority.normal;
  const expense = await prisma.expense.create({
    data: {
      code,
      projectId: data.projectId || null,
      categoryId: data.categoryId,
      amount: new Prisma.Decimal(data.amount),
      payee: data.payee?.trim() || null,
      paymentMethod: data.paymentMethod || null,
      note: data.note?.trim() || null,
      attachmentUrl: data.attachmentUrl?.trim() || null,
      status: ExpenseStatus.pending,
      priority,
      nextReminderAt: nextReminderForPriority(priority),
      payeeBankBin: data.payeeBankBin?.trim() || null,
      payeeAccountNumber: data.payeeAccountNumber?.trim() || null,
      payeeAccountName: data.payeeAccountName?.trim() || null,
      createdBy: user.id,
    },
    include: {
      project: { select: { id: true, code: true, name: true } },
      category: { select: { id: true, code: true, name: true } },
    },
  });

  fireAndForget(
    notifyExpenseCreated({
      expenseId: expense.id,
      code: expense.code,
      amount: Number(expense.amount),
      categoryName: expense.category.name,
      payee: expense.payee,
      projectLabel: expense.project ? `${expense.project.code} — ${expense.project.name}` : null,
      actorUserId: user.id,
      actorName: user.name || user.email || "Admin",
    }),
  );

  return NextResponse.json({
    expense: { ...expense, amount: Number(expense.amount), paidAmount: null },
    message: "Đã tạo lệnh chi. Đang chờ KT thanh toán.",
  });
}
