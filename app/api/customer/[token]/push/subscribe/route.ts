import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const body = await request.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { endpoint, p256dh, auth, userAgent } = parsed.data;

  await prisma.customerPushSubscription.upsert({
    where: { endpoint },
    update: {
      projectId: access.project.id,
      p256dh,
      auth,
      userAgent: userAgent ?? null,
      lastSeen: new Date(),
    },
    create: {
      projectId: access.project.id,
      endpoint,
      p256dh,
      auth,
      userAgent: userAgent ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const body = await request.json().catch(() => null);
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  await prisma.customerPushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, projectId: access.project.id },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const count = await prisma.customerPushSubscription.count({
    where: { projectId: access.project.id },
  });
  return NextResponse.json({ count, enabled: count > 0, vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null });
}
