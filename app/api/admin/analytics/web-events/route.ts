import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

type Range = "24h" | "7d" | "30d";

function parseRange(s: string | null): Range {
  if (s === "24h" || s === "7d" || s === "30d") return s;
  return "7d";
}

function rangeStart(range: Range): Date {
  const now = Date.now();
  switch (range) {
    case "24h": return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":  return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d": return new Date(now - 30 * 24 * 60 * 60 * 1000);
  }
}

function bucketUnit(range: Range): "hour" | "day" {
  return range === "24h" ? "hour" : "day";
}

export async function GET(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("range"));
  const since = rangeStart(range);
  const unit = bucketUnit(range);

  /* Counts by eventType */
  const byEvent = await prisma.webEvent.groupBy({
    by: ["eventType"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  /* Unique sessions */
  const uniqueSessions = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(DISTINCT session_id)::bigint AS c FROM web_events WHERE created_at >= $1`,
    since,
  );

  /* Timeseries pageviews per bucket */
  const timeseries = await prisma.$queryRawUnsafe<{ bucket: Date; pageviews: bigint; sessions: bigint }[]>(
    `SELECT date_trunc('${unit}', created_at) AS bucket,
            COUNT(*) FILTER (WHERE event_type = 'pageview')::bigint AS pageviews,
            COUNT(DISTINCT session_id)::bigint AS sessions
     FROM web_events
     WHERE created_at >= $1 AND page_type = 'homepage'
     GROUP BY bucket ORDER BY bucket ASC`,
    since,
  );

  /* CTA breakdown */
  const cta = await prisma.$queryRawUnsafe<{ kind: string; c: bigint }[]>(
    `SELECT COALESCE(payload->>'kind','unknown') AS kind, COUNT(*)::bigint AS c
     FROM web_events
     WHERE created_at >= $1 AND event_type = 'cta_click'
     GROUP BY kind ORDER BY c DESC`,
    since,
  );

  /* Scroll funnel — % sessions reaching each depth */
  const totalSessions = Number(uniqueSessions[0]?.c ?? BigInt(0));
  const scrollFunnel = await prisma.$queryRawUnsafe<{ depth: number; sessions: bigint }[]>(
    `SELECT (payload->>'depth')::int AS depth, COUNT(DISTINCT session_id)::bigint AS sessions
     FROM web_events
     WHERE created_at >= $1 AND event_type = 'scroll'
     GROUP BY depth ORDER BY depth ASC`,
    since,
  );

  /* Top referrers */
  const topReferrers = await prisma.$queryRawUnsafe<{ ref: string | null; c: bigint }[]>(
    `SELECT COALESCE(NULLIF(payload->>'referrer',''), 'direct') AS ref, COUNT(DISTINCT session_id)::bigint AS c
     FROM web_events
     WHERE created_at >= $1 AND event_type = 'pageview'
     GROUP BY ref ORDER BY c DESC LIMIT 10`,
    since,
  );

  /* Funnel: pageview → scroll 75 → cta_click → baogia_lead (cùng range) */
  const sessionsScroll75 = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(DISTINCT session_id)::bigint AS c
     FROM web_events
     WHERE created_at >= $1 AND event_type = 'scroll' AND (payload->>'depth')::int >= 75`,
    since,
  );
  const sessionsCta = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(DISTINCT session_id)::bigint AS c
     FROM web_events
     WHERE created_at >= $1 AND event_type = 'cta_click'`,
    since,
  );
  const sessionsQuoteSaved = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(DISTINCT session_id)::bigint AS c
     FROM web_events
     WHERE created_at >= $1 AND event_type = 'quote_saved'`,
    since,
  );
  const leadsCount = await prisma.baogiaLead.count({ where: { createdAt: { gte: since } } });

  /* Recent events */
  const recent = await prisma.webEvent.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      sessionId: true,
      pageType: true,
      eventType: true,
      payload: true,
      referer: true,
      createdAt: true,
    },
  });

  const counts: Record<string, number> = {};
  for (const r of byEvent) counts[r.eventType] = r._count._all;

  return NextResponse.json({
    ok: true,
    range,
    since: since.toISOString(),
    summary: {
      pageviews: counts.pageview ?? 0,
      sessions: totalSessions,
      ctaClicks: counts.cta_click ?? 0,
      quoteSaved: counts.quote_saved ?? 0,
      leads: leadsCount,
    },
    timeseries: timeseries.map((t) => ({
      bucket: t.bucket.toISOString(),
      pageviews: Number(t.pageviews),
      sessions: Number(t.sessions),
    })),
    cta: cta.map((c) => ({ kind: c.kind, count: Number(c.c) })),
    scrollFunnel: scrollFunnel.map((s) => ({ depth: s.depth, sessions: Number(s.sessions) })),
    topReferrers: topReferrers.map((r) => ({ ref: r.ref, sessions: Number(r.c) })),
    funnel: {
      pageviews: counts.pageview ?? 0,
      sessions: totalSessions,
      scroll75: Number(sessionsScroll75[0]?.c ?? BigInt(0)),
      cta: Number(sessionsCta[0]?.c ?? BigInt(0)),
      quoteSaved: Number(sessionsQuoteSaved[0]?.c ?? BigInt(0)),
      leads: leadsCount,
    },
    recent: recent.map((r) => ({
      id: String(r.id),
      sessionId: r.sessionId,
      pageType: r.pageType,
      eventType: r.eventType,
      payload: r.payload,
      referer: r.referer,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
