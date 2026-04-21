import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

const passwordRule = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const createUserSchema = z.object({
  fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự"),
  email: z.string().trim().email("Email không hợp lệ"),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  role: z.nativeEnum(UserRole),
  tempPassword: z.string().regex(passwordRule, "Mật khẩu tạm chưa đủ mạnh"),
});

function parseRole(value: string | null): UserRole | "all" {
  if (!value || value === "all") return "all";
  if (Object.values(UserRole).includes(value as UserRole)) return value as UserRole;
  return "all";
}

function parseStatus(value: string | null): "all" | "active" | "inactive" {
  if (!value || value === "all") return "all";
  if (value === "active" || value === "inactive") return value;
  return "all";
}

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

export async function GET(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);

  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = 10;
  const search = (searchParams.get("search") || "").trim();
  const role = parseRole(searchParams.get("role"));
  const status = parseStatus(searchParams.get("status"));

  const where = {
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(role !== "all" ? { role } : {}),
    ...(status !== "all" ? { isActive: status === "active" } : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    users,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function POST(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  const existed = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existed) {
    return NextResponse.json({ message: "Email đã tồn tại" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      fullName: parsed.data.fullName,
      email,
      phone: parsed.data.phone || null,
      role: parsed.data.role,
      passwordHash,
      isActive: true,
      mustChangePassword: true,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
      phone: true,
      mustChangePassword: true,
    },
  });

  return NextResponse.json({ user, tempPassword: parsed.data.tempPassword });
}
