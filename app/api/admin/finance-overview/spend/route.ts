import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { NON_COST_CATEGORY_CODES } from "@/lib/company-finance";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Chi phí đã chi theo danh mục trong khoảng [from, to] (ngày VN, gồm cả 2 đầu).
// Nguồn = sổ quỹ chi (ref_type=expense); bỏ chuyển quỹ nội bộ (transfer)
// và khoản không phải chi phí (trả nợ gốc, chi tạm ứng).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json({ message: "Khoảng ngày không hợp lệ" }, { status: 400 });
  }
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000);

  const groups = await prisma.cashTransaction.groupBy({
    by: ["categoryId"],
    where: {
      direction: "out",
      refType: "expense",
      occurredAt: { gte: start, lt: end },
      OR: [{ categoryId: null }, { category: { code: { notIn: NON_COST_CATEGORY_CODES } } }],
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const ids = groups.map((g) => g.categoryId).filter((x): x is string => !!x);
  const cats = ids.length
    ? await prisma.expenseCategory.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } })
    : [];
  const byId = new Map(cats.map((c) => [c.id, c]));

  const items = groups
    .map((g) => {
      const c = g.categoryId ? byId.get(g.categoryId) : undefined;
      return {
        categoryId: g.categoryId,
        code: c?.code ?? null,
        name: c?.name ?? "Chưa phân loại",
        amount: Number(g._sum.amount ?? 0),
        count: g._count._all,
      };
    })
    .filter((i) => i.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return NextResponse.json({
    from,
    to,
    total: items.reduce((s, i) => s + i.amount, 0),
    items,
  });
}
