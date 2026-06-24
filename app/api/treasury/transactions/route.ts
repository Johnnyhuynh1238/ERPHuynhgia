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
      },
      take: 5000,
    });
    const header = "Ngày,Loại,Hướng,Dự án,Danh mục,Mô tả,Thu,Chi,Số dư sau,Người ghi";
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
      return [d, REFTYPE_LABEL[r.refType], direction, project, category, note, inCol, outCol, after, who]
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
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.cashTransaction.count({ where }),
  ]);

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      balanceAfter: Number(r.balanceAfter),
    })),
    total,
    page,
    pageSize,
  });
}
