import { NextResponse } from "next/server";
import { ExpensePriority, ExpenseStatus, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fireAndForget, notifyExpenseKsRequest } from "@/lib/notifications";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

const PETTY_CASH_CATEGORY_CODE = "MUA-LE";

const createSchema = z.object({
  projectId: z.string().uuid("Thiếu dự án"),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  note: z.string().trim().min(3, "Mô tả đơn hàng tối thiểu 3 ký tự").max(2000),
  attachmentUrl: z.string().trim().min(1, "Bắt buộc gửi ảnh hoá đơn").max(500),
  priority: z.enum(["normal", "urgent"]).optional(),
  payee: z.string().trim().max(255).optional().nullable(),
});

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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.engineer && user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  const where: Prisma.ExpenseWhereInput = {
    createdBy: user.id,
  };
  if (projectId) where.projectId = projectId;

  const rows = await prisma.expense.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, code: true, name: true } },
      category: { select: { id: true, code: true, name: true } },
      tptcApprover: { select: { id: true, fullName: true } },
    },
    take: 100,
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
  if (user.role !== UserRole.engineer) {
    return NextResponse.json({ message: "Chỉ KS được tạo yêu cầu chi mua lẻ" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const data = parsed.data;

  // KS phải có quyền truy cập dự án
  const projectAccess = buildProjectAccessWhere({ id: user.id, role: user.role });
  const project = await prisma.project.findFirst({
    where: { id: data.projectId, ...projectAccess },
    select: { id: true, code: true, name: true },
  });
  if (!project) {
    return NextResponse.json({ message: "Dự án không tồn tại hoặc bạn không có quyền" }, { status: 403 });
  }

  const category = await prisma.expenseCategory.findUnique({ where: { code: PETTY_CASH_CATEGORY_CODE } });
  if (!category) {
    return NextResponse.json({ message: "Chưa cấu hình danh mục 'Hàng mua lẻ công trình'" }, { status: 500 });
  }

  const code = await nextExpenseCode();
  const priority: ExpensePriority = data.priority === "urgent" ? ExpensePriority.urgent : ExpensePriority.normal;
  const expense = await prisma.expense.create({
    data: {
      code,
      projectId: project.id,
      categoryId: category.id,
      amount: new Prisma.Decimal(data.amount),
      payee: data.payee?.trim() || null,
      note: data.note.trim(),
      attachmentUrl: data.attachmentUrl,
      status: ExpenseStatus.tptc_pending,
      priority,
      // nextReminderAt: chỉ kích hoạt khi đã sang pending (TPTC duyệt)
      createdBy: user.id,
    },
  });

  fireAndForget(
    notifyExpenseKsRequest({
      expenseId: expense.id,
      code: expense.code,
      amount: Number(expense.amount),
      note: expense.note,
      projectLabel: `${project.code} — ${project.name}`,
      actorUserId: user.id,
      actorName: user.name || user.email || "KS",
    }),
  );

  return NextResponse.json({
    expense: { ...expense, amount: Number(expense.amount), paidAmount: null },
    message: "Đã gửi yêu cầu. Chờ TPTC duyệt.",
  });
}
