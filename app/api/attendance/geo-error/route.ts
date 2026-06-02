import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const ALLOWED_KINDS = new Set(["denied", "unavailable", "timeout", "unsupported"]);
const ALLOWED_ACTIONS = new Set(["in", "out"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return new NextResponse(null, { status: 204 });

  try {
    const body = (await request.json().catch(() => null)) as
      | { kind?: unknown; action?: unknown }
      | null;
    const kind = typeof body?.kind === "string" ? body.kind : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!ALLOWED_KINDS.has(kind)) return new NextResponse(null, { status: 204 });

    const ua = request.headers.get("user-agent")?.slice(0, 500) || null;

    await prisma.ksGeoErrorLog.create({
      data: {
        userId: user.id,
        kind,
        action: ALLOWED_ACTIONS.has(action) ? action : null,
        userAgent: ua,
      },
    });
  } catch {
    // best-effort; never throw
  }

  return new NextResponse(null, { status: 204 });
}
