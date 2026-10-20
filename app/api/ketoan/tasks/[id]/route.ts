import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { toTaskDto } from "@/lib/ketoan-todos";

const ROLES_VIEW = new Set<string>([UserRole.admin, UserRole.accountant]);

/** PATCH {done: boolean} — KT tick xong / mở lại việc. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES_VIEW.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { done?: unknown } | null;
  if (typeof body?.done !== "boolean") {
    return NextResponse.json({ message: "Thiếu trạng thái done" }, { status: 400 });
  }
  const existing = await prisma.accountantTask.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ message: "Không tìm thấy việc" }, { status: 404 });

  const row = await prisma.accountantTask.update({
    where: { id: params.id },
    data: body.done
      ? { status: "done", doneAt: new Date(), doneById: user.id }
      : { status: "open", doneAt: null, doneById: null },
  });
  return NextResponse.json({ task: toTaskDto(row) });
}
