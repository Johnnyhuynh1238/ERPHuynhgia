import { CustomerExportJobType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { processCustomerExportJob } from "@/lib/journal-export-worker";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) return NextResponse.redirect(new URL(`/cn/${params.token}`, request.url));

  const job = await prisma.customerExportJob.create({
    data: { projectId: project.id, type: CustomerExportJobType.pdf },
    select: { id: true },
  });

  void processCustomerExportJob(job.id);
  return NextResponse.redirect(new URL(`/api/customer/${params.token}/journal/download/${job.id}`, request.url));
}
