import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  changes: z
    .array(
      z.object({
        source: z.enum(["mh_order", "sub", "expense"]),
        id: z.string().uuid(),
        budgetLineId: z.string().uuid().nullable(),
      }),
    )
    .min(1)
    .max(500),
});

// POST: đổi hạng mục ngân sách cho nhiều khoản chi cùng lúc (admin).
//   source = mh_order | sub | expense. budgetLineId = null để bỏ gắn.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== UserRole.admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 400 });

  const projectId = params.id;
  const { changes } = parsed.data;

  // Hạng mục đích phải thuộc dự án (hoặc null = bỏ gắn).
  const validLines = new Set(
    (
      await prisma.projectBudgetPlanLine.findMany({
        where: { plan: { projectId } },
        select: { id: true },
      })
    ).map((l) => l.id),
  );
  for (const c of changes) {
    if (c.budgetLineId && !validLines.has(c.budgetLineId)) {
      return NextResponse.json({ error: "Hạng mục không thuộc dự án" }, { status: 400 });
    }
  }

  // updateMany scope theo id + projectId → không đụng dự án khác.
  await prisma.$transaction(
    changes.map((c) => {
      const where = { id: c.id, projectId } as { id: string; projectId: string };
      const data = { budgetLineId: c.budgetLineId };
      if (c.source === "mh_order") return prisma.mhOrder.updateMany({ where, data });
      if (c.source === "sub") return prisma.subContract.updateMany({ where, data });
      return prisma.expense.updateMany({ where, data });
    }),
  );

  return NextResponse.json({ ok: true, count: changes.length });
}
