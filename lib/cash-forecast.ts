import { BudgetPlanStatus, CashLineKind, CashTerm, MhOrderStatus, Prisma, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCashPlan, type CashRow } from "@/lib/cash-plan";
import { buildBudgetPlan } from "@/lib/budget-plan";
import { computeEstimateProgress } from "@/lib/estimate-progress";

/**
 * Kế hoạch dòng tiền DỰ ÁN + lịch dòng tiền CÔNG TY (sếp chốt 05/11/2026).
 *
 * Nguyên tắc:
 *  - GĐ 5 Chuẩn bị: lập kế hoạch dòng tiền dự án TRƯỚC khi thi công = dự toán (vật tư theo PHẦN × NCC,
 *    khoán NC theo PHẦN) × tiến độ dự kiến (project_sections.plan_start/plan_end) × điều khoản thanh toán NCC
 *    (nợ N ngày / trả ngay / trả sau khi làm xong). Thu = đợt thu HĐ, ngày theo công tác gán + số ngày khách trễ.
 *  - Trong thi công: đơn mua thật của NCC nào trừ dần vào phần dự báo của NCC đó (dòng dự báo sớm nhất trừ trước);
 *    đơn thật / đợt thầu phụ / công nợ đi theo nguồn thật (lib/cash-plan.ts). Kế hoạch tự đổi theo mua hàng.
 *  - Kế hoạch công ty = Σ dự án + chi phí chung hằng tháng + vay / lãi / tạm ứng; độ dài = dự án xa nhất.
 */

export const TERM_LABEL: Record<CashTerm, string> = {
  no_ngay: "Công nợ (trả sau khi giao)",
  tra_ngay: "Trả ngay khi giao",
  sau_nghiem_thu: "Trả sau khi làm xong",
};
export const KIND_LABEL: Record<CashLineKind, string> = {
  vat_tu: "Vật tư",
  nhan_cong: "Khoán nhân công",
  du_phong: "Dự phòng phát sinh",
  khac: "Khác",
};

const DAY = 86_400_000;
const EPS = 1;
const n = (v: Prisma.Decimal | number | bigint | null | undefined) => (v == null ? 0 : Number(v));
export const todayVn = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const addDays = (s: string, k: number) => new Date(new Date(`${s}T00:00:00Z`).getTime() + k * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY);
/** Thứ Hai của tuần chứa ngày s. */
export const mondayOf = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7; // T2 = 0
  return addDays(s, -wd);
};
const toDb = (s: string) => new Date(`${s}T00:00:00Z`);
const maxIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

// ── Kiểu dữ liệu ──────────────────────────────────────────────────────────────

/** Một món trên lịch dòng tiền. `src` = lệnh POST /api/cron/cash-plan để đổi ngày (null = chỉ xem). */
export type CashItem = {
  k: string;
  loai: "native" | "item" | "chunk" | "line" | "ro";
  huong: "in" | "out";
  ten: string;
  phu: string | null;
  du_an: string | null;
  projectId: string | null;
  ngay: string | null;
  uoc: boolean; // ngày là ước tính (chưa ai chốt) — hiện mờ
  tien: number;
  src: Record<string, unknown> | null;
};

export type CashWeek = { start: string; end: string; in: number; out: number; endBalance: number; items: CashItem[] };
export type CashMonth = { ym: string; label: string; in: number; out: number; endBalance: number; weeks: CashWeek[] };
export type CashCalendar = {
  today: string;
  horizonEnd: string;
  balance: number; // số dư đầu kỳ (công ty: quỹ hiện tại; dự án: 0)
  qua: { in: number; out: number; items: CashItem[] }; // trước tuần này — quá hạn / chưa xử lý
  chuaNgay: CashItem[];
  months: CashMonth[];
  tuanAm: { start: string; end: string; endBalance: number }[];
  totals: { in: number; out: number };
};

export type CashLineView = {
  id: string;
  kind: CashLineKind;
  sectionId: string | null;
  sectionName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  groupKey: string;
  seq: number;
  title: string;
  term: CashTerm;
  baseDate: string;
  dueDate: string;
  dateManual: boolean;
  amount: number;
  doneCut: number; // phần vật tư dự toán của công tác KS đã tick xong → bỏ, không dự báo nữa
  consumed: number; // đã có đơn thật trừ vào
  remaining: number;
  note: string | null;
};

export type ProjectCashFlow = {
  plan: {
    exists: boolean;
    status: BudgetPlanStatus | null;
    contingencyPct: number;
    receiptDelayDays: number;
    leadDays: number;
    generatedAt: string | null;
    lockedAt: string | null;
    note: string | null;
  };
  project: { id: string; code: string; name: string; startDate: string; expectedEndDate: string; contractValue: number };
  lines: CashLineView[];
  suppliers: { id: string; name: string; paymentTerm: CashTerm; creditDays: number; lines: number; amount: number }[];
  sectionsMissingDates: string[]; // PHẦN chưa có tiến độ dự kiến → dùng ngày dự án
  hasSubContracts: boolean; // đã có HĐ khoán → NC theo đợt thầu phụ, không dự báo
  thu: { total: number; dated: number; undated: number };
  totals: { forecastOut: number; actualOut: number; in: number };
  calendar: CashCalendar;
};

// ── Sinh dòng dự báo từ dự toán + tiến độ ───────────────────────────────────

const dueFor = (term: CashTerm, base: string, creditDays: number) =>
  term === CashTerm.no_ngay ? addDays(base, Math.max(0, creditDays)) : base;

/**
 * Sinh lại dòng dự báo của dự án. Dòng cũ sếp đã sửa ngày tay (date_manual) cùng nhóm+đợt → giữ ngày + ghi chú.
 * Trả về số dòng + cảnh báo.
 */
export async function generateProjectCashLines(projectId: string): Promise<{ lines: number; warnings: string[] }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, startDate: true, expectedEndDate: true },
  });
  if (!project) throw new Error("Không tìm thấy dự án");
  const plan = await prisma.projectCashPlan.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
    select: { id: true, contingencyPct: true, receiptDelayDays: true, leadDays: true },
  });

  const [sections, mats, works, subCount, oldLines] = await Promise.all([
    prisma.projectSection.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, planStart: true, planEnd: true, sortOrder: true },
    }),
    prisma.estimateDbMaterial.findMany({
      where: { projectId },
      select: { sectionId: true, supplierId: true, quantity: true, unitPrice: true, work: { select: { sectionId: true } } },
    }),
    prisma.estimateWork.findMany({ where: { projectId }, select: { sectionId: true, quantity: true, laborPrice: true } }),
    prisma.subContract.count({ where: { projectId, status: { in: ["active", "completed"] } } }),
    prisma.projectCashLine.findMany({
      where: { planId: plan.id },
      select: { kind: true, groupKey: true, sectionId: true, seq: true, dueDate: true, dateManual: true, note: true },
    }),
  ]);
  const warnings: string[] = [];
  const projStart = iso(project.startDate)!;
  const projEnd = maxIso(iso(project.expectedEndDate), addDays(projStart, 7))!;

  // Thời gian mỗi PHẦN: thiếu lịch → dùng cả dự án (cảnh báo).
  const secInfo = new Map<string, { name: string; start: string; end: string; order: number }>();
  const missing: string[] = [];
  sections.forEach((s, i) => {
    const start = iso(s.planStart);
    const end = iso(s.planEnd);
    if (!start || !end) missing.push(s.name);
    const st = start ?? projStart;
    secInfo.set(s.id, { name: s.name, start: st, end: maxIso(end, st)!, order: i });
  });
  if (missing.length) warnings.push(`PHẦN chưa có tiến độ dự kiến (tạm lấy ngày dự án): ${missing.join(", ")}`);
  const noSection = { name: "Chưa gắn phần", start: projStart, end: projEnd, order: 9999 };

  // Điều khoản NCC.
  const supIds = Array.from(new Set(mats.map((m) => m.supplierId).filter((x): x is string => !!x)));
  const sups = supIds.length
    ? await prisma.supplier.findMany({ where: { id: { in: supIds } }, select: { id: true, name: true, paymentTerm: true, creditDays: true } })
    : [];
  const supMap = new Map(sups.map((s) => [s.id, s]));

  // Vật tư: gom theo PHẦN × NCC.
  const vt = new Map<string, { sectionId: string | null; supplierId: string | null; amount: number }>();
  let totalVt = 0;
  for (const m of mats) {
    const sectionId = m.sectionId ?? m.work?.sectionId ?? null;
    const amt = n(m.quantity) * n(m.unitPrice);
    if (amt <= EPS) continue;
    totalVt += amt;
    const key = `${sectionId ?? "none"}|${m.supplierId ?? "none"}`;
    const cur = vt.get(key);
    if (cur) cur.amount += amt;
    else vt.set(key, { sectionId, supplierId: m.supplierId ?? null, amount: amt });
  }

  type NewLine = Omit<Prisma.ProjectCashLineCreateManyInput, "planId" | "projectId">;
  const out: NewLine[] = [];
  let sort = 0;
  const orderOf = (sectionId: string | null) => (sectionId ? secInfo.get(sectionId)?.order ?? 9999 : 9999);
  const groups = Array.from(vt.values()).sort((a, b) => orderOf(a.sectionId) - orderOf(b.sectionId));
  for (const g of groups) {
    const sec = (g.sectionId && secInfo.get(g.sectionId)) || noSection;
    const sup = g.supplierId ? supMap.get(g.supplierId) : undefined;
    const term = sup?.paymentTerm ?? CashTerm.no_ngay;
    const credit = sup?.creditDays ?? 14;
    const supName = sup?.name ?? "Chưa có NCC";
    const groupKey = `sup:${g.supplierId ?? "none"}`;
    if (term === CashTerm.sau_nghiem_thu) {
      out.push({
        kind: CashLineKind.vat_tu, sectionId: g.sectionId, supplierId: g.supplierId, groupKey, seq: 1,
        title: `${sec.name} · ${supName}`, term, baseDate: toDb(sec.end), dueDate: toDb(sec.end),
        amount: new Prisma.Decimal(Math.round(g.amount)), sortOrder: sort++,
        note: "Trả sau khi làm xong phần này",
      });
      continue;
    }
    // Giao hàng theo tuần trong thời gian làm phần đó (tiến độ = gốc mua hàng tuần).
    const days = Math.max(1, diffDays(sec.start, sec.end) + 1);
    const weeks = Math.max(1, Math.ceil(days / 7));
    const each = g.amount / weeks;
    for (let k = 0; k < weeks; k++) {
      const base = addDays(sec.start, 7 * k);
      out.push({
        kind: CashLineKind.vat_tu, sectionId: g.sectionId, supplierId: g.supplierId, groupKey, seq: k + 1,
        title: `${sec.name} · ${supName}${weeks > 1 ? ` · đợt ${k + 1}/${weeks}` : ""}`,
        term, baseDate: toDb(base), dueDate: toDb(dueFor(term, base, credit)),
        amount: new Prisma.Decimal(Math.round(each)), sortOrder: sort++,
        note: term === CashTerm.no_ngay ? `Giao ${base.slice(8, 10)}/${base.slice(5, 7)}, trả sau ${credit} ngày` : `Trả ngay khi giao`,
      });
    }
  }

  // Khoán NC theo PHẦN — chỉ khi CHƯA có HĐ khoán (có HĐ thì đợt thầu phụ là nguồn thật).
  if (subCount === 0) {
    const nc = new Map<string | null, number>();
    for (const w of works) {
      const amt = n(w.quantity) * n(w.laborPrice);
      if (amt <= EPS) continue;
      nc.set(w.sectionId, (nc.get(w.sectionId) ?? 0) + amt);
    }
    const ncGroups = Array.from(nc.entries()).sort((a, b) => orderOf(a[0]) - orderOf(b[0]));
    for (const [sectionId, amount] of ncGroups) {
      const sec = (sectionId && secInfo.get(sectionId)) || noSection;
      out.push({
        kind: CashLineKind.nhan_cong, sectionId, supplierId: null, groupKey: "nc", seq: 1,
        title: `Khoán NC · ${sec.name}`, term: CashTerm.sau_nghiem_thu, baseDate: toDb(sec.end), dueDate: toDb(sec.end),
        amount: new Prisma.Decimal(Math.round(amount)), sortOrder: sort++,
        note: "Theo dự toán, trả khi xong phần (chưa có HĐ khoán chia đợt)",
      });
    }
  } else warnings.push("Đã có HĐ khoán nhân công → nhân công tính theo đợt thầu phụ, không dự báo thêm");

  // Dự phòng phát sinh: % vật tư, rải đều theo tuần cả dự án.
  const pct = n(plan.contingencyPct);
  if (pct > 0 && totalVt > 0) {
    const weeks = Math.max(1, Math.ceil((diffDays(projStart, projEnd) + 1) / 7));
    const each = (totalVt * pct) / 100 / weeks;
    for (let k = 0; k < weeks; k++) {
      const base = addDays(projStart, 7 * k);
      out.push({
        kind: CashLineKind.du_phong, sectionId: null, supplierId: null, groupKey: "dp", seq: k + 1,
        title: `Dự phòng phát sinh · tuần ${k + 1}/${weeks}`, term: CashTerm.tra_ngay, baseDate: toDb(base), dueDate: toDb(base),
        amount: new Prisma.Decimal(Math.round(each)), sortOrder: sort++, note: `${pct}% vật tư dự toán`,
      });
    }
  }

  // Giữ ngày sếp đã sửa tay (cùng loại + nhóm + phần + đợt).
  const manual = new Map(
    oldLines.filter((l) => l.dateManual).map((l) => [`${l.kind}|${l.groupKey}|${l.sectionId ?? ""}|${l.seq}`, l]),
  );
  for (const l of out) {
    const m = manual.get(`${l.kind}|${l.groupKey}|${l.sectionId ?? ""}|${l.seq}`);
    if (m) {
      l.dueDate = m.dueDate;
      l.dateManual = true;
      if (m.note) l.note = m.note;
    }
  }

  await prisma.$transaction([
    prisma.projectCashLine.deleteMany({ where: { planId: plan.id } }),
    ...(out.length
      ? [prisma.projectCashLine.createMany({ data: out.map((l) => ({ ...l, planId: plan.id, projectId })) })]
      : []),
    prisma.projectCashPlan.update({ where: { id: plan.id }, data: { generatedAt: new Date() } }),
  ]);

  // Đợt thu chưa có ngày: suy từ công tác gán (phần chứa công tác xong trễ nhất) + số ngày khách trễ.
  await fillScheduleDates(projectId, plan.receiptDelayDays, secInfo);

  if (!out.length) warnings.push("Dự toán chưa có vật tư / công tác → không sinh được dòng nào");
  return { lines: out.length, warnings };
}

/** Điền expected_date cho đợt thu CHƯA có ngày theo công tác gán + ngày trễ. Không đè ngày đã có. */
async function fillScheduleDates(
  projectId: string,
  delayDays: number,
  secInfo: Map<string, { end: string }>,
) {
  const schedules = await prisma.paymentSchedule.findMany({
    where: { projectId, expectedDate: null, dueDate: null, status: { in: ["not_collected", "pending"] } },
    select: { id: true, workIds: true },
  });
  if (!schedules.length) return;
  const workIds = Array.from(new Set(schedules.flatMap((s) => s.workIds)));
  if (!workIds.length) return;
  const works = await prisma.estimateWork.findMany({ where: { id: { in: workIds } }, select: { id: true, sectionId: true } });
  const wSec = new Map(works.map((w) => [w.id, w.sectionId]));
  for (const s of schedules) {
    let end: string | null = null;
    for (const wid of s.workIds) {
      const sid = wSec.get(wid);
      const e = sid ? secInfo.get(sid)?.end ?? null : null;
      end = maxIso(end, e);
    }
    if (!end) continue;
    const d = toDb(addDays(end, Math.max(0, delayDays)));
    await prisma.paymentSchedule.update({ where: { id: s.id }, data: { expectedDate: d, dueDate: d } });
  }
}

// ── Đối chiếu dòng dự báo với đơn thật ──────────────────────────────────────

type LineRow = Prisma.ProjectCashLineGetPayload<{
  select: {
    id: true; projectId: true; kind: true; sectionId: true; supplierId: true; groupKey: true; seq: true; title: true;
    term: true; baseDate: true; dueDate: true; dateManual: true; amount: true; note: true; sortOrder: true;
    section: { select: { name: true } }; supplier: { select: { name: true } };
  };
}>;
const LINE_SELECT = {
  id: true, projectId: true, kind: true, sectionId: true, supplierId: true, groupKey: true, seq: true, title: true,
  term: true, baseDate: true, dueDate: true, dateManual: true, amount: true, note: true, sortOrder: true,
  section: { select: { name: true } }, supplier: { select: { name: true } },
} as const;

/**
 * Phần vật tư dự toán ĐÃ LÀM XONG theo tick tiến độ của KS (sếp 11/11/2026): công tác xong thì vật tư
 * thật đã mua nằm ở đơn hàng, máy không dự báo vật tư dự toán của công tác đó nữa.
 *  - VT gắn công tác (work_id) → xong khi công tác đó tick xong.
 *  - VT không gắn công tác (dự toán cũ) → theo tick "Xong cả hạng mục" của PHẦN: tỉ lệ ngân sách các
 *    hạng mục đã xong trong phần (phần nhiều hạng mục mà mới xong 1 → bỏ đúng tỉ lệ đó).
 * Trả `${projectId}|${sectionId}|sup:${ncc}` → {tot, done} (tiền dự toán, khớp nhóm dòng dự báo) và
 * `${projectId}|${sectionId}` → dự toán VT phần đã xong (để trừ đơn thật theo PHẦN).
 */
async function estimateDone(projectIds: string[]) {
  const [mats, doneWorks, progs] = await Promise.all([
    prisma.estimateDbMaterial.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, sectionId: true, workId: true, supplierId: true, quantity: true, unitPrice: true, work: { select: { sectionId: true } } },
    }),
    prisma.estimateTaskProgress.findMany({
      where: { projectId: { in: projectIds }, refType: "work", done: true },
      select: { refId: true },
    }),
    Promise.all(projectIds.map(async (pid) => ({ pid, prog: await computeEstimateProgress(pid) }))),
  ]);
  const workDone = new Set(doneWorks.map((w) => w.refId));
  // Tỉ lệ xong của PHẦN cho VT không gắn công tác (chỉ tính hạng mục không có khối lượng con).
  const secFrac = new Map<string, number>();
  for (const { pid, prog } of progs) {
    const agg = new Map<string, { tot: number; done: number; nTot: number; nDone: number }>();
    for (const t of prog.tasks) {
      if (!t.sectionId || t.works.length) continue;
      const a = agg.get(t.sectionId) ?? { tot: 0, done: 0, nTot: 0, nDone: 0 };
      a.tot += t.amount; a.nTot++;
      if (t.done) { a.done += t.amount; a.nDone++; }
      agg.set(t.sectionId, a);
    }
    for (const [sid, a] of Array.from(agg.entries()))
      secFrac.set(`${pid}|${sid}`, a.tot > EPS ? a.done / a.tot : a.nTot ? a.nDone / a.nTot : 0);
  }
  const bySec = new Map<string, { tot: number; done: number }>();
  const doneBySec = new Map<string, number>();
  for (const m of mats) {
    const amt = n(m.quantity) * n(m.unitPrice);
    if (amt <= EPS) continue;
    const sectionId = m.sectionId ?? m.work?.sectionId ?? null;
    const frac = m.workId ? (workDone.has(m.workId) ? 1 : 0) : sectionId ? secFrac.get(`${m.projectId}|${sectionId}`) ?? 0 : 0;
    const g = `sup:${m.supplierId ?? "none"}`;
    const k = `${m.projectId}|${sectionId ?? ""}|${g}`;
    const cur = bySec.get(k) ?? { tot: 0, done: 0 };
    cur.tot += amt; cur.done += amt * frac;
    bySec.set(k, cur);
    const sk = `${m.projectId}|${sectionId ?? ""}`;
    doneBySec.set(sk, (doneBySec.get(sk) ?? 0) + amt * frac);
  }
  return { bySec, doneBySec };
}

/**
 * Đối chiếu dòng dự báo với thực tế, theo thứ tự:
 *  1. Bỏ vật tư dự toán của công tác KS đã tick xong (estimateDone) — trừ vào dòng sớm nhất của nhóm PHẦN × NCC.
 *  2. Trừ đơn thật THEO PHẦN, không theo NCC (sếp 11/11/2026: NCC dự toán chỉ là nguồn đơn giá, công trình mua
 *     NCC khác được): đơn mua (mọi trạng thái trừ nháp) gắn hạng mục → PHẦN; phần đơn VƯỢT dự toán VT phần đã xong
 *     của PHẦN đó trừ vào dòng VT chưa làm của chính PHẦN đó. Đơn chưa gắn PHẦN → trừ dòng VT sớm nhất cả dự án.
 *     Nhóm `nc` bị trừ Σ giá trị HĐ khoán. Dòng sớm nhất trừ trước.
 */
async function reconcileLines(projectIds: string[]): Promise<CashLineView[]> {
  if (!projectIds.length) return [];
  const [lines, orders, subs, est] = await Promise.all([
    prisma.projectCashLine.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
      select: LINE_SELECT,
    }),
    prisma.mhOrder.findMany({
      where: { projectId: { in: projectIds }, status: { not: MhOrderStatus.draft } },
      select: { projectId: true, total: true, budgetLineId: true },
    }),
    prisma.subContract.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, status: { in: ["active", "completed"] } },
      _sum: { contractValue: true },
    }),
    estimateDone(projectIds),
  ]);
  // 1. Tiền cần bỏ mỗi nhóm PHẦN × NCC = tỉ lệ dự toán đã xong × tổng dòng dự báo của nhóm.
  const lineSum = new Map<string, number>();
  for (const l of lines as LineRow[])
    if (l.kind === CashLineKind.vat_tu) {
      const k = `${l.projectId}|${l.sectionId ?? ""}|${l.groupKey}`;
      lineSum.set(k, (lineSum.get(k) ?? 0) + n(l.amount));
    }
  const cut = new Map<string, number>();
  for (const [k, sum] of Array.from(lineSum.entries())) {
    const e = est.bySec.get(k);
    if (e && e.tot > EPS && e.done > EPS) cut.set(k, sum * Math.min(1, e.done / e.tot));
  }
  // 2. Đơn thật trừ vào phần chưa làm = đơn của PHẦN − dự toán VT phần đã xong của PHẦN đó (không xét NCC).
  const blIds = Array.from(new Set(orders.map((o) => o.budgetLineId).filter((x): x is string => !!x)));
  const bls = blIds.length
    ? await prisma.projectBudgetPlanLine.findMany({ where: { id: { in: blIds } }, select: { id: true, sectionId: true } })
    : [];
  const secOfLine = new Map(bls.map((b) => [b.id, b.sectionId]));
  const ordSec = new Map<string, number>();
  for (const o of orders) {
    const k = `${o.projectId}|${(o.budgetLineId && secOfLine.get(o.budgetLineId)) || ""}`;
    ordSec.set(k, (ordSec.get(k) ?? 0) + n(o.total));
  }
  const used = new Map<string, number>(); // `${projectId}|${sectionId}` (VT, "" = chưa gắn PHẦN → cả dự án) · `${projectId}|nc`
  for (const [k, tot] of Array.from(ordSec.entries()))
    used.set(k, k.endsWith("|") ? tot : Math.max(0, tot - (est.doneBySec.get(k) ?? 0)));
  for (const s of subs) used.set(`${s.projectId}|nc`, n(s._sum.contractValue));
  const views: CashLineView[] = [];
  for (const l of lines as LineRow[]) {
    const amount = n(l.amount);
    const ck = `${l.projectId}|${l.sectionId ?? ""}|${l.groupKey}`;
    const cutLeft = l.kind === CashLineKind.vat_tu ? cut.get(ck) ?? 0 : 0;
    const doneCut = Math.min(amount, Math.max(0, cutLeft));
    if (doneCut > 0) cut.set(ck, cutLeft - doneCut);
    let consumed = 0;
    const take = (key: string) => {
      const left = used.get(key) ?? 0;
      const c = Math.min(amount - doneCut - consumed, Math.max(0, left));
      if (c > 0) { used.set(key, left - c); consumed += c; }
    };
    if (l.kind === CashLineKind.vat_tu) {
      if (l.sectionId) take(`${l.projectId}|${l.sectionId}`);
      take(`${l.projectId}|`);
    } else if (l.groupKey === "nc") take(`${l.projectId}|nc`);
    views.push({
      id: l.id, kind: l.kind, sectionId: l.sectionId, sectionName: l.section?.name ?? null,
      supplierId: l.supplierId, supplierName: l.supplier?.name ?? null, groupKey: l.groupKey, seq: l.seq,
      title: l.title, term: l.term, baseDate: iso(l.baseDate)!, dueDate: iso(l.dueDate)!, dateManual: l.dateManual,
      amount, doneCut, consumed, remaining: Math.max(0, amount - doneCut - consumed), note: l.note,
    });
  }
  return views;
}

// ── Món từ nguồn thật (cash-plan) + ngày ước tính cho món chưa có ngày ─────

type Ctx = {
  creditDays: Map<string, number>; // supplierId → ngày nợ
  lastReceived: Map<string, string>; // `${projectId}|${supplierId}` → ngày nhận cuối
  subEnd: Map<string, string>; // subContractId → expectedEndDate
  loanDue: Map<string, string>;
  schedDerived: Map<string, string>; // paymentScheduleId → ngày suy từ công tác gán
  orderDate: Map<string, string>; // mhOrderId (chưa có ngày giao) → ngày đặt
};

async function loadCtx(projectIds: string[] | null): Promise<Ctx> {
  const pFilter = projectIds ? { projectId: { in: projectIds } } : {};
  const [sups, recv, subs, loans, scheds, noDelivery] = await Promise.all([
    prisma.supplier.findMany({ select: { id: true, creditDays: true } }),
    prisma.mhOrder.groupBy({
      by: ["projectId", "supplierId"],
      where: { ...pFilter, status: { in: [MhOrderStatus.received, MhOrderStatus.paid] }, supplierId: { not: null } },
      _max: { receivedAt: true },
    }),
    prisma.subContract.findMany({ where: { ...pFilter, status: { in: ["active", "completed"] } }, select: { id: true, expectedEndDate: true } }),
    prisma.loan.findMany({ where: { status: "active" }, select: { id: true, dueDate: true } }),
    prisma.paymentSchedule.findMany({
      where: { ...pFilter, expectedDate: null, dueDate: null, workIds: { isEmpty: false } },
      select: { id: true, projectId: true, workIds: true },
    }),
    prisma.mhOrder.findMany({
      where: { ...pFilter, deliveryDate: null, status: { in: [MhOrderStatus.ordered, MhOrderStatus.received] } },
      select: { id: true, orderDate: true },
    }),
  ]);
  const ctx: Ctx = { creditDays: new Map(), lastReceived: new Map(), subEnd: new Map(), loanDue: new Map(), schedDerived: new Map(), orderDate: new Map() };
  noDelivery.forEach((o) => ctx.orderDate.set(o.id, iso(o.orderDate)!));
  sups.forEach((s) => ctx.creditDays.set(s.id, s.creditDays));
  recv.forEach((r) => {
    const d = iso(r._max.receivedAt);
    if (d && r.supplierId) ctx.lastReceived.set(`${r.projectId}|${r.supplierId}`, d);
  });
  subs.forEach((s) => ctx.subEnd.set(s.id, iso(s.expectedEndDate)!));
  loans.forEach((l) => { const d = iso(l.dueDate); if (d) ctx.loanDue.set(l.id, d); });
  if (scheds.length) {
    const wids = Array.from(new Set(scheds.flatMap((s) => s.workIds)));
    const works = await prisma.estimateWork.findMany({
      where: { id: { in: wids } },
      select: { id: true, section: { select: { planEnd: true } } },
    });
    const wEnd = new Map(works.map((w) => [w.id, iso(w.section?.planEnd)]));
    const plans = await prisma.projectCashPlan.findMany({
      where: { projectId: { in: Array.from(new Set(scheds.map((s) => s.projectId))) } },
      select: { projectId: true, receiptDelayDays: true },
    });
    const delay = new Map(plans.map((p) => [p.projectId, p.receiptDelayDays]));
    for (const s of scheds) {
      let end: string | null = null;
      s.workIds.forEach((w) => { end = maxIso(end, wEnd.get(w) ?? null); });
      if (end) ctx.schedDerived.set(s.id, addDays(end, delay.get(s.projectId) ?? 4));
    }
  }
  return ctx;
}

/** Dòng /cash-plan → món. Món chưa có ngày gốc → ước tính theo điều khoản NCC / ngày xong HĐ / hạn vay. */
function rowsToItems(rows: CashRow[], huong: "in" | "out", ctx: Ctx): CashItem[] {
  const items: CashItem[] = [];
  for (const r of rows) {
    let chunkSum = 0;
    for (const c of r.chunks) {
      chunkSum += c.amount;
      items.push({
        k: `item:${c.id}`, loai: "item", huong, ten: c.title && c.title !== r.title ? `${r.title} · ${c.title}` : r.title,
        phu: c.note ?? r.subtitle, du_an: r.projectLabel, projectId: r.projectId, ngay: c.plannedDate, uoc: false,
        tien: c.amount, src: { op: "item", id: c.id },
      });
    }
    if (!r.hasTotal) continue;
    const con = r.total - chunkSum;
    if (con <= EPS) continue;
    let ngay = r.nativeDate;
    let uoc = false;
    let loai: CashItem["loai"] = "ro";
    let src: Record<string, unknown> | null = null;
    if (ngay && r.nativeEditable) {
      loai = "native";
      src = { op: "native", sourceType: r.sourceType, sourceId: r.sourceId };
    } else if (r.canSplit && r.sourceId) {
      loai = "chunk";
      src = { op: "chunk", direction: huong, sourceType: r.sourceType, sourceId: r.sourceId, projectId: r.projectId, amount: con, title: r.title };
    }
    if (!ngay) {
      uoc = true;
      if (r.sourceType === "ncc_congno" && r.projectId && r.sourceId) {
        const last = ctx.lastReceived.get(`${r.projectId}|${r.sourceId}`);
        if (last) ngay = addDays(last, ctx.creditDays.get(r.sourceId) ?? 14);
      } else if (r.sourceType === "sub_debt" && r.sourceId) ngay = ctx.subEnd.get(r.sourceId) ?? null;
      else if (r.sourceType === "loan_principal" && r.sourceId) ngay = ctx.loanDue.get(r.sourceId) ?? null;
      else if (r.sourceType === "mh_order" && r.sourceId) {
        const od = ctx.orderDate.get(r.sourceId);
        if (od) { ngay = addDays(od, 7); loai = "native"; src = { op: "native", sourceType: "mh_order", sourceId: r.sourceId }; }
      }
      else if (r.sourceType === "payment_schedule" && r.sourceId) {
        ngay = ctx.schedDerived.get(r.sourceId) ?? null;
        if (ngay) { loai = "native"; src = { op: "native", sourceType: "payment_schedule", sourceId: r.sourceId }; }
      }
      if (!ngay) uoc = false;
    }
    items.push({ k: r.key, loai, huong, ten: r.title, phu: r.subtitle, du_an: r.projectLabel, projectId: r.projectId, ngay, uoc, tien: con, src });
  }
  return items;
}

/** Đơn mua NCC công nợ ĐÃ ĐẶT, chưa nhận: chưa nằm ở công nợ NCC nhưng chắc chắn phải trả → ước tính giao + nợ. */
async function orderedDebtItems(projectIds: string[] | null, ctx: Ctx, projLabel: Map<string, string>): Promise<CashItem[]> {
  const orders = await prisma.mhOrder.findMany({
    where: { status: MhOrderStatus.ordered, supplierId: { not: null }, ...(projectIds ? { projectId: { in: projectIds } } : {}) },
    select: { id: true, seq: true, projectId: true, supplierId: true, supplierName: true, total: true, deliveryDate: true, orderDate: true },
  });
  return orders
    .filter((o) => n(o.total) > EPS)
    .map((o) => {
      const credit = ctx.creditDays.get(o.supplierId!) ?? 14;
      const giao = iso(o.deliveryDate) ?? addDays(iso(o.orderDate)!, 7);
      return {
        k: `mh_ordered:${o.id}`, loai: "native" as const, huong: "out" as const,
        ten: `Mua hàng · Đơn #${o.seq}${o.supplierName ? ` · ${o.supplierName}` : ""}`,
        phu: `Đã đặt, giao ${giao.slice(8, 10)}/${giao.slice(5, 7)} · công nợ ${credit} ngày`,
        du_an: projLabel.get(o.projectId) ?? null, projectId: o.projectId, ngay: addDays(giao, credit), uoc: !o.deliveryDate,
        tien: n(o.total), src: { op: "native", sourceType: "mh_order", sourceId: o.id, offsetDays: credit },
      };
    });
}

function lineItems(lines: CashLineView[], projLabel: Map<string, string>, projectIdOf: Map<string, string>, today: string): CashItem[] {
  return lines
    .filter((l) => l.remaining > EPS)
    // Dự phòng phát sinh của tuần đã qua: phát sinh thật đã nằm ở đơn / lệnh chi → bỏ, không dồn về hôm nay.
    .filter((l) => !(l.kind === CashLineKind.du_phong && !l.dateManual && l.dueDate < today))
    .map((l) => {
      // Dòng máy ước tính mà ngày đã qua = phần CHƯA LÀM (việc đã tick xong đã bị bỏ ở reconcileLines), chưa mua
      // → dồn về hôm nay, không tính là quá hạn.
      const don = !l.dateManual && l.dueDate < today;
      return {
        k: `line:${l.id}`, loai: "line" as const, huong: "out" as const,
        ten: `${KIND_LABEL[l.kind]} · ${l.title}`,
        phu: [TERM_LABEL[l.term], l.doneCut > EPS ? `KS đã tick xong ${Math.round(l.doneCut).toLocaleString("vi-VN")} đ (bỏ dự toán)` : null,
          l.consumed > EPS ? `đã có đơn ${Math.round(l.consumed).toLocaleString("vi-VN")} đ` : null, l.note,
          don ? `kế hoạch ${l.dueDate.slice(8, 10)}/${l.dueDate.slice(5, 7)} chưa mua → dồn về hôm nay` : null]
          .filter(Boolean).join(" · ") || null,
        du_an: projLabel.get(projectIdOf.get(l.id) ?? "") ?? null, projectId: projectIdOf.get(l.id) ?? null,
        ngay: don ? today : l.dueDate, uoc: !l.dateManual, tien: l.remaining, src: { op: "line", id: l.id },
      };
    });
}

// ── Lịch tháng / tuần ──────────────────────────────────────────────────────

export function lamLich(items: CashItem[], opts: { today: string; horizonEnd: string; balance: number }): CashCalendar {
  const { today, balance } = opts;
  const mon0 = mondayOf(today);
  let horizon = opts.horizonEnd;
  for (const it of items) if (it.ngay && it.ngay > horizon) horizon = it.ngay;
  const minHorizon = addDays(mon0, 7 * 8 - 1);
  if (horizon < minHorizon) horizon = minHorizon;

  const qua = { in: 0, out: 0, items: [] as CashItem[] };
  const chuaNgay: CashItem[] = [];
  const dated: CashItem[] = [];
  for (const it of items) {
    if (!it.ngay) chuaNgay.push(it);
    else if (it.ngay < mon0) { qua.items.push(it); qua[it.huong] += it.tien; }
    else dated.push(it);
  }
  dated.sort((a, b) => (a.ngay! < b.ngay! ? -1 : a.ngay! > b.ngay! ? 1 : b.tien - a.tien));
  qua.items.sort((a, b) => (a.ngay! < b.ngay! ? -1 : 1));

  // Quá hạn coi như phải xử lý ngay → trừ vào số dư đầu kỳ.
  let bal = balance + qua.in - qua.out;
  const months: CashMonth[] = [];
  const tuanAm: CashCalendar["tuanAm"] = [];
  let idx = 0;
  const totals = { in: qua.in, out: qua.out };
  for (let ws = mon0; ws <= horizon; ws = addDays(ws, 7)) {
    const we = addDays(ws, 6);
    const w: CashWeek = { start: ws, end: we, in: 0, out: 0, endBalance: 0, items: [] };
    while (idx < dated.length && dated[idx].ngay! <= we) {
      const it = dated[idx++];
      w.items.push(it);
      w[it.huong] += it.tien;
    }
    bal += w.in - w.out;
    w.endBalance = bal;
    totals.in += w.in;
    totals.out += w.out;
    if (bal < 0) tuanAm.push({ start: ws, end: we, endBalance: bal });
    const ym = ws.slice(0, 7);
    let m = months[months.length - 1];
    if (!m || m.ym !== ym) {
      m = { ym, label: `Tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`, in: 0, out: 0, endBalance: 0, weeks: [] };
      months.push(m);
    }
    m.weeks.push(w);
    m.in += w.in;
    m.out += w.out;
  }
  // Số dư cuối THÁNG = số dư sau ngày cuối tháng (tuần vắt qua 2 tháng tính theo ngày thật).
  let run = balance + qua.in - qua.out;
  let j = 0;
  for (const m of months) {
    const y = Number(m.ym.slice(0, 4));
    const mo = Number(m.ym.slice(5, 7));
    const lastDay = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    while (j < dated.length && dated[j].ngay! <= lastDay) {
      run += dated[j].huong === "in" ? dated[j].tien : -dated[j].tien;
      j++;
    }
    m.endBalance = run;
  }
  return { today, horizonEnd: horizon, balance, qua, chuaNgay, months, tuanAm, totals };
}

// ── Màn dự án ──────────────────────────────────────────────────────────────

export async function buildProjectCashFlow(projectId: string): Promise<ProjectCashFlow> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, name: true, startDate: true, expectedEndDate: true, contractValue: true },
  });
  if (!project) throw new Error("Không tìm thấy dự án");
  const [plan, lines, cash, ctx, sections, subCount] = await Promise.all([
    prisma.projectCashPlan.findUnique({ where: { projectId } }),
    reconcileLines([projectId]),
    buildCashPlan({ projectId }),
    loadCtx([projectId]),
    prisma.projectSection.findMany({ where: { projectId, OR: [{ planStart: null }, { planEnd: null }] }, select: { name: true } }),
    prisma.subContract.count({ where: { projectId, status: { in: ["active", "completed"] } } }),
  ]);
  const label = `${project.code} · ${project.name}`;
  const projLabel = new Map([[projectId, label]]);
  const projectIdOf = new Map(lines.map((l) => [l.id, projectId]));
  const today = todayVn();
  const items = [
    ...rowsToItems(cash.out, "out", ctx),
    ...rowsToItems(cash.in, "in", ctx),
    ...(await orderedDebtItems([projectId], ctx, projLabel)),
    ...lineItems(lines, projLabel, projectIdOf, today),
  ];
  const calendar = lamLich(items, { today, horizonEnd: iso(project.expectedEndDate)!, balance: 0 });
  const thuItems = items.filter((i) => i.huong === "in");
  const supAgg = new Map<string, { id: string; name: string; lines: number; amount: number }>();
  for (const l of lines) {
    if (!l.supplierId) continue;
    const s = supAgg.get(l.supplierId) ?? { id: l.supplierId, name: l.supplierName ?? "NCC", lines: 0, amount: 0 };
    s.lines++;
    s.amount += l.amount;
    supAgg.set(l.supplierId, s);
  }
  const supRows = supAgg.size
    ? await prisma.supplier.findMany({ where: { id: { in: Array.from(supAgg.keys()) } }, select: { id: true, paymentTerm: true, creditDays: true } })
    : [];
  const supTerm = new Map(supRows.map((s) => [s.id, s]));
  return {
    plan: {
      exists: !!plan,
      status: plan?.status ?? null,
      contingencyPct: n(plan?.contingencyPct ?? 5),
      receiptDelayDays: plan?.receiptDelayDays ?? 4,
      leadDays: plan?.leadDays ?? 3,
      generatedAt: plan?.generatedAt?.toISOString() ?? null,
      lockedAt: plan?.lockedAt?.toISOString() ?? null,
      note: plan?.note ?? null,
    },
    project: {
      id: project.id, code: project.code, name: project.name,
      startDate: iso(project.startDate)!, expectedEndDate: iso(project.expectedEndDate)!, contractValue: n(project.contractValue),
    },
    lines,
    suppliers: Array.from(supAgg.values())
      .map((s) => ({ ...s, paymentTerm: supTerm.get(s.id)?.paymentTerm ?? CashTerm.no_ngay, creditDays: supTerm.get(s.id)?.creditDays ?? 14 }))
      .sort((a, b) => b.amount - a.amount),
    sectionsMissingDates: sections.map((s) => s.name),
    hasSubContracts: subCount > 0,
    thu: {
      total: thuItems.reduce((s, i) => s + i.tien, 0),
      dated: thuItems.filter((i) => i.ngay).reduce((s, i) => s + i.tien, 0),
      undated: thuItems.filter((i) => !i.ngay).reduce((s, i) => s + i.tien, 0),
    },
    totals: {
      forecastOut: lines.reduce((s, l) => s + l.remaining, 0),
      actualOut: items.filter((i) => i.huong === "out" && i.loai !== "line").reduce((s, i) => s + i.tien, 0),
      in: thuItems.reduce((s, i) => s + i.tien, 0),
    },
    calendar,
  };
}

// ── Lịch công ty (bản tin dòng tiền) ─────────────────────────────────────────

export type CompanyCashCalendar = CashCalendar & {
  projects: { id: string; code: string; name: string; endDate: string; planStatus: BudgetPlanStatus | "none"; lines: number; chuaThiCong: boolean }[];
  overheadMonthly: number;
};

export async function buildCashCalendar(): Promise<CompanyCashCalendar> {
  const today = todayVn();
  const [cash, projects, overhead, plans] = await Promise.all([
    buildCashPlan(),
    prisma.project.findMany({
      where: { status: { not: ProjectStatus.completed } },
      select: { id: true, code: true, name: true, status: true, expectedEndDate: true, pipeline: { select: { stage: true } } },
      orderBy: { expectedEndDate: "asc" },
    }),
    prisma.companyOverheadItem.aggregate({ _sum: { monthlyAmount: true } }),
    prisma.projectCashPlan.findMany({ select: { projectId: true, status: true, _count: { select: { lines: true } } } }),
  ]);
  // SOP-16 (sếp 10/11/2026): dự án chưa sang GĐ 6 Thi công → máy KHÔNG tính kế hoạch (dòng dự báo + cục ngân sách).
  // Nguồn thật (đợt thu, đơn hàng, đợt thầu phụ, nợ) vẫn tính. Không có pipeline → theo status (planning = chưa thi công).
  const chuaThiCong = (p: (typeof projects)[number]) =>
    p.pipeline ? p.pipeline.stage <= 5 : p.status === ProjectStatus.planning;
  const projectIds = projects.filter((p) => !chuaThiCong(p)).map((p) => p.id);
  const projLabel = new Map(projects.map((p) => [p.id, `${p.code} · ${p.name}`]));
  const planMap = new Map(plans.map((p) => [p.projectId, p]));
  const [lines, ctx] = await Promise.all([reconcileLines(projectIds), loadCtx(null)]);
  const lineProj = await prisma.projectCashLine.findMany({ where: { id: { in: lines.map((l) => l.id) } }, select: { id: true, projectId: true } });
  const projectIdOf = new Map(lineProj.map((l) => [l.id, l.projectId]));

  // Nhãn dự án cho dòng cash-plan của dự án đã xong (vẫn còn nợ) — buildCashPlan đã có projectLabel.
  const items: CashItem[] = [
    ...rowsToItems(cash.out, "out", ctx),
    ...rowsToItems(cash.in, "in", ctx),
    ...(await orderedDebtItems(null, ctx, projLabel)),
    ...lineItems(lines, projLabel, projectIdOf, today),
  ];

  // Dự án chưa lập kế hoạch dòng tiền (dự toán cũ / chưa GĐ 5) → vẫn 1 cục "còn phải chi theo ngân sách" ở ngày bàn giao.
  let horizon = today;
  for (const p of projects) {
    if (chuaThiCong(p)) continue;
    const end = iso(p.expectedEndDate)!;
    horizon = maxIso(horizon, end)!;
    const pl = planMap.get(p.id);
    if (pl && pl._count.lines > 0) continue;
    const bp = await buildBudgetPlan(p.id);
    if (!bp.exists || bp.totals.remaining <= EPS) continue;
    items.push({
      k: `budget:${p.id}`, loai: "ro", huong: "out", ten: "Ngân sách còn phải chi (chưa lập kế hoạch dòng tiền)",
      phu: "tạm đặt ở ngày bàn giao — lập kế hoạch dòng tiền ở GĐ 5 để chia theo tuần", du_an: projLabel.get(p.id) ?? null,
      projectId: p.id, ngay: end, uoc: true, tien: bp.totals.remaining, src: null,
    });
  }

  // Chi phí chung hằng tháng (company_overhead_items) — ngày 5 mỗi tháng đến hết kỳ.
  const monthly = n(overhead._sum.monthlyAmount);
  if (monthly > EPS) {
    // Kéo chi phí chung tới hết kỳ lịch (kể cả đợt thu xa hơn ngày bàn giao), tối thiểu 60 ngày.
    let endForOh = maxIso(horizon, addDays(today, 60))!;
    for (const it of items) if (it.ngay) endForOh = maxIso(endForOh, it.ngay)!;
    let y = Number(today.slice(0, 4));
    let m = Number(today.slice(5, 7));
    for (;;) {
      const d = `${y}-${String(m).padStart(2, "0")}-05`;
      if (d > endForOh) break;
      if (d >= today) {
        items.push({
          k: `overhead:${d.slice(0, 7)}`, loai: "ro", huong: "out", ten: `Chi phí chung công ty · tháng ${m}/${y}`,
          phu: "lương VP, thuê, lãi, xe… (sửa ở Tài chính tổng quan)", du_an: null, projectId: null, ngay: d, uoc: true, tien: monthly, src: null,
        });
      }
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }

  const cal = lamLich(items, { today, horizonEnd: horizon, balance: cash.balance });
  return {
    ...cal,
    overheadMonthly: monthly,
    projects: projects.map((p) => {
      const pl = planMap.get(p.id);
      return { id: p.id, code: p.code, name: p.name, endDate: iso(p.expectedEndDate)!, planStatus: pl?.status ?? "none", lines: pl?._count.lines ?? 0, chuaThiCong: chuaThiCong(p) };
    }),
  };
}
