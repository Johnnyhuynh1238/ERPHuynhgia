import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// GET: trạng thái worker AI bóc KL (heartbeat do watcher host ghi mỗi phút) + số item đang chờ/bóc
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [status, requested, analyzing] = await Promise.all([
    prisma.estimateWorkerStatus.findUnique({ where: { id: 1 } }),
    prisma.estimateItem.count({ where: { status: "requested" } }),
    prisma.estimateItem.count({ where: { status: "analyzing" } }),
  ]);

  return NextResponse.json({
    state: status?.state ?? "unknown",
    busy: status?.busy ?? false,
    tail: status?.tail ?? null,
    heartbeatAgeSec: status ? Math.round((Date.now() - status.updatedAt.getTime()) / 1000) : null,
    requested,
    analyzing,
  });
}
