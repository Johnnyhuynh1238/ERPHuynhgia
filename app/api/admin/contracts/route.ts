import { NextResponse } from "next/server";
import { z } from "zod";
import { DesignContractStepKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

const STEP_KINDS: DesignContractStepKind[] = ["mat_bang", "mat_tien_3d", "noi_that", "shop_drawing"];

const CreateSchema = z.object({
  customerName: z.string().trim().min(1),
  customerPhone: z.string().trim().min(1).nullable().optional(),
  signedAt: z.string().min(8),
  totalValue: z.number().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

// Tạo HĐ thiết kế mới (cho phép thiếu SĐT/giá trị — màn sẽ đánh dấu "cần bổ sung")
export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON không hợp lệ" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  const { customerName, customerPhone, signedAt, totalValue, notes } = parsed.data;

  const contract = await prisma.designContract.create({
    data: {
      customerName,
      customerPhone: customerPhone ?? null,
      signedAt: new Date(signedAt),
      totalValue: totalValue ?? null,
      notes: notes ?? null,
      steps: { create: STEP_KINDS.map((kind) => ({ kind })) },
    },
    select: { id: true },
  });
  return NextResponse.json({ id: contract.id }, { status: 201 });
}

// Danh sách HĐ gộp: HĐ thiết kế (design_contracts) + HĐ thi công (projects),
// mỗi HĐ kèm thu/chi tính từ sổ quỹ. Dùng cho màn /admin/contracts.
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [designs, projects, cashByDesign, cashByProject] = await Promise.all([
    prisma.designContract.findMany({
      orderBy: { signedAt: "desc" },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        signedAt: true,
        totalValue: true,
        status: true,
        projectId: true,
        notes: true,
      },
    }),
    prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        name: true,
        customerName: true,
        contractValue: true,
        status: true,
      },
    }),
    prisma.cashTransaction.groupBy({
      by: ["designContractId", "direction"],
      where: { designContractId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.cashTransaction.groupBy({
      by: ["projectId", "direction"],
      where: { projectId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const dMap = new Map<string, { thu: number; chi: number }>();
  for (const r of cashByDesign) {
    if (!r.designContractId) continue;
    const cur = dMap.get(r.designContractId) ?? { thu: 0, chi: 0 };
    const amt = Number(r._sum.amount ?? 0);
    if (r.direction === "in") cur.thu += amt;
    else cur.chi += amt;
    dMap.set(r.designContractId, cur);
  }

  const pMap = new Map<string, { thu: number; chi: number }>();
  for (const r of cashByProject) {
    if (!r.projectId) continue;
    const cur = pMap.get(r.projectId) ?? { thu: 0, chi: 0 };
    const amt = Number(r._sum.amount ?? 0);
    if (r.direction === "in") cur.thu += amt;
    else cur.chi += amt;
    pMap.set(r.projectId, cur);
  }

  const designItems = designs.map((c) => {
    const f = dMap.get(c.id) ?? { thu: 0, chi: 0 };
    const reasons: string[] = [];
    if (!c.customerPhone) reasons.push("SĐT");
    if (c.totalValue == null) reasons.push("giá trị HĐ");
    return {
      id: c.id,
      type: "design" as const,
      typeLabel: "Thiết kế",
      title: c.customerName,
      subtitle: c.notes || "HĐ thiết kế",
      customerName: c.customerName,
      phone: c.customerPhone,
      code: null as string | null,
      value: c.totalValue != null ? Number(c.totalValue) : null,
      thu: f.thu,
      chi: f.chi,
      net: f.thu - f.chi,
      status: c.status,
      signedAt: c.signedAt.toISOString(),
      projectId: c.projectId,
      needsInfo: reasons.length > 0,
      needsInfoReasons: reasons,
      // "chưa vào thi công chính thức": HĐTK còn active và chưa gắn dự án thi công
      preConstruction: c.status === "active" && !c.projectId,
    };
  });

  const constructionItems = projects.map((p) => {
    const f = pMap.get(p.id) ?? { thu: 0, chi: 0 };
    const reasons: string[] = [];
    if (p.contractValue == null) reasons.push("giá trị HĐ");
    return {
      id: p.id,
      type: "construction" as const,
      typeLabel: "Thi công",
      title: p.name,
      subtitle: `HĐ thi công · ${p.code}`,
      customerName: p.customerName,
      phone: null as string | null,
      code: p.code,
      value: p.contractValue != null ? Number(p.contractValue) : null,
      thu: f.thu,
      chi: f.chi,
      net: f.thu - f.chi,
      status: p.status,
      signedAt: null as string | null,
      projectId: p.id,
      needsInfo: reasons.length > 0,
      needsInfoReasons: reasons,
      preConstruction: p.status === "planning",
    };
  });

  const items = [...designItems, ...constructionItems];
  const summary = {
    count: items.length,
    thu: items.reduce((s, i) => s + i.thu, 0),
    chi: items.reduce((s, i) => s + i.chi, 0),
    needsInfo: items.filter((i) => i.needsInfo).length,
    preConstruction: items.filter((i) => i.preConstruction).length,
  };

  return NextResponse.json({ items, summary });
}
