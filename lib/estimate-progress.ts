import { prisma } from "@/lib/prisma";

// Công tác tiến độ suy từ dự toán (flow mới):
//  - VT: gộp estimate_db_materials theo catalog_id (mỗi công tác GĐ-CT = 1 dòng), tiền = Σ SL×đơn giá.
//  - Khoán: mỗi estimate_db_khoan = 1 công tác trọn gói, tiền = value.
// Tiến độ lưu ở estimate_task_progress (percent 0..100 + done). Tổng = earned value theo tiền.

export type ProgressTask = {
  refType: "catalog" | "khoan";
  refId: string;
  phaseCode: string; // "01".."09" cho catalog; "KHOAN" cho khoán
  phaseName: string;
  taskCode: string; // "07-030" cho catalog; "" cho khoán
  name: string;
  amount: number; // tiền dự toán của công tác
  percent: number; // 0..100
  done: boolean;
};

export type EstimateProgress = {
  tasks: ProgressTask[];
  totalAmount: number;
  earnedPct: number; // Σ(percent×tiền)/Σtiền, làm tròn
  uncataloged: number; // số dòng VT chưa gắn công tác (không tính vào tiến độ)
};

const KHOAN_PHASE = "KHOAN";

export async function computeEstimateProgress(projectId: string): Promise<EstimateProgress> {
  const [mats, khoans, progRows] = await Promise.all([
    prisma.estimateDbMaterial.findMany({
      where: { projectId },
      select: {
        catalogId: true,
        quantity: true,
        unitPrice: true,
        catalog: { select: { phaseCode: true, taskCode: true, phaseName: true, taskName: true } },
      },
    }),
    prisma.estimateDbKhoan.findMany({
      where: { projectId },
      select: { id: true, name: true, value: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.estimateTaskProgress.findMany({
      where: { projectId },
      select: { refType: true, refId: true, percent: true, done: true },
    }),
  ]);

  const progMap = new Map<string, { percent: number; done: boolean }>();
  for (const p of progRows) progMap.set(`${p.refType}|${p.refId}`, { percent: p.percent, done: p.done });

  // Gộp VT theo công tác (catalog). Bỏ VT chưa gắn catalog (không thành công tác).
  const catMap = new Map<
    string,
    { phaseCode: string; phaseName: string; taskCode: string; taskName: string; amount: number }
  >();
  let uncataloged = 0;
  for (const m of mats) {
    if (!m.catalogId || !m.catalog) {
      uncataloged += 1;
      continue;
    }
    const amt = Number(m.quantity) * Number(m.unitPrice);
    const cur = catMap.get(m.catalogId);
    if (cur) cur.amount += amt;
    else
      catMap.set(m.catalogId, {
        phaseCode: m.catalog.phaseCode,
        phaseName: m.catalog.phaseName,
        taskCode: `${m.catalog.phaseCode}-${m.catalog.taskCode}`,
        taskName: m.catalog.taskName,
        amount: amt,
      });
  }

  const tasks: ProgressTask[] = [];
  for (const [refId, c] of Array.from(catMap)) {
    const pr = progMap.get(`catalog|${refId}`);
    tasks.push({
      refType: "catalog",
      refId,
      phaseCode: c.phaseCode,
      phaseName: c.phaseName,
      taskCode: c.taskCode,
      name: c.taskName,
      amount: c.amount,
      percent: pr?.percent ?? 0,
      done: pr?.done ?? false,
    });
  }
  for (const k of khoans) {
    const pr = progMap.get(`khoan|${k.id}`);
    tasks.push({
      refType: "khoan",
      refId: k.id,
      phaseCode: KHOAN_PHASE,
      phaseName: "Khoán trọn gói",
      taskCode: "",
      name: k.name,
      amount: Number(k.value),
      percent: pr?.percent ?? 0,
      done: pr?.done ?? false,
    });
  }

  // Sắp: GĐ tăng dần, khoán cuối; trong GĐ theo mã công tác.
  tasks.sort((a, b) => {
    if (a.phaseCode !== b.phaseCode) {
      if (a.phaseCode === KHOAN_PHASE) return 1;
      if (b.phaseCode === KHOAN_PHASE) return -1;
      return a.phaseCode < b.phaseCode ? -1 : 1;
    }
    return a.taskCode < b.taskCode ? -1 : a.taskCode > b.taskCode ? 1 : 0;
  });

  const totalAmount = tasks.reduce((s, t) => s + t.amount, 0);
  const earned = tasks.reduce((s, t) => s + (t.percent / 100) * t.amount, 0);
  const earnedPct = totalAmount > 0 ? Math.round((earned / totalAmount) * 100) : 0;

  return { tasks, totalAmount, earnedPct, uncataloged };
}
