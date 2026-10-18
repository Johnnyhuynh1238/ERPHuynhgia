import { NextResponse } from "next/server";
import { ExpensePriority, ExpenseStatus, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { nextReminderForPriority } from "@/lib/expense-reminder";

const VIEW_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!VIEW_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const row = await prisma.expense.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { id: true, code: true, name: true } },
      category: { select: { id: true, code: true, name: true } },
      creator: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
      canceller: { select: { id: true, fullName: true } },
    },
  });
  if (!row) return NextResponse.json({ message: "Không tìm thấy lệnh chi" }, { status: 404 });

  return NextResponse.json({
    expense: {
      ...row,
      amount: Number(row.amount),
      paidAmount: row.paidAmount != null ? Number(row.paidAmount) : null,
    },
  });
}

// Admin sửa lệnh chi khi duyệt (chờ duyệt) hoặc trước khi KT chi (chờ chi).
// Lệnh gắn nguồn (mua hàng / công nợ NCC / thầu phụ / vay / tạm ứng / thiết kế) → khoá dự án + danh mục
// để không lệch liên kết; vẫn sửa được số tiền, người nhận, STK, ghi chú, hoá đơn.
const editSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  designContractId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid("Danh mục không hợp lệ"),
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  payee: z.string().trim().max(255).optional().nullable(),
  payeePhone: z.string().trim().max(20).optional().nullable(),
  paymentMethod: z.enum(["cash", "transfer"]).optional(),
  note: z.string().trim().max(2000).optional().nullable(),
  attachmentUrls: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  priority: z.enum(["normal", "urgent"]).optional(),
  payeeBankBin: z.string().trim().max(20).optional().nullable(),
  payeeAccountNumber: z.string().trim().max(40).optional().nullable(),
  payeeAccountName: z.string().trim().max(200).optional().nullable(),
});

const EDITABLE_STATUSES = new Set<string>([ExpenseStatus.tptc_pending, ExpenseStatus.pending]);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== UserRole.admin) return NextResponse.json({ message: "Chỉ admin được sửa lệnh chi" }, { status: 403 });

  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const data = parsed.data;

  const current = await prisma.expense.findUnique({ where: { id: params.id } });
  if (!current) return NextResponse.json({ message: "Lệnh chi không tồn tại" }, { status: 404 });
  if (!EDITABLE_STATUSES.has(current.status)) {
    return NextResponse.json({ message: "Chỉ sửa được lệnh chi đang chờ duyệt / chờ chi" }, { status: 409 });
  }

  const linked = !!(current.sourceType || current.subPaymentId || current.loanId || current.advanceId);
  let projectId = data.projectId || null;
  let designContractId = data.designContractId || null;
  let categoryId = data.categoryId;
  if (linked) {
    projectId = current.projectId;
    designContractId = current.designContractId;
    categoryId = current.categoryId;
  } else {
    if (categoryId !== current.categoryId) {
      const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
      if (!category || !category.active) {
        return NextResponse.json({ message: "Danh mục không tồn tại hoặc đã ngừng dùng" }, { status: 400 });
      }
      if (["TAMUNG", "TRANOGOC", "LAIVAY"].includes(category.code)) {
        return NextResponse.json({ message: "Danh mục vay/tạm ứng phải tạo ở màn Vay & Tạm ứng" }, { status: 400 });
      }
    }
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
      if (!project) return NextResponse.json({ message: "Dự án không tồn tại" }, { status: 400 });
      designContractId = null;
    } else if (designContractId) {
      const dc = await prisma.designContract.findUnique({ where: { id: designContractId }, select: { id: true } });
      if (!dc) return NextResponse.json({ message: "Hợp đồng thiết kế không tồn tại" }, { status: 400 });
    }
  }

  const bankBin = data.payeeBankBin?.trim() || null;
  const accNo = data.payeeAccountNumber?.trim() || null;
  if (!!bankBin !== !!accNo) {
    return NextResponse.json({ message: "Chọn ngân hàng và nhập STK hoặc bỏ trống cả 2" }, { status: 400 });
  }

  const priority: ExpensePriority = data.priority === "urgent" ? ExpensePriority.urgent : ExpensePriority.normal;
  const urls = data.attachmentUrls ? data.attachmentUrls.map((u) => u.trim()).filter(Boolean) : current.attachmentUrls;

  const updated = await prisma.expense.update({
    where: { id: current.id },
    data: {
      projectId,
      designContractId,
      categoryId,
      amount: new Prisma.Decimal(data.amount),
      payee: data.payee?.trim() || null,
      payeePhone: data.payeePhone?.trim() || null,
      paymentMethod: data.paymentMethod || current.paymentMethod,
      note: data.note?.trim() || null,
      attachmentUrl: urls[0] ?? null,
      attachmentUrls: urls,
      priority,
      // Đổi mức ưu tiên lệnh đang chờ chi → tính lại nhắc KT.
      ...(current.status === ExpenseStatus.pending && priority !== current.priority
        ? { nextReminderAt: nextReminderForPriority(priority) }
        : {}),
      payeeBankBin: bankBin,
      payeeAccountNumber: accNo,
      payeeAccountName: data.payeeAccountName?.trim() || null,
    },
  });

  return NextResponse.json({
    expense: { id: updated.id, code: updated.code, status: updated.status },
    message: `Đã sửa lệnh chi ${updated.code}`,
  });
}
