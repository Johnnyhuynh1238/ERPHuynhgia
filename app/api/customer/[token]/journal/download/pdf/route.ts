import { CustomerExportJobType } from "@prisma/client";
import { NextResponse } from "next/server";
import { processCustomerExportJob } from "@/lib/journal-export-worker";
import { prisma } from "@/lib/prisma";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const job = await prisma.customerExportJob.create({
    data: { projectId: access.project.id, type: CustomerExportJobType.pdf },
    select: { id: true, status: true, type: true, createdAt: true },
  });

  void processCustomerExportJob(job.id);

  return NextResponse.json({ job, etaSeconds: 180, pollUrl: `/api/customer/${params.token}/journal/download/${job.id}` }, { status: 202 });
}
