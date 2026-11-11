import { BudgetPlanStatus, PaymentStatus, SubPaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncPaymentLateStatus } from "@/lib/payment-schedule-status";

// TIẾN ĐỘ THỰC TẾ — tiến độ là GỐC của mọi ngày (sếp 11/11/2026):
//  - Mỗi công tác (estimate_works) có ngày kế hoạch riêng (Kỹ sư Dự toán đặt). Công tác chưa có ngày → máy rải
//    trong ngày PHẦN theo thứ tự + tỉ trọng tiền khoán NC (đúng luật % dự kiến của màn Tiến độ).
//  - Mỗi lần KS tick → tính lại: % thực tế (tỉ trọng công tác đã xong) so với đường % kế hoạch → "đang chậm/nhanh
//    N ngày" (earned schedule: ngày mà kế hoạch đạt đúng % thực tế hôm nay). Công tác chưa xong dời theo N ngày,
//    không sớm hơn hôm nay; công tác xong lấy ngày KS tick thật.
//  - Ngày dự báo đó ghi xuống đợt thầu phụ + đợt thu đã gắn công tác (khoá sửa tay), và lập lại dự báo vật tư
//    kế hoạch dòng tiền dự án (giữ ngày sếp sửa tay).

const DAY = 86_400_000;
const vnDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
const isoDb = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const add = (s: string, k: number) => new Date(Date.parse(`${s}T00:00:00Z`) + k * DAY).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const maxS = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
const minS = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const toDb = (s: string) => new Date(`${s}T00:00:00Z`);

export type WorkSched = {
  id: string;
  sectionId: string | null;
  name: string;
  value: number; // tiền khoán NC (qty × đơn giá)
  own: boolean; // true = ngày riêng do Dự toán đặt; false = máy rải theo PHẦN
  planStart: string | null;
  planEnd: string | null;
  done: boolean;
  doneAt: string | null; // ngày KS tick (giờ VN)
  fStart: string | null; // dự báo theo tiến độ thực tế
  fEnd: string | null;
};

export type SectionSched = {
  id: string;
  name: string;
  planStart: string | null;
  planEnd: string | null;
  fStart: string | null;
  fEnd: string | null;
  works: number;
  doneWorks: number;
};

export type ProjectSched = {
  projectId: string;
  today: string;
  hasPlan: boolean;
  slip: number; // số ngày CHẬM (+) / NHANH (−) so kế hoạch
  actualPct: number; // 0..100
  plannedPct: number; // 0..100 kế hoạch tới hôm nay
  planFinish: string | null;
  forecastFinish: string | null;
  works: WorkSched[];
  sections: SectionSched[];
};

/** Rải công tác chưa có ngày riêng trong khoảng ngày PHẦN: nối tiếp theo thứ tự, mỗi công tác chiếm tỉ trọng tiền. */
function spread(start: string, end: string, items: { value: number }[]): { s: string; e: string }[] {
  const n = Math.max(1, diff(start, end) + 1);
  const byValue = items.length > 0 && items.every((x) => x.value > 0);
  const tot = items.reduce((t, x) => t + (byValue ? x.value : 1), 0);
  let cum = 0;
  return items.map((x) => {
    const a = tot > 0 ? cum / tot : 0;
    cum += byValue ? x.value : 1;
    const b = tot > 0 ? cum / tot : 1;
    const s = add(start, Math.min(n - 1, Math.floor(a * n)));
    const e = add(start, Math.max(0, Math.round(b * n) - 1));
    return { s, e: e < s ? s : e };
  });
}

export async function computeSchedule(projectId: string, todayArg?: string): Promise<ProjectSched> {
  const today = todayArg ?? vnDay(new Date());
  const [sections, works, prog] = await Promise.all([
    prisma.projectSection.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, kind: true, planStart: true, planEnd: true },
    }),
    prisma.estimateWork.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, sectionId: true, name: true, quantity: true, laborPrice: true, planStart: true, planEnd: true },
    }),
    prisma.estimateTaskProgress.findMany({
      where: { projectId, refType: "work", done: true },
      select: { refId: true, updatedAt: true },
    }),
  ]);
  const doneAt = new Map(prog.map((p) => [p.refId, vnDay(p.updatedAt)]));
  const secById = new Map(sections.map((s) => [s.id, s]));

  const ws: WorkSched[] = works.map((w) => {
    const own = !!(w.planStart && w.planEnd);
    return {
      id: w.id,
      sectionId: w.sectionId,
      name: w.name,
      value: Number(w.quantity) * Number(w.laborPrice),
      own,
      planStart: own ? isoDb(w.planStart) : null,
      planEnd: own ? maxS(isoDb(w.planEnd), isoDb(w.planStart)) : null,
      done: doneAt.has(w.id),
      doneAt: doneAt.get(w.id) ?? null,
      fStart: null,
      fEnd: null,
    };
  });

  // Công tác chưa có ngày riêng → rải trong PHẦN.
  const bySec = new Map<string, WorkSched[]>();
  for (const w of ws) {
    if (w.own || !w.sectionId) continue;
    const arr = bySec.get(w.sectionId);
    if (arr) arr.push(w);
    else bySec.set(w.sectionId, [w]);
  }
  for (const [sid, arr] of Array.from(bySec.entries())) {
    const sec = secById.get(sid);
    const s = isoDb(sec?.planStart);
    const e = isoDb(sec?.planEnd);
    if (!s || !e) continue;
    spread(s, maxS(e, s)!, arr).forEach((r, i) => {
      arr[i].planStart = r.s;
      arr[i].planEnd = r.e;
    });
  }

  // Earned schedule trên các công tác có ngày. Công tác chưa có giá (NCC lắp…) lấy giá trung bình để vẫn có trọng số.
  const planned = ws.filter((w) => w.planStart && w.planEnd);
  const nz = planned.filter((w) => w.value > 0);
  const avg = nz.length ? nz.reduce((t, w) => t + w.value, 0) / nz.length : 1;
  const wt = (w: WorkSched) => (w.value > 0 ? w.value : avg);
  const W = planned.reduce((t, w) => t + wt(w), 0);
  const plannedAt = (t: string) =>
    W > 0
      ? planned.reduce((acc, w) => {
          const dur = diff(w.planStart!, w.planEnd!) + 1;
          const f = Math.max(0, Math.min(1, (diff(w.planStart!, t) + 1) / dur));
          return acc + wt(w) * f;
        }, 0) / W
      : 0;
  const actual = W > 0 ? planned.reduce((t, w) => t + (w.done ? wt(w) : 0), 0) / W : 0;
  let slip = 0;
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const w of planned) {
    minStart = minS(minStart, w.planStart);
    maxEnd = maxS(maxEnd, w.planEnd);
  }
  if (W > 0 && minStart && maxEnd) {
    if (actual <= 1e-9) {
      // Chưa xong gì: chậm từ ngày lẽ ra phải xong việc đầu tiên.
      slip = today >= minStart ? Math.max(0, diff(minStart, today) + 1) : 0;
      if (plannedAt(today) <= 1e-9) slip = 0;
    } else {
      let es = add(minStart, -1);
      for (let t = minStart; t <= maxEnd; t = add(t, 1)) {
        es = t;
        if (plannedAt(t) >= actual - 1e-9) break;
      }
      slip = diff(es, today);
    }
  }

  // Dự báo từng công tác.
  for (const w of ws) {
    if (w.done) {
      w.fStart = minS(w.planStart, w.doneAt);
      w.fEnd = w.doneAt;
      continue;
    }
    if (!w.planStart || !w.planEnd) continue;
    const e = maxS(add(w.planEnd, slip), today)!;
    w.fEnd = e;
    w.fStart = minS(add(w.planStart, slip), e);
  }

  const secOut: SectionSched[] = sections.map((s) => {
    const mine = ws.filter((w) => w.sectionId === s.id);
    let ps = isoDb(s.planStart);
    let pe = isoDb(s.planEnd);
    let fs: string | null = null;
    let fe: string | null = null;
    if (mine.some((w) => w.fEnd)) {
      for (const w of mine) {
        ps = minS(ps, w.planStart);
        pe = maxS(pe, w.planEnd);
        fs = minS(fs, w.fStart);
        fe = maxS(fe, w.fEnd);
      }
    } else if (ps && pe) {
      // PHẦN không có công tác: đã qua → giữ; chưa qua → dời theo độ chậm chung.
      if (pe < today) {
        fs = ps;
        fe = pe;
      } else {
        fe = maxS(add(pe, slip), today);
        fs = minS(add(ps, slip), fe);
      }
    }
    return { id: s.id, name: s.name, planStart: ps, planEnd: pe, fStart: fs, fEnd: fe, works: mine.length, doneWorks: mine.filter((w) => w.done).length };
  });

  let planFinish: string | null = null;
  let forecastFinish: string | null = null;
  for (const s of secOut) {
    planFinish = maxS(planFinish, s.planEnd);
    forecastFinish = maxS(forecastFinish, s.fEnd);
  }

  return {
    projectId,
    today,
    hasPlan: W > 0,
    slip,
    actualPct: Math.round(actual * 100),
    plannedPct: Math.round(plannedAt(today) * 100),
    planFinish,
    forecastFinish,
    works: ws,
    sections: secOut,
  };
}

type Range = { planStart: Date | null; planEnd: Date | null };
/** Đổi ngày PHẦN: ngày riêng của công tác trong PHẦN dời + co giãn cùng tỉ lệ (giữ trình tự Dự toán đã xếp). */
export async function rescaleWorkDates(sectionId: string, from: Range, to: Range) {
  const os = isoDb(from.planStart);
  const oe = isoDb(from.planEnd);
  const ns = isoDb(to.planStart);
  const ne = isoDb(to.planEnd);
  if (!os || !oe || !ns || !ne || (os === ns && oe === ne)) return;
  const od = Math.max(1, diff(os, oe) + 1);
  const nd = Math.max(1, diff(ns, ne) + 1);
  const map = (d: string) => add(ns, Math.max(0, Math.min(nd - 1, Math.round((diff(os, d) * nd) / od))));
  const works = await prisma.estimateWork.findMany({
    where: { sectionId, planStart: { not: null }, planEnd: { not: null } },
    select: { id: true, planStart: true, planEnd: true },
  });
  for (const w of works) {
    const s = map(isoDb(w.planStart)!);
    const e = maxS(map(isoDb(w.planEnd)!), s)!;
    await prisma.estimateWork.update({ where: { id: w.id }, data: { planStart: toDb(s), planEnd: toDb(e) } });
  }
}

const SUB_OPEN = [SubPaymentStatus.pending, SubPaymentStatus.requested, SubPaymentStatus.approved];
const SCHED_DONE = [PaymentStatus.collected, PaymentStatus.paid];

/** Ngày xong (dự báo) của nhóm công tác = công tác xong trễ nhất. null nếu chưa công tác nào có ngày. */
export function endOfWorks(sched: ProjectSched, workIds: string[]): string | null {
  const m = new Map(sched.works.map((w) => [w.id, w.fEnd]));
  let e: string | null = null;
  for (const id of workIds) e = maxS(e, m.get(id) ?? null);
  return e;
}

/**
 * Ghi ngày dự báo xuống nguồn: đợt thầu phụ (chưa trả) + đợt thu (chưa thu) có gắn công tác.
 * Đợt thu = ngày xong công tác trễ nhất + số ngày khách hay trễ. Trả số dòng đã đổi.
 */
export async function syncNativeDates(projectId: string, sched?: ProjectSched): Promise<{ sub: number; thu: number }> {
  const sc = sched ?? (await computeSchedule(projectId));
  const [subs, scheds, plan] = await Promise.all([
    prisma.subPayment.findMany({
      where: { subContract: { projectId }, workIds: { isEmpty: false }, status: { in: SUB_OPEN } },
      select: { id: true, workIds: true, expectedDate: true },
    }),
    prisma.paymentSchedule.findMany({
      where: { projectId, workIds: { isEmpty: false }, status: { notIn: SCHED_DONE } },
      select: { id: true, workIds: true, expectedDate: true, dueDate: true },
    }),
    prisma.projectCashPlan.findUnique({ where: { projectId }, select: { receiptDelayDays: true } }),
  ]);
  let sub = 0;
  for (const s of subs) {
    const e = endOfWorks(sc, s.workIds);
    if (!e || e === isoDb(s.expectedDate)) continue;
    await prisma.subPayment.update({ where: { id: s.id }, data: { expectedDate: toDb(e) } });
    sub++;
  }
  const delay = Math.max(0, plan?.receiptDelayDays ?? 4);
  let thu = 0;
  for (const s of scheds) {
    const e0 = endOfWorks(sc, s.workIds);
    if (!e0) continue;
    const e = add(e0, delay);
    if (e === isoDb(s.expectedDate) && e === isoDb(s.dueDate)) continue;
    await prisma.paymentSchedule.update({ where: { id: s.id }, data: { expectedDate: toDb(e), dueDate: toDb(e) } });
    thu++;
  }
  if (thu) await syncPaymentLateStatus(projectId);
  return { sub, thu };
}

/** Tính lại toàn bộ ngày theo tiến độ: đợt thầu phụ, đợt thu, dự báo vật tư (kế hoạch chưa khoá). */
export async function syncTienDoDates(projectId: string) {
  const sched = await computeSchedule(projectId);
  const plan = await prisma.projectCashPlan.findUnique({ where: { projectId }, select: { status: true } });
  if (plan && plan.status !== BudgetPlanStatus.locked) {
    // import động: cash-forecast import ngược file này (tránh vòng import lúc nạp module).
    const { generateProjectCashLines } = await import("@/lib/cash-forecast");
    await generateProjectCashLines(projectId, sched); // trong đó gọi syncNativeDates
  } else await syncNativeDates(projectId, sched);
  return sched;
}

const parseDate = (v: unknown): Date | null | undefined => {
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) return undefined;
  return new Date(v + "T00:00:00Z");
};

/**
 * Đặt ngày kế hoạch riêng cho công tác (Kỹ sư Dự toán / admin, sếp 11/11/2026). Cả 2 null = bỏ ngày riêng.
 * Ngày công tác ra ngoài khoảng PHẦN → PHẦN tự nới ra cho phủ. Xong → tính lại đợt chi/thu + dòng tiền.
 * Trả câu lỗi, hoặc null khi xong.
 */
export async function setWorkPlanDates(
  projectId: string,
  list: { id?: string; planStart?: unknown; planEnd?: unknown }[],
): Promise<string | null> {
  if (!list.length) return "Thiếu công tác";
  const ids = list.map((w) => String(w.id ?? ""));
  const works = await prisma.estimateWork.findMany({
    where: { id: { in: ids }, projectId },
    select: { id: true, sectionId: true },
  });
  const known = new Set(works.map((w) => w.id));
  const upd: { id: string; planStart: Date | null; planEnd: Date | null }[] = [];
  for (const w of list) {
    const id = String(w.id ?? "");
    if (!known.has(id)) return `Công tác không thuộc dự án: ${id}`;
    const s = parseDate(w.planStart);
    const e = parseDate(w.planEnd);
    if (s === undefined || e === undefined) return "Ngày sai định dạng YYYY-MM-DD";
    if ((s === null) !== (e === null)) return "Cần cả ngày bắt đầu và kết thúc";
    if (s && e && e < s) return "Ngày kết thúc trước ngày bắt đầu";
    upd.push({ id, planStart: s, planEnd: e });
  }
  await prisma.$transaction(
    upd.map((u) => prisma.estimateWork.update({ where: { id: u.id }, data: { planStart: u.planStart, planEnd: u.planEnd } })),
  );

  // Nới PHẦN cho phủ ngày công tác.
  const secIds = Array.from(new Set(works.map((w) => w.sectionId).filter((x): x is string => !!x)));
  for (const sid of secIds) {
    const agg = await prisma.estimateWork.aggregate({
      where: { sectionId: sid, planStart: { not: null } },
      _min: { planStart: true },
      _max: { planEnd: true },
    });
    const sec = await prisma.projectSection.findUnique({ where: { id: sid }, select: { planStart: true, planEnd: true } });
    if (!sec || !agg._min.planStart || !agg._max.planEnd) continue;
    const ps = !sec.planStart || agg._min.planStart < sec.planStart ? agg._min.planStart : sec.planStart;
    const pe = !sec.planEnd || agg._max.planEnd > sec.planEnd ? agg._max.planEnd : sec.planEnd;
    if (+ps !== +(sec.planStart ?? 0) || +pe !== +(sec.planEnd ?? 0))
      await prisma.projectSection.update({ where: { id: sid }, data: { planStart: ps, planEnd: pe } });
  }
  queueTienDoSync(projectId);
  return null;
}

// Gom nhiều tick liền nhau → chạy 1 lần sau 3 giây; mỗi dự án chạy tuần tự (tránh 2 lần lập lại chồng nhau).
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const chains = new Map<string, Promise<unknown>>();
export function queueTienDoSync(projectId: string) {
  const t = timers.get(projectId);
  if (t) clearTimeout(t);
  timers.set(
    projectId,
    setTimeout(() => {
      timers.delete(projectId);
      const prev = chains.get(projectId) ?? Promise.resolve();
      const next = prev
        .then(() => syncTienDoDates(projectId))
        .catch((e) => console.error("[tien-do sync]", projectId, e));
      chains.set(projectId, next);
    }, 3000),
  );
}
