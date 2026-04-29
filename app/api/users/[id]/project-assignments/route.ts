import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.id !== params.id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const assignments = await prisma.projectMemberAssignment.findMany({
      where: { userId: params.id },
      include: { project: { select: { id: true, code: true, name: true } } },
      orderBy: { assignedAt: "desc" },
    });
    return NextResponse.json({ assignments });
  } catch {
    return NextResponse.json({ message: "Failed" }, { status: 500 });
  }
}
