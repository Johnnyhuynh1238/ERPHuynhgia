import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: { draftId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const draft = await prisma.projectChangeDraft.findUnique({ where: { id: params.draftId }, select: { id: true } });
  if (!draft) return NextResponse.json({ message: "Không tìm thấy bản nháp" }, { status: 404 });

  const run = await prisma.projectAiRun.findFirst({
    where: { draftId: params.draftId },
    orderBy: { createdAt: "desc" },
    include: {
      proposals: { orderBy: { createdAt: "asc" } },
      conflicts: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({ run, proposals: run?.proposals || [], conflicts: run?.conflicts || [] });
}
