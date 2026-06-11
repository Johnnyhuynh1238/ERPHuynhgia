import { NextResponse } from "next/server";
import { logAdminAudit } from "@/lib/admin-audit-log";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const HOUR_MS = 3_600_000;
const HOURLY_LIMIT = 60;
const bucket = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string): boolean {
  const now = Date.now();
  const ex = bucket.get(key);
  if (!ex || now > ex.resetAt) {
    bucket.set(key, { count: 1, resetAt: now + HOUR_MS });
    return true;
  }
  if (ex.count >= HOURLY_LIMIT) return false;
  ex.count++;
  return true;
}

export async function POST(req: Request) {
  const token = process.env.INBOX_API_TOKEN;
  if (!token) {
    return NextResponse.json({ message: "Server chưa cấu hình INBOX_API_TOKEN" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (provided !== token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`inbox-${ip}`)) {
    return NextResponse.json({ message: "Too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const content = (body?.content || "").toString().trim();
  if (!content) return NextResponse.json({ message: "Nội dung rỗng" }, { status: 400 });
  if (content.length > 500) return NextResponse.json({ message: "Quá 500 ký tự" }, { status: 400 });
  const item = await prisma.inboxItem.create({
    data: { content, source: "openclaw" },
  });
  await logAdminAudit(prisma, {
    actorId: null,
    entity: "inbox_item",
    entityId: item.id,
    action: "create",
    summary: `OpenClaw đẩy inbox: ${content.slice(0, 120)}`,
    metadata: { source: "openclaw", ip },
  });
  return NextResponse.json({ id: item.id, content: item.content, createdAt: item.createdAt }, { status: 201 });
}
