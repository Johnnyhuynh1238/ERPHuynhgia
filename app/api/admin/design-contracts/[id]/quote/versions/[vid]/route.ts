import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// GET: dữ liệu đầy đủ 1 phiên bản (để xem lại / khôi phục).
export async function GET(
  _request: Request,
  { params }: { params: { id: string; vid: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const v = await prisma.designContractQuoteVersion.findUnique({
    where: { id: params.vid },
    select: { id: true, seq: true, contractId: true, data: true, grand: true, createdAt: true },
  });
  if (!v || v.contractId !== params.id) {
    return NextResponse.json({ message: "Không tìm thấy phiên bản" }, { status: 404 });
  }

  return NextResponse.json({
    id: v.id,
    seq: v.seq,
    data: v.data,
    grand: v.grand != null ? Number(v.grand) : null,
    createdAt: v.createdAt.toISOString(),
  });
}
