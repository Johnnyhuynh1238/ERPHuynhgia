// Đọc / nạp thư viện Kỹ thuật thi công (server). Bảng trống lần đầu → nạp bộ mẫu gốc.
import { prisma } from "./prisma";
import { DEFAULT_TECHNIQUES, parseTasks, type CtPhase, type CtTechnique } from "./construction-technique";

export type CtRow = CtTechnique & { id: string; updatedAt: string };

export async function ensureTechniquesSeeded() {
  const n = await prisma.constructionTechnique.count();
  if (n > 0) return;
  await prisma.constructionTechnique.createMany({
    data: DEFAULT_TECHNIQUES.map((d) => ({ ...d, tasks: d.tasks })),
    skipDuplicates: true,
  });
}

export async function loadTechniques(opts: { includeInactive?: boolean } = {}): Promise<CtRow[]> {
  await ensureTechniquesSeeded();
  const rows = await prisma.constructionTechnique.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    phase: (r.phase === "ht" ? "ht" : "tho") as CtPhase,
    matchKeywords: r.matchKeywords,
    vtKeywords: r.vtKeywords,
    standards: r.standards,
    note: r.note,
    tasks: parseTasks(r.tasks),
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
