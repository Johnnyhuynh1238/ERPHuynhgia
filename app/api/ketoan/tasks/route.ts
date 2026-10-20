import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getOpenAccountantTasks, toTaskDto } from "@/lib/ketoan-todos";

const ROLES_VIEW = new Set<string>([UserRole.admin, UserRole.accountant]);

/** GET ?status=open|done — việc admin giao cho kế toán. done: 100 việc xong gần nhất. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ROLES_VIEW.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const status = new URL(request.url).searchParams.get("status") === "done" ? "done" : "open";
  if (status === "open") return NextResponse.json({ tasks: await getOpenAccountantTasks() });
  const rows = await prisma.accountantTask.findMany({
    where: { status: "done" },
    orderBy: { doneAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ tasks: rows.map(toTaskDto) });
}

/** POST {title, note?, dueDate?} — admin giao việc (AI thường ghi thẳng DB). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin giao việc" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as
    | { title?: unknown; note?: unknown; dueDate?: unknown }
    | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ message: "Thiếu nội dung việc" }, { status: 400 });
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
  const dueStr = typeof body?.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : null;

  const row = await prisma.accountantTask.create({
    data: {
      title,
      note,
      dueDate: dueStr ? new Date(`${dueStr}T00:00:00Z`) : null,
      createdByName: user.name || "Admin",
    },
  });
  return NextResponse.json({ task: toTaskDto(row) }, { status: 201 });
}
