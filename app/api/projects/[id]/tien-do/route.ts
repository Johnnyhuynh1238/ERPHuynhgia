import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { computeEstimateProgress } from "@/lib/estimate-progress";

export const runtime = "nodejs";

// GET: danh sách công tác dự toán + tiến độ + tổng earned value.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không thấy dự án" }, { status: 404 });

  const prog = await computeEstimateProgress(params.id);
  return NextResponse.json(prog);
}

// PATCH: cập nhật 1 công tác. Body { refType:'catalog'|'khoan', refId, percent?, done? }.
//  - done=true → percent=100. percent<100 → done=false. percent>0 & done chưa set → giữ done cũ nếu 100.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    refType?: string;
    refId?: string;
    percent?: number;
    done?: boolean;
  };
  const refType = body.refType === "khoan" ? "khoan" : body.refType === "catalog" ? "catalog" : null;
  const refId = typeof body.refId === "string" ? body.refId.trim() : "";
  if (!refType || !refId) {
    return NextResponse.json({ message: "Thiếu công tác" }, { status: 400 });
  }

  let percent: number | undefined;
  let done: boolean | undefined;
  if (typeof body.done === "boolean") {
    done = body.done;
    if (done) percent = 100;
  }
  if (typeof body.percent === "number" && !Number.isNaN(body.percent)) {
    percent = Math.max(0, Math.min(100, Math.round(body.percent)));
    done = percent >= 100 ? (done ?? false) : false;
  }
  if (percent === undefined && done === undefined) {
    return NextResponse.json({ message: "Không có gì để cập nhật" }, { status: 400 });
  }

  const key = { projectId_refType_refId: { projectId: params.id, refType, refId } };
  await prisma.estimateTaskProgress.upsert({
    where: key,
    create: {
      projectId: params.id,
      refType,
      refId,
      percent: percent ?? 0,
      done: done ?? false,
      updatedBy: user!.id,
    },
    update: {
      ...(percent !== undefined ? { percent } : {}),
      ...(done !== undefined ? { done } : {}),
      updatedBy: user!.id,
    },
  });

  // Trả tổng mới để client cập nhật thanh tổng.
  const prog = await computeEstimateProgress(params.id);
  return NextResponse.json({ ok: true, earnedPct: prog.earnedPct, totalAmount: prog.totalAmount });
}
