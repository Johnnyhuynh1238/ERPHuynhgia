import { NextResponse } from "next/server";
import { CashTxnDirection, CashTxnRefType, Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const ROLES_VIEW = new Set<string>([UserRole.admin, UserRole.accountant]);

const DIRECTION_SET = new Set<CashTxnDirection>(["in", "out"]);
const REFTYPE_SET = new Set<CashTxnRefType>([
  "opening",
  "expense",
  "sub_payment",
  "material_proposal",
  "payment_schedule",
  "receipt",
  "transfer",
]);

function buildWhere(url: URL): Prisma.CashTransactionWhereInput {
  const where: Prisma.CashTransactionWhereInput = {};
  const direction = url.searchParams.get("direction");
  if (direction && DIRECTION_SET.has(direction as CashTxnDirection)) {
    where.direction = direction as CashTxnDirection;
  }
  const refType = url.searchParams.get("refType");
  if (refType && REFTYPE_SET.has(refType as CashTxnRefType)) {
    where.refType = refType as CashTxnRefType;
  }
  const accountId = url.searchParams.get("accountId");
  if (accountId) where.accountId = accountId;
  const projectId = url.searchParams.get("projectId");
  if (projectId === "none") where.projectId = null;
  else if (projectId) where.projectId = projectId;
  const categoryId = url.searchParams.get("categoryId");
  if (categoryId) where.categoryId = categoryId;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from || to) {
    where.occurredAt = {};
    if (from) (where.occurredAt as { gte?: Date }).gte = new Date(`${from}T00:00:00.000Z`);
    if (to) (where.occurredAt as { lte?: Date }).lte = new Date(`${to}T23:59:59.999Z`);
  }
  return where;
}

const REFTYPE_LABEL: Record<CashTxnRefType, string> = {
  opening: "Khởi tạo",
  expense: "Lệnh chi",
  sub_payment: "TT thầu phụ",
  material_proposal: "Đề xuất vật tư",
  payment_schedule: "Thu chủ nhà",
  receipt: "Lệnh thu",
  transfer: "Chuyển quỹ",
};

function csvEscape(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES_VIEW.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const url = new URL(request.url);
  const where = buildWhere(url);

  const fmt = url.searchParams.get("format");
  if (fmt === "csv") {
    const rows = await prisma.cashTransaction.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      include: {
        project: { select: { code: true, name: true } },
        category: { select: { name: true } },
        creator: { select: { fullName: true } },
        account: { select: { name: true } },
        counterAccount: { select: { name: true } },
      },
      take: 5000,
    });
    const header = "Ngày,Loại,Hướng,Tài khoản,Dự án,Danh mục,Mô tả,Thu,Chi,Số dư sau,Người ghi";
    const lines = rows.map((r) => {
      const d = r.occurredAt.toISOString().slice(0, 10);
      const direction = r.direction === "in" ? "Thu" : "Chi";
      const project = r.project ? `${r.project.code} ${r.project.name}` : "Chi chung";
      const category = r.category?.name ?? "";
      const note = r.note ?? "";
      const amt = Number(r.amount);
      const inCol = r.direction === "in" ? amt : "";
      const outCol = r.direction === "out" ? amt : "";
      const after = Number(r.balanceAfter);
      const who = r.creator?.fullName ?? "";
      const acc = r.counterAccount
        ? `${r.account.name} ↔ ${r.counterAccount.name}`
        : r.account.name;
      return [d, REFTYPE_LABEL[r.refType], direction, acc, project, category, note, inCol, outCol, after, who]
        .map(csvEscape)
        .join(",");
    });
    const csv = "﻿" + [header, ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="so-quy-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get("pageSize")) || 50));

  const [rows, total] = await Promise.all([
    prisma.cashTransaction.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      include: {
        project: { select: { id: true, code: true, name: true } },
        category: { select: { id: true, code: true, name: true } },
        creator: { select: { id: true, fullName: true } },
        account: { select: { id: true, name: true, kind: true } },
        counterAccount: { select: { id: true, name: true, kind: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.cashTransaction.count({ where }),
  ]);

  const idsByType = {
    expense: [] as string[],
    receipt: [] as string[],
    sub_payment: [] as string[],
    payment_schedule: [] as string[],
  };
  for (const r of rows) {
    if (!r.refId) continue;
    if (r.refType === "expense") idsByType.expense.push(r.refId);
    else if (r.refType === "receipt") idsByType.receipt.push(r.refId);
    else if (r.refType === "sub_payment") idsByType.sub_payment.push(r.refId);
    else if (r.refType === "payment_schedule") idsByType.payment_schedule.push(r.refId);
  }

  const [expenseRows, receiptRows, subPayRows, payScheduleRows] = await Promise.all([
    idsByType.expense.length
      ? prisma.expense.findMany({
          where: { id: { in: idsByType.expense } },
          select: { id: true, attachmentUrl: true, attachmentUrls: true, paidReceiptUrl: true },
        })
      : Promise.resolve(
          [] as { id: string; attachmentUrl: string | null; attachmentUrls: string[]; paidReceiptUrl: string | null }[],
        ),
    idsByType.receipt.length
      ? prisma.receipt.findMany({
          where: { id: { in: idsByType.receipt } },
          select: { id: true, attachmentUrl: true, receivedReceiptUrl: true },
        })
      : Promise.resolve([] as { id: string; attachmentUrl: string | null; receivedReceiptUrl: string | null }[]),
    idsByType.sub_payment.length
      ? prisma.subPayment.findMany({
          where: { id: { in: idsByType.sub_payment } },
          select: { id: true, receiptUrl: true },
        })
      : Promise.resolve([] as { id: string; receiptUrl: string | null }[]),
    idsByType.payment_schedule.length
      ? prisma.paymentSchedule.findMany({
          where: { id: { in: idsByType.payment_schedule } },
          select: { id: true, receiptUrl: true },
        })
      : Promise.resolve([] as { id: string; receiptUrl: string | null }[]),
  ]);

  const attMap = new Map<string, string[]>();
  const keyOf = (t: string, id: string) => `${t}:${id}`;
  for (const e of expenseRows) {
    const list = e.attachmentUrls?.length ? e.attachmentUrls : (e.attachmentUrl ? [e.attachmentUrl] : []);
    attMap.set(
      keyOf("expense", e.id),
      [...list, e.paidReceiptUrl].filter((u): u is string => !!u),
    );
  }
  for (const r of receiptRows) {
    attMap.set(
      keyOf("receipt", r.id),
      [r.attachmentUrl, r.receivedReceiptUrl].filter((u): u is string => !!u),
    );
  }
  for (const s of subPayRows) {
    attMap.set(keyOf("sub_payment", s.id), [s.receiptUrl].filter((u): u is string => !!u));
  }
  for (const p of payScheduleRows) {
    attMap.set(keyOf("payment_schedule", p.id), [p.receiptUrl].filter((u): u is string => !!u));
  }

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      balanceAfter: Number(r.balanceAfter),
      attachments: r.refId ? attMap.get(keyOf(r.refType, r.refId)) ?? [] : [],
    })),
    total,
    page,
    pageSize,
  });
}
