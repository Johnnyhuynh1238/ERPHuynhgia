import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

type Line = {
  id: string;
  occurredAt: string;
  direction: "in" | "out";
  amount: number;
  note: string | null;
};

function serialize(t: {
  id: string;
  occurredAt: Date;
  direction: "in" | "out";
  amount: unknown;
  note: string | null;
}): Line {
  return {
    id: t.id,
    occurredAt: t.occurredAt.toISOString(),
    direction: t.direction,
    amount: Number(t.amount),
    note: t.note,
  };
}

// Danh sách khoản sổ quỹ đã gắn HĐ + ứng viên chưa gắn (để đưa chi phí cũ vào)
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const q = new URL(request.url).searchParams.get("q")?.trim() || "";

  const [attached, candidates] = await Promise.all([
    prisma.cashTransaction.findMany({
      where: { designContractId: params.id },
      orderBy: { occurredAt: "asc" },
      select: { id: true, occurredAt: true, direction: true, amount: true, note: true },
    }),
    prisma.cashTransaction.findMany({
      where: {
        designContractId: null,
        projectId: null,
        ...(q ? { note: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
      select: { id: true, occurredAt: true, direction: true, amount: true, note: true },
    }),
  ]);

  return NextResponse.json({
    attached: attached.map(serialize),
    candidates: candidates.map(serialize),
  });
}

const PatchSchema = z.object({
  attach: z.array(z.string().uuid()).optional(),
  detach: z.array(z.string().uuid()).optional(),
});

// Gắn / gỡ khoản sổ quỹ khỏi HĐ thiết kế
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const contract = await prisma.designContract.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!contract) return NextResponse.json({ message: "Không tìm thấy HĐ thiết kế" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON không hợp lệ" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  const { attach = [], detach = [] } = parsed.data;

  // Chỉ gắn khoản đang trôi nổi (chưa gắn HĐ nào, chưa gắn dự án) để không cướp khoản của dự án khác
  if (attach.length) {
    await prisma.cashTransaction.updateMany({
      where: { id: { in: attach }, designContractId: null, projectId: null },
      data: { designContractId: params.id },
    });
  }
  if (detach.length) {
    await prisma.cashTransaction.updateMany({
      where: { id: { in: detach }, designContractId: params.id },
      data: { designContractId: null },
    });
  }
  return NextResponse.json({ ok: true });
}
