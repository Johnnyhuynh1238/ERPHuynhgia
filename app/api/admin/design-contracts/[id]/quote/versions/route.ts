import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { quoteSummary } from "@/lib/quote-compute";

// GET: danh sách phiên bản báo giá (metadata). POST: chốt 1 snapshot từ quoteData hiện tại.
// Dedupe: nếu bản mới trùng bản gần nhất thì bỏ qua.

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const versions = await prisma.designContractQuoteVersion.findMany({
    where: { contractId: params.id },
    orderBy: { seq: "desc" },
    select: { id: true, seq: true, grand: true, note: true, createdAt: true },
  });

  return NextResponse.json(
    versions.map((v) => ({
      id: v.id,
      seq: v.seq,
      grand: v.grand != null ? Number(v.grand) : null,
      note: v.note,
      createdAt: v.createdAt.toISOString(),
    })),
  );
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  let note: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.note === "string") note = body.note.trim() || null;
  } catch {
    /* body optional */
  }

  const contract = await prisma.designContract.findUnique({
    where: { id: params.id },
    select: { id: true, quoteData: true },
  });
  if (!contract) return NextResponse.json({ message: "Không tìm thấy HĐ" }, { status: 404 });
  if (contract.quoteData == null) {
    return NextResponse.json({ message: "Chưa có báo giá để lưu phiên bản" }, { status: 400 });
  }

  const last = await prisma.designContractQuoteVersion.findFirst({
    where: { contractId: params.id },
    orderBy: { seq: "desc" },
    select: { seq: true, data: true },
  });

  // Dedupe: không tạo bản trùng bản gần nhất.
  if (last && JSON.stringify(last.data) === JSON.stringify(contract.quoteData)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const grand = quoteSummary(contract.quoteData).grand;
  const version = await prisma.designContractQuoteVersion.create({
    data: {
      contractId: params.id,
      seq: (last?.seq ?? 0) + 1,
      data: contract.quoteData as Prisma.InputJsonValue,
      grand: BigInt(Math.round(grand)),
      note,
      createdById: user.id,
    },
    select: { id: true, seq: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    id: version.id,
    seq: version.seq,
    grand,
    createdAt: version.createdAt.toISOString(),
  });
}
