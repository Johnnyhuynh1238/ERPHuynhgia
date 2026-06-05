import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";

const ALLOWED_ORIGINS = new Set([
  "https://huynhgia6.com",
  "https://www.huynhgia6.com",
]);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://huynhgia6.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

const payloadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(20),
  sessionId: z.string().trim().max(64).optional(),
  feeTotal: z.number().int().nonnegative().optional(),
  // Snapshot from baogia: wizard answers, budget, screens visited, time spent...
  payload: z.record(z.string(), z.unknown()).optional(),
});

const RATE_LIMIT_MS = 60_000; // 1 lead per phone per 60s

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body không hợp lệ" }, { status: 400, headers });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() },
      { status: 400, headers },
    );
  }

  const { name, phone, sessionId, feeTotal, payload } = parsed.data;
  const phoneNorm = phone.replace(/\s+/g, "");

  // Cheap rate-limit: same phone within 60s → reject (avoid duplicate clicks / bots)
  const recent = await prisma.baogiaLead.findFirst({
    where: { phone: phoneNorm, createdAt: { gte: new Date(Date.now() - RATE_LIMIT_MS) } },
    select: { id: true },
  });
  if (recent) {
    return NextResponse.json({ ok: true, id: recent.id, duplicate: true }, { status: 200, headers });
  }

  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const ua = request.headers.get("user-agent");
  const referer = request.headers.get("referer");

  const lead = await prisma.baogiaLead.create({
    data: {
      name: name.trim(),
      phone: phoneNorm,
      source: "baogia_web",
      sessionId: sessionId ?? null,
      ipAddress: ip,
      userAgent: ua,
      referer,
      feeTotal: feeTotal ?? null,
      payload: (payload ?? {}) as object,
    },
    select: { id: true, name: true, phone: true, feeTotal: true, createdAt: true },
  });

  // Fire-and-forget: notify all admins + push bell
  notifyAdmins(lead).catch((err) => console.error("[baogia-lead] notify failed:", err));

  return NextResponse.json({ ok: true, id: lead.id }, { status: 201, headers });
}

async function notifyAdmins(lead: { id: string; name: string; phone: string; feeTotal: number | null }) {
  const admins = await prisma.user.findMany({
    where: { role: "admin", isActive: true },
    select: { id: true },
  });
  if (!admins.length) return;

  const feeLabel = lead.feeTotal ? ` · phí TK ${formatVnd(lead.feeTotal)}` : "";
  const title = `Lead báo giá mới: ${lead.name}`;
  const body = `${lead.phone}${feeLabel}`;
  // Trỏ về danh sách + auto-mở drawer chi tiết qua ?lead=<id>; tránh phải tạo
  // route /leads/[id] vì UI đã dùng drawer trên cùng trang.
  const link = `/leads?lead=${lead.id}`;

  await prisma.staffNotification.createMany({
    data: admins.map((a) => ({
      recipientId: a.id,
      kind: "baogia_lead" as const,
      title,
      body,
      link,
      refType: "baogia_lead",
      refId: lead.id,
    })),
  });

  await Promise.all(
    admins.map(async (a) => {
      const badgeCount = await prisma.staffNotification.count({ where: { recipientId: a.id, isRead: false } });
      try {
        await sendPushToUser(a.id, {
          title,
          body,
          url: link,
          tag: `baogia-lead-${lead.id}`,
          requireInteraction: true,
          badgeCount,
        });
      } catch (err) {
        console.error("[baogia-lead] push failed", a.id, err);
      }
    }),
  );
}

function formatVnd(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}
