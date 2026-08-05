import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { quoteSummary } from "@/lib/quote-compute";

// GET: đọc quoteData của HĐ thiết kế (bước cuối "Dự toán & Báo giá").
// PUT: ghi đè quoteData (màn bao-gia-app.html gọi khi sửa).
// Admin-only. Dùng cookie session same-origin (iframe).

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const contract = await prisma.designContract.findUnique({
    where: { id: params.id },
    select: { id: true, quoteData: true, quoteUpdatedAt: true, projectId: true },
  });
  if (!contract) return NextResponse.json({ message: "Không tìm thấy HĐ" }, { status: 404 });

  return NextResponse.json({
    quoteData: contract.quoteData ?? null,
    quoteUpdatedAt: contract.quoteUpdatedAt?.toISOString() ?? null,
    locked: contract.projectId != null, // đã chuyển HĐ thi công → khoá sửa
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON không hợp lệ" }, { status: 400 });
  }
  const quoteData = (body as { quoteData?: unknown })?.quoteData;
  if (quoteData == null || typeof quoteData !== "object") {
    return NextResponse.json({ message: "Thiếu quoteData" }, { status: 400 });
  }

  const contract = await prisma.designContract.findUnique({
    where: { id: params.id },
    select: { id: true, projectId: true },
  });
  if (!contract) return NextResponse.json({ message: "Không tìm thấy HĐ" }, { status: 404 });
  if (contract.projectId) {
    return NextResponse.json({ message: "HĐ đã chuyển thi công, không sửa báo giá" }, { status: 409 });
  }

  const updated = await prisma.designContract.update({
    where: { id: params.id },
    data: {
      quoteData: quoteData as Prisma.InputJsonValue,
      quoteUpdatedAt: new Date(),
    },
    select: { quoteUpdatedAt: true },
  });

  const sum = quoteSummary(quoteData);
  return NextResponse.json({
    ok: true,
    quoteUpdatedAt: updated.quoteUpdatedAt?.toISOString() ?? null,
    grand: sum.grand,
  });
}
