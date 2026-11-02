import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { computeEstimateProgress, type EstimateProgress } from "@/lib/estimate-progress";

export const runtime = "nodejs";

// Báo cáo tiến độ: admin + KS/QL được giao dự án. KS KHÔNG thấy tiền → ẩn số tiền.
const ALLOWED = new Set(["admin", "engineer", "construction_manager"]);

async function requireTienDo(projectId: string) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return { user: null, error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  }
  if (!ALLOWED.has(user.role)) {
    return { user: null, error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return { user: null, error: NextResponse.json({ message: "Không thấy dự án" }, { status: 404 }) };
  return { user, error: null };
}

// KS: thay ngân sách bằng tỉ trọng (tổng = 1.000.000) để client vẫn tính % tổng, bỏ "đã mua".
function maskMoney(prog: EstimateProgress) {
  const tot = prog.totalAmount;
  return {
    ...prog,
    hideMoney: true,
    totalAmount: 0,
    tasks: prog.tasks.map((t) => ({
      ...t,
      amount: tot > 0 ? Math.round((t.amount / tot) * 1_000_000) : 0,
      bought: 0,
    })),
  };
}

// GET: danh sách hạng mục + khối lượng con + tổng tiến độ.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireTienDo(params.id);
  if (error) return error;

  const prog = await computeEstimateProgress(params.id);
  return NextResponse.json(user!.role === "admin" ? { ...prog, hideMoney: false } : maskMoney(prog));
}

// PATCH: mark done (1 chiều — đã xong không mở lại). Body { refType:'work'|'line'|'section', refId, done:true }.
//  - work    = 1 khối lượng (estimate_works) — cách báo tiến độ chính.
//  - line/section = cả hạng mục, CHỈ khi hạng mục đó không có khối lượng con.
//  Không còn kéo % tay: % hạng mục tự tính từ khối lượng đã xong.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireTienDo(params.id);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    refType?: string;
    refId?: string;
    done?: boolean;
  };
  const refType =
    body.refType === "work" || body.refType === "line" || body.refType === "section" ? body.refType : null;
  const refId = typeof body.refId === "string" ? body.refId.trim() : "";
  if (!refType || !/^[0-9a-f-]{36}$/i.test(refId)) {
    return NextResponse.json({ message: "Thiếu khối lượng" }, { status: 400 });
  }
  if (typeof body.done !== "boolean") {
    return NextResponse.json({ message: "Thiếu trạng thái xong" }, { status: 400 });
  }
  const done = body.done;
  // Đã tick xong là KHOÁ — không mở lại (sếp chốt 02/11/2026).
  if (!done) {
    return NextResponse.json({ message: "Đã xong thì không mở lại được" }, { status: 409 });
  }

  // refId phải thuộc dự án.
  if (refType === "work") {
    const w = await prisma.estimateWork.findFirst({
      where: { id: refId, projectId: params.id },
      select: { id: true },
    });
    if (!w) return NextResponse.json({ message: "Không thấy khối lượng" }, { status: 404 });
  } else {
    // Cả hạng mục: phải là dòng đang hiện ở màn + KHÔNG có khối lượng con (khớp đúng UI).
    const prog = await computeEstimateProgress(params.id);
    const t = prog.tasks.find((x) => x.refType === refType && x.refId === refId);
    if (!t) return NextResponse.json({ message: "Không thấy hạng mục" }, { status: 404 });
    if (t.works.length > 0) {
      return NextResponse.json({ message: "Hạng mục có khối lượng — đánh dấu từng khối lượng" }, { status: 400 });
    }
  }

  const key = { projectId_refType_refId: { projectId: params.id, refType, refId } };
  const percent = done ? 100 : 0;
  const existed = await prisma.estimateTaskProgress.findUnique({ where: key, select: { done: true } });
  if (existed?.done) return NextResponse.json({ ok: true });
  await prisma.estimateTaskProgress.upsert({
    where: key,
    create: { projectId: params.id, refType, refId, percent, done, updatedBy: user!.id },
    update: { percent, done, updatedBy: user!.id },
  });

  return NextResponse.json({ ok: true });
}
