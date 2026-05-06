import { NextResponse } from "next/server";
import { buildCustomerJournalEvents, requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const { searchParams } = new URL(request.url);
  const events = await buildCustomerJournalEvents(access.project.id, {
    phase: searchParams.get("phase"),
    type: searchParams.get("type"),
  });

  return NextResponse.json({ events });
}
