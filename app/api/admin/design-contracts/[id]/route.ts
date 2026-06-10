import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { serializeDesignContract } from "@/lib/design-contract-serialize";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const contract = await prisma.designContract.findUnique({
    where: { id: params.id },
    include: { steps: true },
  });
  if (!contract) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(serializeDesignContract(contract));
}
