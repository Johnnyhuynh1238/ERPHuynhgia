import { NextResponse } from "next/server";
import { ProjectRoleType } from "@prisma/client";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
    const body = await req.json();
    const data: { role?: ProjectRoleType; isPrimary?: boolean } = {};
    if (body.role) data.role = body.role as ProjectRoleType;
    if (typeof body.isPrimary === "boolean") data.isPrimary = body.isPrimary;
    const assignment = await prisma.projectMemberAssignment.update({ where: { id: params.id }, data });
    return NextResponse.json({ assignment });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
    await prisma.projectMemberAssignment.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "Failed" }, { status: 500 });
  }
}
