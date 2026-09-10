import { NextResponse } from "next/server";
import { BudgetPlanGroup } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

type Body = {
  name?: string;
  kind?: BudgetPlanGroup;
  sortOrder?: number;
  planStart?: string | null;
  planEnd?: string | null;
};

// "YYYY-MM-DD" → Date (UTC) hợp lệ, sai định dạng → undefined (bỏ qua)
const parseDate = (v: string | null | undefined): Date | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(v + "T00:00:00Z") : undefined;
};

// PATCH: đổi tên / loại / thứ tự 1 PHẦN
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; sectionId: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const b = (await req.json().catch(() => ({}))) as Body;
  const data: {
    name?: string;
    kind?: BudgetPlanGroup;
    sortOrder?: number;
    planStart?: Date | null;
    planEnd?: Date | null;
  } = {};
  if (b.name != null) {
    const name = b.name.trim();
    if (!name) return NextResponse.json({ message: "Tên phần không được rỗng" }, { status: 400 });
    data.name = name;
  }
  if (b.kind != null) {
    if (!Object.values(BudgetPlanGroup).includes(b.kind))
      return NextResponse.json({ message: "Loại phần không hợp lệ" }, { status: 400 });
    data.kind = b.kind;
  }
  if (b.sortOrder != null && Number.isFinite(b.sortOrder)) data.sortOrder = Math.round(b.sortOrder);
  const ps = parseDate(b.planStart);
  if (ps !== undefined) data.planStart = ps;
  const pe = parseDate(b.planEnd);
  if (pe !== undefined) data.planEnd = pe;

  const res = await prisma.projectSection.updateMany({
    where: { id: params.sectionId, projectId: params.id },
    data,
  });
  if (res.count === 0) return NextResponse.json({ message: "Không tìm thấy phần" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE: xoá PHẦN (VT thuộc phần → section_id = NULL, không mất VT).
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; sectionId: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const res = await prisma.projectSection.deleteMany({
    where: { id: params.sectionId, projectId: params.id },
  });
  if (res.count === 0) return NextResponse.json({ message: "Không tìm thấy phần" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
