import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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

const PAGE_TYPES = ["homepage", "baogia", "tieuchuan", "other"] as const;
const EVENT_TYPES = ["pageview", "scroll", "engagement", "cta_click", "exit"] as const;

const eventSchema = z.object({
  sessionId: z.string().trim().min(8).max(64),
  pageType: z.enum(PAGE_TYPES),
  eventType: z.enum(EVENT_TYPES),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(20),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body không hợp lệ" }, { status: 400, headers });
  }

  const single = eventSchema.safeParse(body);
  let events: z.infer<typeof eventSchema>[];
  if (single.success) {
    events = [single.data];
  } else {
    const batch = batchSchema.safeParse(body);
    if (!batch.success) {
      return NextResponse.json({ ok: false, message: "Dữ liệu không hợp lệ" }, { status: 400, headers });
    }
    events = batch.data.events;
  }

  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const ua = request.headers.get("user-agent");
  const referer = request.headers.get("referer");

  await prisma.webEvent.createMany({
    data: events.map((e) => ({
      sessionId: e.sessionId,
      pageType: e.pageType,
      eventType: e.eventType,
      payload: (e.payload ?? {}) as object,
      ipAddress: ip,
      userAgent: ua,
      referer,
    })),
  });

  return NextResponse.json({ ok: true, count: events.length }, { status: 201, headers });
}
