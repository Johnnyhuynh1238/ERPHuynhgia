import { prisma } from "@/lib/prisma";
import { BudgetPlanGroup } from "@prisma/client";
import { buildBudgetPlan } from "@/lib/budget-plan";

// Tiến độ thi công theo NGÂN SÁCH (budget-plan) — mỗi dòng ngân sách = 1 dòng tiến độ.
//  - amount = ngân sách đầy đủ của dòng (VT có hao hụt + NC).  → tổng khớp ngân sách dự án.
//  - bought = "đã mua thực tế" cho dòng đó = đã chi + công nợ (mua hàng/thầu phụ gắn dòng).
//  - Tiến độ % lưu ở estimate_task_progress refType="budget", refId = TÊN dòng (id dòng ngân
//    sách đổi mỗi lần sửa NS nên KHÔNG key theo id — key theo tên cho ổn định).
//  - Ngày DỰ KIẾN (plan_start/end) lấy từ project_sections khớp TÊN (dòng NC không có → null).

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

export type ProgressTask = {
  refType: "budget";
  refId: string; // = tên dòng ngân sách (khoá ổn định)
  sectionId: string | null; // section khớp tên (để set ngày dự kiến); null nếu ko có
  groupKey: string; // kind
  groupLabel: string;
  name: string;
  amount: number; // NGÂN SÁCH dòng
  bought: number; // đã mua thực tế = đã chi + công nợ
  percent: number; // 0..100 — tiến độ THỰC TẾ
  done: boolean;
  planStart: string | null;
  planEnd: string | null;
};

export type EstimateProgress = {
  tasks: ProgressTask[];
  totalAmount: number;
  earnedPct: number; // Σ(percent×ngân sách)/Σngân sách
  uncataloged: number; // số VT chưa gắn phần (nhắc soát ở Dự toán)
};

export async function computeEstimateProgress(projectId: string): Promise<EstimateProgress> {
  const [budget, sections, progRows, uncataloged] = await Promise.all([
    buildBudgetPlan(projectId),
    prisma.projectSection.findMany({
      where: { projectId },
      select: { id: true, name: true, planStart: true, planEnd: true },
    }),
    prisma.estimateTaskProgress.findMany({
      where: { projectId, refType: "budget" },
      select: { refId: true, percent: true, done: true },
    }),
    prisma.estimateDbMaterial.count({ where: { projectId, sectionId: null } }),
  ]);

  const progMap = new Map<string, { percent: number; done: boolean }>();
  for (const p of progRows) progMap.set(p.refId, { percent: p.percent, done: p.done });

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  // Map TÊN phần → section (ngày dự kiến). Tên trùng nhau lấy phần đầu.
  const secByName = new Map<string, { id: string; planStart: Date | null; planEnd: Date | null }>();
  for (const s of sections) if (!secByName.has(s.name)) secByName.set(s.name, s);

  const tasks: ProgressTask[] = budget.lines.map((l) => {
    const pr = progMap.get(l.name);
    const sec = secByName.get(l.name);
    return {
      refType: "budget" as const,
      refId: l.name,
      sectionId: sec?.id ?? null,
      groupKey: l.groupKind,
      groupLabel: KIND_LABEL[l.groupKind as BudgetPlanGroup] ?? "Khác",
      name: l.name,
      amount: l.budget,
      bought: l.spent + l.debt,
      percent: pr?.percent ?? 0,
      done: pr?.done ?? false,
      planStart: iso(sec?.planStart ?? null),
      planEnd: iso(sec?.planEnd ?? null),
    };
  });

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
