import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

function mapAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "401_UNAUTHORIZED") {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (message === "403_FORBIDDEN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  return null;
}

const patchSchema = z.object({
  retired: z.boolean().optional(),
  defaultTeam: z.string().nullable().optional(),
  defaultInspector: z.string().nullable().optional(),
  defaultOffsetDays: z.number().int().nullable().optional(),
  defaultDurationDays: z.number().int().min(1).nullable().optional(),
  materialsNeeded: z.string().nullable().optional(),
  qcChecklist: z.string().nullable().optional(),
  proposerRole: z.string().nullable().optional(),
  ordererRole: z.string().nullable().optional(),
  receiverRole: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.retired !== undefined) {
    data.retiredAt = parsed.data.retired ? new Date() : null;
  }
  for (const key of [
    "defaultTeam",
    "defaultInspector",
    "defaultOffsetDays",
    "defaultDurationDays",
    "materialsNeeded",
    "qcChecklist",
    "proposerRole",
    "ordererRole",
    "receiverRole",
    "note",
  ] as const) {
    if (parsed.data[key] !== undefined) data[key] = parsed.data[key];
  }

  const updated = await prisma.standardTaskCatalog.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ row: updated });
}
