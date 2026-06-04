import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canEditWorkerWage } from "@/lib/worker-attendance-summary";

export async function PATCH(
  request: Request,
  { params }: { params: { workerId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canEditWorkerWage(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const raw = (body as { dailyRate?: unknown }).dailyRate;
  let dailyRate: number | null = null;
  if (raw === null || raw === "" || raw === undefined) {
    dailyRate = null;
  } else {
    const n = typeof raw === "string" ? Number(raw.replace(/[^\d]/g, "")) : Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 50_000_000) {
      return NextResponse.json({ message: "Lương ngày không hợp lệ" }, { status: 400 });
    }
    dailyRate = Math.round(n);
  }

  const worker = await prisma.worker.findUnique({
    where: { id: params.workerId },
    select: { id: true },
  });
  if (!worker) {
    return NextResponse.json({ message: "Không tìm thấy thợ" }, { status: 404 });
  }

  const updated = await prisma.worker.update({
    where: { id: params.workerId },
    data: { dailyRate },
    select: { id: true, dailyRate: true },
  });

  return NextResponse.json({ ok: true, worker: updated });
}
