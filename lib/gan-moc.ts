/**
 * Gán mốc (GĐ5 Chuẩn bị thi công, 02/11/2026): nối CÔNG TÁC tiến độ (estimate_works) với
 *  - mốc nghiệm thu (acceptance_milestones.work_ids): ĐẾN HẠN khi mọi công tác gắn đã xong;
 *  - đợt thu chủ nhà (payment_schedules.work_ids/milestone_ids/work_pct_required): ĐỦ ĐIỀU KIỆN THU
 *    khi công tác gắn xong ≥ % yêu cầu (theo giá trị khoán NC) + mốc NT chủ nhà gắn đã ký.
 * KS tick xong từng công tác ở Báo cáo tiến độ (estimate_task_progress refType="work") → ERP tự biết.
 * Gợi ý gán (suggest*) chỉ dựa tên công tác — Phòng Dự án soát rồi bấm Lưu, không tự ghi.
 */
import { prisma } from "@/lib/prisma";

export type GmWork = {
  id: string;
  name: string;
  sectionId: string | null;
  sectionName: string;
  value: number; // qty × đơn giá khoán NC (trọng số)
  done: boolean;
  doneAt: string | null; // ISO — lúc KS tick xong
};

export type MilestoneState = "da_ky" | "chua_gan" | "den_han" | "dang_lam" | "chua_toi";
export type MilestoneReadiness = {
  state: MilestoneState;
  done: number;
  total: number;
  dueSince: string | null; // ISO ngày công tác cuối cùng xong (đến hạn từ lúc này)
};

export type PaymentState = "da_thu" | "chua_gan" | "du_dieu_kien" | "chua_du";
export type PaymentReadiness = {
  state: PaymentState;
  pct: number; // % công tác gắn đã xong (theo giá trị khoán)
  pctRequired: number;
  worksLeft: string[]; // tên công tác gắn chưa xong
  milestonesLeft: string[]; // mốc NT chủ nhà gắn chưa ký
  readySince: string | null;
};

export const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = {
  da_ky: "Đã ký",
  chua_gan: "Chưa gán công tác",
  den_han: "Đến hạn nghiệm thu",
  dang_lam: "Đang làm",
  chua_toi: "Chưa tới",
};

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  da_thu: "Đã thu",
  chua_gan: "Chưa gán công tác",
  du_dieu_kien: "Đủ điều kiện thu",
  chua_du: "Chưa đủ điều kiện",
};

/** Công tác tiến độ + trạng thái xong của nhiều dự án (key = projectId). */
export async function loadGmWorks(projectIds: string[]): Promise<Map<string, GmWork[]>> {
  const out = new Map<string, GmWork[]>();
  if (!projectIds.length) return out;
  const [works, sections, prog] = await Promise.all([
    prisma.estimateWork.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, projectId: true, sectionId: true, name: true, quantity: true, laborPrice: true },
    }),
    prisma.projectSection.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, name: true, sortOrder: true },
    }),
    prisma.estimateTaskProgress.findMany({
      where: { projectId: { in: projectIds }, refType: "work", done: true },
      select: { refId: true, updatedAt: true },
    }),
  ]);
  const secById = new Map(sections.map((s) => [s.id, s]));
  const doneAt = new Map(prog.map((p) => [p.refId, p.updatedAt.toISOString()]));
  const rows = works
    .map((w) => ({ w, rank: w.sectionId ? (secById.get(w.sectionId)?.sortOrder ?? 9999) : 99999 }))
    .sort((a, b) => a.rank - b.rank);
  for (const { w } of rows) {
    const item: GmWork = {
      id: w.id,
      name: w.name,
      sectionId: w.sectionId,
      sectionName: (w.sectionId && secById.get(w.sectionId)?.name) || "Chưa gắn phần",
      value: Number(w.quantity) * Number(w.laborPrice),
      done: doneAt.has(w.id),
      doneAt: doneAt.get(w.id) ?? null,
    };
    const arr = out.get(w.projectId);
    if (arr) arr.push(item);
    else out.set(w.projectId, [item]);
  }
  return out;
}

const maxIso = (xs: (string | null)[]) => xs.reduce<string | null>((m, x) => (x && (!m || x > m) ? x : m), null);

export function milestoneReadiness(
  m: { status: string; workIds: string[] },
  worksById: Map<string, GmWork>,
): MilestoneReadiness {
  const ws = m.workIds.map((id) => worksById.get(id)).filter((w): w is GmWork => !!w);
  const done = ws.filter((w) => w.done).length;
  const base = { done, total: ws.length, dueSince: null as string | null };
  if (m.status === "signed") return { ...base, state: "da_ky" };
  if (!ws.length) return { ...base, state: "chua_gan" };
  if (done === ws.length) return { ...base, state: "den_han", dueSince: maxIso(ws.map((w) => w.doneAt)) };
  return { ...base, state: done > 0 ? "dang_lam" : "chua_toi" };
}

/** % xong theo giá trị khoán (thiếu giá ở 1 dòng → đếm số dòng). */
export function worksDonePct(ws: GmWork[]): number {
  if (!ws.length) return 0;
  const byValue = ws.every((w) => w.value > 0);
  const tot = ws.reduce((s, w) => s + (byValue ? w.value : 1), 0);
  const got = ws.reduce((s, w) => s + (w.done ? (byValue ? w.value : 1) : 0), 0);
  return tot > 0 ? Math.floor((got / tot) * 100) : 0;
}

export function paymentReadiness(
  p: { status: string; workIds: string[]; milestoneIds: string[]; workPctRequired: number },
  worksById: Map<string, GmWork>,
  msById: Map<string, { title: string; status: string; signedAt: Date | null }>,
): PaymentReadiness {
  const ws = p.workIds.map((id) => worksById.get(id)).filter((w): w is GmWork => !!w);
  const ms = p.milestoneIds.map((id) => msById.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
  const pct = worksDonePct(ws);
  const pctRequired = Math.min(100, Math.max(1, p.workPctRequired || 100));
  const base = {
    pct,
    pctRequired,
    worksLeft: ws.filter((w) => !w.done).map((w) => w.name),
    milestonesLeft: ms.filter((m) => m.status !== "signed").map((m) => m.title),
    readySince: null as string | null,
  };
  if (p.status === "collected") return { ...base, state: "da_thu" };
  if (!ws.length && !ms.length) return { ...base, state: "chua_gan" };
  if (pct >= pctRequired && !base.milestonesLeft.length) {
    const since = maxIso([
      ...(pctRequired >= 100 ? ws.map((w) => w.doneAt) : []),
      ...ms.map((m) => m.signedAt?.toISOString() ?? null),
    ]);
    return { ...base, state: "du_dieu_kien", readySince: since };
  }
  return { ...base, state: "chua_du" };
}

/** Readiness mốc nghiệm thu của nhiều dự án (key = milestoneId). */
export async function loadMilestoneReadiness(projectIds: string[]): Promise<Map<string, MilestoneReadiness>> {
  const out = new Map<string, MilestoneReadiness>();
  if (!projectIds.length) return out;
  const [worksByProject, ms] = await Promise.all([
    loadGmWorks(projectIds),
    prisma.acceptanceMilestone.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, status: true, workIds: true },
    }),
  ]);
  const worksById = new Map(Array.from(worksByProject.values()).flat().map((w) => [w.id, w]));
  for (const m of ms) out.set(m.id, milestoneReadiness(m, worksById));
  return out;
}

/** Readiness đợt thu của 1 dự án (key = paymentScheduleId). */
export async function loadPaymentReadiness(projectId: string): Promise<Map<string, PaymentReadiness>> {
  const [worksByProject, ms, ps] = await Promise.all([
    loadGmWorks([projectId]),
    prisma.acceptanceMilestone.findMany({
      where: { projectId },
      select: { id: true, title: true, status: true, signedAt: true },
    }),
    prisma.paymentSchedule.findMany({
      where: { projectId },
      select: { id: true, status: true, workIds: true, milestoneIds: true, workPctRequired: true },
    }),
  ]);
  const worksById = new Map((worksByProject.get(projectId) ?? []).map((w) => [w.id, w]));
  const msById = new Map(ms.map((m) => [m.id, m]));
  return new Map(ps.map((p) => [p.id, paymentReadiness(p, worksById, msById)]));
}

// ───────── Gợi ý gán (theo tên công tác) ─────────
// Nhóm 1–14 = 14 mục Bộ tài liệu giám sát (= seq mốc chủ nhà, = "Nhóm N." trong mô tả NT đội khoán).
// Regex chọn công tác mà XONG thì nhóm đó đến hạn nghiệm thu.
const GROUP_WORK_RE: Record<number, RegExp | null> = {
  1: null,
  2: /đào|lót|móng (đơn|băng|bè|cọc)|bê tông móng|cổ cột/i,
  3: /giằng|dầm móng|đà kiềng|tường móng/i,
  4: /bể phốt|bể tự hoại|hố ga/i,
  5: /đắp|tôn nền|bê tông nền|nền btct/i,
  6: /bê tông cột|cột tầng|dầm|sàn mái|sàn tầng|lanh tô/i,
  7: /^xây tường (?!móng)|tường bao|tường ngăn/i,
  8: /thi công điện|cấp thoát nước|âm tường|ống đồng/i,
  9: /^trát|tô tường/i,
  10: /chống thấm|tạo dốc/i,
  11: /lát|ốp gạch|ốp len|cán nền/i,
  12: /sơn|bả/i,
  13: /thiết bị|tbvs|bồn nước|máy bơm|thi công điện/i,
  14: /vệ sinh công nghiệp|bàn giao/i,
};

/** Nhóm của mốc: chủ nhà = seq; đội khoán = "Nhóm N." trong mô tả. */
export function milestoneGroup(m: { kind: string; seq: number; description: string | null }): number | null {
  if (m.kind === "chu_nha") return m.seq >= 1 && m.seq <= 14 ? m.seq : null;
  const g = /Nhóm (\d+)\./.exec(m.description ?? "");
  return g ? Number(g[1]) : null;
}

// Tên công tác dự toán hay gộp nhiều vị trí ("BT lót móng, giằng", "BT sàn + dầm mái + giằng tường mái")
// → loại chéo để công tác chỉ rơi vào đúng nhóm.
const GROUP_EXCLUDE: Record<number, RegExp> = {
  2: /dầm móng|giằng|bể phốt|hố ga/i,
  3: /đào|lót|mái|sàn|^xây (?!tường móng)/i,
  4: /lót|đào/i,
  6: /móng|chống thấm|láng|tạo dốc/i,
  10: /bể phốt|hố ga/i,
};

function matchGroup(group: number, w: GmWork): boolean {
  const re = GROUP_WORK_RE[group];
  if (!re || !re.test(w.name)) return false;
  const ex = GROUP_EXCLUDE[group];
  if (!ex || !ex.test(w.name)) return true;
  return group === 2 && /lót|đào/i.test(w.name); // "BT lót móng, giằng", "Đào đất hố móng, dầm móng" vẫn thuộc Móng
}

export function suggestMilestoneWorks(
  m: { kind: string; seq: number; title?: string; description: string | null },
  works: GmWork[],
): string[] {
  const g = milestoneGroup(m);
  if (!g) return [];
  const all = works.filter((w) => matchGroup(g, w));
  const t = m.kind === "thau_phu" ? (m.title ?? "") : "";
  // NT đội khoán riêng bước đào / lót (phần ngầm) → chỉ công tác đó (dự toán hay gộp đào/lót nhiều vị trí).
  if (g <= 5 && /đào/i.test(t)) return works.filter((w) => /đào/i.test(w.name)).map((w) => w.id);
  if (g <= 5 && /lót/i.test(t)) return works.filter((w) => /lót|đào/i.test(w.name)).map((w) => w.id);
  if (g === 13 && t) {
    const dien = /điện|đèn|ổ cắm|công tắc|tiếp địa/i.test(t);
    const sub = all.filter((w) => /điện/i.test(w.name) === dien);
    if (sub.length) return sub.map((w) => w.id);
  }
  return all.map((w) => w.id);
}

// Đợt thu: từ khoá điều kiện trong HĐ → nhóm/công tác.
const PAY_RULES: { re: RegExp; groups: number[]; workRe?: RegExp }[] = [
  { re: /móng/i, groups: [2] },
  { re: /đà kiềng|giằng|dầm móng/i, groups: [3] },
  { re: /\bcột\b/i, groups: [], workRe: /bê tông cột|cột tầng/i },
  { re: /sàn|dầm/i, groups: [6] },
  { re: /tường bao/i, groups: [], workRe: /xây tường 200|tường bao/i },
  { re: /xây tô|xây tường/i, groups: [7] },
  { re: /tô trát|xây tô/i, groups: [9] },
  { re: /mái|kèo|xà gồ/i, groups: [], workRe: /mái tôn|vì kèo|xà gồ|lợp mái/i },
  { re: /ốp lát/i, groups: [11] },
  { re: /sơn/i, groups: [12] },
];

export function suggestPayment(
  p: { milestoneDescription: string },
  works: GmWork[],
  chuNhaMs: { id: string; seq: number }[],
): { workIds: string[]; milestoneIds: string[]; workPctRequired: number } {
  const d = p.milestoneDescription;
  const pctM = /(\d{1,3})\s*%/.exec(d);
  const workPctRequired = pctM ? Math.min(100, Number(pctM[1])) : 100;
  if (/đặt cọc|ký hợp đồng|bảo hành/i.test(d)) return { workIds: [], milestoneIds: [], workPctRequired: 100 };
  if (/bàn giao|hoàn thiện nhà/i.test(d)) {
    const last = chuNhaMs.find((m) => m.seq === 14);
    return { workIds: works.map((w) => w.id), milestoneIds: last ? [last.id] : [], workPctRequired: 100 };
  }
  const ids = new Set<string>();
  for (const r of PAY_RULES) {
    if (!r.re.test(d)) continue;
    for (const w of works) {
      if (r.groups.some((g) => matchGroup(g, w)) || (r.workRe && r.workRe.test(w.name))) ids.add(w.id);
    }
  }
  return { workIds: works.filter((w) => ids.has(w.id)).map((w) => w.id), milestoneIds: [], workPctRequired };
}
