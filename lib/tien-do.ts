import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSchedule, queueTienDoSync, type ProjectSched } from "@/lib/tien-do-thuc-te";
import { computeEstimateProgress, type EstimateProgress } from "@/lib/estimate-progress";

// Báo cáo tiến độ — logic dùng chung cho 2 lối vào:
//  - /api/projects/[id]/tien-do (đăng nhập ERP: admin, KS, QL)
//  - /ks-td/[code]/api (link ngày "Việc của tôi" gửi Zalo, KS không đăng nhập — sếp 09/11/2026)
// Lối vào tự xác định user + quyền dự án rồi gọi các hàm dưới.

// KS: thay ngân sách bằng tỉ trọng (tổng = 1.000.000) để client vẫn tính % tổng, bỏ "đã mua".
export function maskMoney(prog: EstimateProgress) {
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

// GET: danh sách hạng mục + khối lượng con + tổng tiến độ. Chỉ admin thấy tiền.
export async function tienDoGet(projectId: string, isAdmin: boolean) {
  const [prog, sched] = await Promise.all([computeEstimateProgress(projectId), computeSchedule(projectId)]);
  const schedule = schedView(sched);
  return NextResponse.json(isAdmin ? { ...prog, hideMoney: false, schedule } : { ...maskMoney(prog), schedule });
}

// Tiến độ thực tế (ngày kế hoạch + dự báo từng công tác/PHẦN) — không có tiền, KS xem được.
export type ScheduleView = ReturnType<typeof schedView>;
function schedView(s: ProjectSched) {
  return {
    today: s.today,
    hasPlan: s.hasPlan,
    slip: s.slip,
    actualPct: s.actualPct,
    plannedPct: s.plannedPct,
    planFinish: s.planFinish,
    forecastFinish: s.forecastFinish,
    works: Object.fromEntries(
      s.works.map((w) => [w.id, { own: w.own, planStart: w.planStart, planEnd: w.planEnd, fStart: w.fStart, fEnd: w.fEnd }]),
    ),
    sections: Object.fromEntries(
      s.sections.map((x) => [x.id, { planStart: x.planStart, planEnd: x.planEnd, fStart: x.fStart, fEnd: x.fEnd }]),
    ),
  };
}

// PATCH: mark done (1 chiều — đã xong không mở lại). Body { refType:'work'|'line'|'section', refId, done:true }.
//  - work    = 1 khối lượng (estimate_works) — cách báo tiến độ chính.
//  - line/section = cả hạng mục, CHỈ khi hạng mục đó không có khối lượng con.
//  Không còn kéo % tay: % hạng mục tự tính từ khối lượng đã xong.
export async function tienDoPatch(req: Request, projectId: string, userId: string) {
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
      where: { id: refId, projectId },
      select: { id: true },
    });
    if (!w) return NextResponse.json({ message: "Không thấy khối lượng" }, { status: 404 });
  } else {
    // Cả hạng mục: phải là dòng đang hiện ở màn + KHÔNG có khối lượng con (khớp đúng UI).
    const prog = await computeEstimateProgress(projectId);
    const t = prog.tasks.find((x) => x.refType === refType && x.refId === refId);
    if (!t) return NextResponse.json({ message: "Không thấy hạng mục" }, { status: 404 });
    if (t.works.length > 0) {
      return NextResponse.json({ message: "Hạng mục có khối lượng — đánh dấu từng khối lượng" }, { status: 400 });
    }
  }

  const key = { projectId_refType_refId: { projectId, refType, refId } };
  const percent = done ? 100 : 0;
  const existed = await prisma.estimateTaskProgress.findUnique({ where: key, select: { done: true } });
  if (existed?.done) return NextResponse.json({ ok: true });
  await prisma.estimateTaskProgress.upsert({
    where: key,
    create: { projectId, refType, refId, percent, done, updatedBy: userId },
    update: { percent, done, updatedBy: userId },
  });

  // KS tick → tính lại tiến độ thực tế → ngày đợt chi/thu + dự báo dòng tiền (chạy nền, gom tick liền nhau).
  queueTienDoSync(projectId);
  return NextResponse.json({ ok: true });
}
