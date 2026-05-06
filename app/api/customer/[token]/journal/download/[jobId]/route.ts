import { CustomerExportJobStatus, CustomerExportJobType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";
import { getObjectFromMinio } from "@/lib/minio";
import { processCustomerExportJob } from "@/lib/journal-export-worker";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function minioKey(url: string | null) {
  return url?.startsWith("minio://") ? url.slice("minio://".length) : null;
}

function filename(type: CustomerExportJobType) {
  return type === CustomerExportJobType.pdf ? "NhatKyCongTrinh.pdf" : "NhatKyCongTrinh.zip";
}

export async function GET(request: Request, { params }: { params: { token: string; jobId: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  let job = await prisma.customerExportJob.findFirst({
    where: { id: params.jobId, projectId: access.project.id },
    select: { id: true, type: true, status: true, fileUrl: true, expiresAt: true, error: true, createdAt: true, completedAt: true },
  });

  if (!job) return NextResponse.json({ message: "Job không hợp lệ" }, { status: 404 });
  if (job.status === CustomerExportJobStatus.queued) {
    await processCustomerExportJob(job.id);
    job = await prisma.customerExportJob.findFirst({
      where: { id: params.jobId, projectId: access.project.id },
      select: { id: true, type: true, status: true, fileUrl: true, expiresAt: true, error: true, createdAt: true, completedAt: true },
    });
    if (!job) return NextResponse.json({ message: "Job không hợp lệ" }, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  if (download) {
    if (job.status !== CustomerExportJobStatus.ready || !job.fileUrl) return NextResponse.json({ message: "File chưa sẵn sàng" }, { status: 409 });
    if (job.expiresAt && job.expiresAt < new Date()) return NextResponse.json({ message: "Link tải đã hết hạn" }, { status: 410 });
    const key = minioKey(job.fileUrl);
    if (!key) return NextResponse.redirect(job.fileUrl);
    const file = await getObjectFromMinio(key);
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "content-type": file.contentType || (job.type === CustomerExportJobType.pdf ? "application/pdf" : "application/zip"),
        "content-disposition": `attachment; filename="${filename(job.type)}"`,
      },
    });
  }

  return NextResponse.json({
    job,
    downloadUrl: job.status === CustomerExportJobStatus.ready ? `/api/customer/${params.token}/journal/download/${job.id}?download=1` : null,
  });
}
