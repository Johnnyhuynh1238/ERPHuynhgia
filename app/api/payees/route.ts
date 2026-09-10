import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const STAFF_ROLES = new Set<string>([UserRole.admin, UserRole.accountant]);

const saveSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(20).optional().or(z.literal("").transform(() => undefined)),
  bankBin: z.string().trim().min(1).max(20),
  accountNumber: z.string().trim().min(1).max(40),
  accountName: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  note: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
});

// GET: danh bạ đối tượng nhận tiền, dùng chung toàn công ty (admin + kế toán).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  const payees = await prisma.payee.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { accountNumber: { contains: q } },
            { phone: { contains: q } },
            { accountName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {},
    orderBy: [{ name: "asc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      phone: true,
      bankBin: true,
      accountNumber: true,
      accountName: true,
      note: true,
    },
  });

  return NextResponse.json({ payees });
}

// POST: lưu/cập nhật đối tượng theo cặp (ngân hàng + số TK). Bấm "Lưu đối tượng"
// ở form Lệnh chi. Cùng cặp NH+STK = cùng một đối tượng → ghi đè tên/SĐT/tên chủ TK.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!STAFF_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const payee = await prisma.payee.upsert({
    where: { bankBin_accountNumber: { bankBin: d.bankBin, accountNumber: d.accountNumber } },
    create: {
      name: d.name,
      phone: d.phone || null,
      bankBin: d.bankBin,
      accountNumber: d.accountNumber,
      accountName: d.accountName || null,
      note: d.note || null,
      createdBy: user.id,
    },
    update: {
      name: d.name,
      phone: d.phone || null,
      accountName: d.accountName || null,
      note: d.note || null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      bankBin: true,
      accountNumber: true,
      accountName: true,
      note: true,
    },
  });

  return NextResponse.json({ payee }, { status: 201 });
}
