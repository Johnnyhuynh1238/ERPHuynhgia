import { prisma } from "@/lib/prisma";
import { BudgetPlanGroup } from "@prisma/client";
import { buildBudgetPlan } from "@/lib/budget-plan";

// Tiến độ thi công theo NGÂN SÁCH (budget-plan) — mỗi dòng ngân sách = 1 dòng tiến độ.
//  - amount = ngân sách đầy đủ của dòng (VT có hao hụt + NC).  → tổng khớp ngân sách dự án.
//  - bought = "đã mua thực tế" cho dòng đó = đã chi + công nợ (mua hàng/thầu phụ gắn dòng).
//  - Tiến độ % lưu ở estimate_task_progress refType="line", refId = ID dòng ngân sách (id ổn
//    định: PUT ngân sách upsert theo id, dòng gắn phần không xoá được). Dữ liệu cũ
//    refType="budget" (key TÊN) vẫn đọc làm dự phòng.
//  - Ngày DỰ KIẾN lấy từ PHẦN gắn bằng MÃ (line.section_id). KHÔNG khớp tên — tên dòng hay kèm
//    ghi chú "(Vĩnh Tường)", "(khách cấp …)" → lệch tên phần → mất khỏi timeline.
//  - PHẦN chưa có dòng ngân sách nào vẫn hiện (refType="section", ngân sách 0): khách cấp vật
//    tư thì vẫn phải thi công, tiến độ không được mất.
//  - % hạng mục KHÔNG kéo tay nữa: hạng mục có khối lượng (estimate_works cùng PHẦN) → % = số
//    KL đã xong theo trọng số giá trị khoán NC (qty×labor_price; thiếu giá thì đếm số dòng).
//    Mark done từng KL lưu refType="work", refId = id estimate_works. Hạng mục không có KL nào
//    → giữ nút Xong cả hạng mục (refType line/section như cũ).

const KIND_LABEL: Record<BudgetPlanGroup, string> = {
  tho: "Thô",
  hoan_thien: "Hoàn thiện",
  nhan_cong: "Nhân công",
  chung: "Chung",
};
const KIND_RANK: Record<BudgetPlanGroup, number> = {
  tho: 0,
  hoan_thien: 1,
  nhan_cong: 2,
  chung: 3,
};

export type ProgressWork = {
  id: string; // id estimate_works
  name: string;
  location: string | null;
  unit: string;
  quantity: number;
  weight: number; // tỉ trọng trong hạng mục (Σ = 1) — client tính lại % khi tick
  done: boolean;
};

export type ProgressTask = {
  refType: "line" | "section";
  refId: string; // id dòng ngân sách (line) / id phần (section — phần chưa có dòng NS)
  sectionId: string | null; // phần gắn (để set ngày dự kiến); null nếu dòng chưa gắn phần
  groupKey: string; // kind
  groupLabel: string;
  name: string;
  amount: number; // NGÂN SÁCH dòng
  bought: number; // đã mua thực tế = đã chi + công nợ
  percent: number; // 0..100 — tiến độ THỰC TẾ
  done: boolean;
  planStart: string | null;
  planEnd: string | null;
  works: ProgressWork[]; // khối lượng con (rỗng → mark done cả hạng mục)
};

export type EstimateProgress = {
  tasks: ProgressTask[];
  totalAmount: number;
  earnedPct: number; // Σ(percent×ngân sách)/Σngân sách
  uncataloged: number; // số VT chưa gắn phần (nhắc soát ở Dự toán)
};

export async function computeEstimateProgress(projectId: string): Promise<EstimateProgress> {
  const [budget, sections, progRows, uncataloged, workRows] = await Promise.all([
    buildBudgetPlan(projectId),
    prisma.projectSection.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, kind: true, planStart: true, planEnd: true },
    }),
    prisma.estimateTaskProgress.findMany({
      where: { projectId, refType: { in: ["line", "section", "budget", "work"] } },
      select: { refType: true, refId: true, percent: true, done: true },
    }),
    prisma.estimateDbMaterial.count({ where: { projectId, sectionId: null } }),
    prisma.estimateWork.findMany({
      where: { projectId, sectionId: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, sectionId: true, name: true, location: true, unit: true, quantity: true, laborPrice: true },
    }),
  ]);

  const progMap = new Map<string, { percent: number; done: boolean }>();
  for (const p of progRows) progMap.set(`${p.refType}|${p.refId}`, { percent: p.percent, done: p.done });

  // Khối lượng theo PHẦN + trọng số (giá trị khoán NC).
  const worksBySec = new Map<string, { w: ProgressWork; value: number }[]>();
  for (const r of workRows) {
    const qty = Number(r.quantity);
    const item = {
      w: {
        id: r.id,
        name: r.name,
        location: r.location,
        unit: r.unit,
        quantity: qty,
        weight: 0,
        done: progMap.get(`work|${r.id}`)?.done ?? false,
      },
      value: qty * Number(r.laborPrice),
    };
    const arr = worksBySec.get(r.sectionId!);
    if (arr) arr.push(item);
    else worksBySec.set(r.sectionId!, [item]);
  }
  // 1 PHẦN có thể gắn nhiều dòng NS → KL chỉ gắn vào dòng ĐẦU TIÊN của phần (khỏi đếm 2 lần).
  const worksTaken = new Set<string>();
  const takeWorks = (sectionId: string | null) => {
    if (!sectionId || worksTaken.has(sectionId)) return [];
    worksTaken.add(sectionId);
    return worksBySec.get(sectionId) ?? [];
  };
  // Tỉ trọng KL: theo giá trị khoán nếu dòng nào cũng có giá, không thì chia đều.
  for (const items of Array.from(worksBySec.values())) {
    const byValue = items.every((x) => x.value > 0);
    const tot = items.reduce((s, x) => s + (byValue ? x.value : 1), 0);
    for (const x of items) x.w.weight = tot > 0 ? (byValue ? x.value : 1) / tot : 0;
  }
  const pctFromWorks = (items: { w: ProgressWork }[]) =>
    Math.round(items.reduce((s, x) => s + (x.w.done ? x.w.weight : 0), 0) * 100);

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const secById = new Map(sections.map((x) => [x.id, x]));

  // Bỏ nhân công khoán (nhan_cong) khỏi tiến độ thi công — không phải tiến độ xây dựng.
  const lines = budget.lines.filter((l) => l.groupKind !== "nhan_cong");
  const tasks: ProgressTask[] = lines.map((l) => {
    const pr = progMap.get(`line|${l.id}`) ?? progMap.get(`budget|${l.name}`);
    const sec = l.sectionId ? secById.get(l.sectionId) : undefined;
    const ws = takeWorks(sec?.id ?? null);
    const pct = ws.length ? pctFromWorks(ws) : pr?.done ? 100 : (pr?.percent ?? 0);
    return {
      refType: "line" as const,
      refId: l.id,
      sectionId: sec?.id ?? null,
      groupKey: l.groupKind,
      groupLabel: KIND_LABEL[l.groupKind as BudgetPlanGroup] ?? "Khác",
      name: l.name,
      amount: l.budget,
      bought: l.spent + l.debt,
      percent: pct,
      done: ws.length ? ws.every((x) => x.w.done) : (pr?.done ?? false),
      planStart: iso(sec?.planStart ?? null),
      planEnd: iso(sec?.planEnd ?? null),
      works: ws.map((x) => x.w),
    };
  });

  // PHẦN chưa có dòng ngân sách nào gắn → vẫn là việc phải làm, thêm dòng ngân sách 0.
  const linked = new Set(lines.map((l) => l.sectionId).filter(Boolean));
  for (const sec of sections) {
    if (linked.has(sec.id) || sec.kind === "nhan_cong") continue;
    const pr = progMap.get(`section|${sec.id}`);
    const ws = takeWorks(sec.id);
    tasks.push({
      refType: "section",
      refId: sec.id,
      sectionId: sec.id,
      groupKey: sec.kind,
      groupLabel: KIND_LABEL[sec.kind as BudgetPlanGroup] ?? "Khác",
      name: sec.name,
      amount: 0,
      bought: 0,
      percent: ws.length ? pctFromWorks(ws) : pr?.done ? 100 : (pr?.percent ?? 0),
      done: ws.length ? ws.every((x) => x.w.done) : (pr?.done ?? false),
      planStart: iso(sec.planStart),
      planEnd: iso(sec.planEnd),
      works: ws.map((x) => x.w),
    });
  }

  // Sắp theo loại; giữ thứ tự dòng ngân sách (sortRank) trong từng loại.
  const idx = new Map(tasks.map((t, i) => [t, i]));
  tasks.sort(
    (a, b) =>
      (KIND_RANK[a.groupKey as BudgetPlanGroup] ?? 50) - (KIND_RANK[b.groupKey as BudgetPlanGroup] ?? 50) ||
      idx.get(a)! - idx.get(b)!,
  );

  const totalAmount = tasks.reduce((s, t) => s + t.amount, 0);
  const earned = tasks.reduce((s, t) => s + (t.percent / 100) * t.amount, 0);
  const earnedPct = totalAmount > 0 ? Math.round((earned / totalAmount) * 100) : 0;

  return { tasks, totalAmount, earnedPct, uncataloged };
}
