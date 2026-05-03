import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  plannedDeadline: z.string().nullable(),
});

function normalizeDate(raw: string) {
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được cập nhật deadline" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const exists = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });

  if (!exists) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  const plannedDeadline = parsed.data.plannedDeadline ? normalizeDate(parsed.data.plannedDeadline) : null;

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: {
      plannedDeadline,
    },
    select: {
      id: true,
      code: true,
      plannedDeadline: true,
    },
  });

  return NextResponse.json({ project: updated, message: "Đã cập nhật deadline" });
}
