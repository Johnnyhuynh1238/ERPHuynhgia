import { NextResponse } from "next/server";
import { BaogiaLeadStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const updateSchema = z
  .object({
    status: z.nativeEnum(BaogiaLeadStatus).optional(),
    adminNotes: z.string().max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Không có dữ liệu cập nhật" });

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.id) return { error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  if (user.role !== "admin") return { error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };
  return { user };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const lead = await prisma.baogiaLead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });
  }

  const data: { status?: BaogiaLeadStatus; adminNotes?: string; contactedAt?: Date } = {};
  if (parsed.data.status) {
    data.status = parsed.data.status;
    if (parsed.data.status === "contacted") data.contactedAt = new Date();
  }
  if (parsed.data.adminNotes !== undefined) data.adminNotes = parsed.data.adminNotes;

  const lead = await prisma.baogiaLead.update({ where: { id: params.id }, data });
  return NextResponse.json({ lead });
}
