import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { BudgetCategory, BudgetPhase, BudgetStatus, BudgetStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canEditBudget, recomputeBudgetTotals } from "@/lib/project-budget";
import { logProjectActivity } from "@/lib/project-activity-log";
import { STAGE_ORDER } from "@/lib/budget-suggested-components";

const VALID_STAGES = new Set<string>(STAGE_ORDER);

type ParsedRow = {
  rowNum: number;
  stage: BudgetStage;
  componentName: string;
  normCode: string | null;
  name: string;
  unit: string;
  quantity: number;
  vt: number;
  nc: number;
  mm: number;
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!canEditBudget({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Chỉ TPTC/admin được import dự toán" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Thiếu file Excel" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ message: "File quá lớn (>10MB)" }, { status: 413 });
  }

  const arrayBuf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arrayBuf);
  } catch {
    return NextResponse.json({ message: "Không đọc được file (định dạng không hợp lệ)" }, { status: 400 });
  }

  const ws = wb.getWorksheet("KHỐI LƯỢNG");
  if (!ws) {
    return NextResponse.json({ message: 'Không tìm thấy sheet "KHỐI LƯỢNG" trong file' }, { status: 400 });
  }

  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // header
    const stage = (cellStr(row.getCell(2)) || "").toUpperCase();
    const compName = cellStr(row.getCell(3));
    if (!stage && !compName) return; // empty row

    if (!VALID_STAGES.has(stage)) {
      errors.push(`Dòng ${rowNum}: Giai đoạn "${stage}" không hợp lệ (chọn 1 trong ${STAGE_ORDER.join(", ")})`);
      return;
    }
    if (!compName) {
      errors.push(`Dòng ${rowNum}: Thiếu Cấu kiện (cột C)`);
      return;
    }
    const normCode = cellStr(row.getCell(4)) || null;
    const name = cellStr(row.getCell(5)) || normCode || "";
    if (!name) {
      errors.push(`Dòng ${rowNum}: Thiếu Tên công tác (cột E) và Mã ĐM (cột D)`);
      return;
    }
    const unit = cellStr(row.getCell(6));
    if (!unit) {
      errors.push(`Dòng ${rowNum}: Thiếu Đơn vị (cột F)`);
      return;
    }
    const qty = cellNum(row.getCell(7));
    if (!(qty > 0)) {
      errors.push(`Dòng ${rowNum}: Khối lượng phải > 0 (cột G)`);
      return;
    }
    const vt = cellNum(row.getCell(8));
    const nc = cellNum(row.getCell(9));
    const mm = cellNum(row.getCell(10));

    rows.push({
      rowNum, stage: stage as BudgetStage, componentName: compName, normCode,
      name, unit, quantity: qty,
      vt: Math.round(vt), nc: Math.round(nc), mm: Math.round(mm),
    });
  });

  if (errors.length > 0) {
    return NextResponse.json({ message: "File có lỗi", errors }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ message: "Không có dòng dữ liệu hợp lệ trong sheet KHỐI LƯỢNG" }, { status: 400 });
  }

  // Validate norm codes
  const refNormCodes = Array.from(new Set(rows.map((r) => r.normCode).filter((c): c is string => !!c)));
  if (refNormCodes.length > 0) {
    const found = await prisma.norm.findMany({
      where: { code: { in: refNormCodes } },
      select: { code: true },
    });
    const foundSet = new Set(found.map((n) => n.code));
    const missing = refNormCodes.filter((c) => !foundSet.has(c));
    if (missing.length > 0) {
      return NextResponse.json(
        { message: `Mã ĐM không tồn tại: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5} mã khác)` : ""}` },
        { status: 400 },
      );
    }
  }

  // Check existing budget — lock check + WorkOrder block
  const existing = await prisma.projectBudget.findUnique({
    where: { projectId: params.id },
    include: { items: { select: { id: true } } },
  });
  if (existing?.status === BudgetStatus.locked) {
    return NextResponse.json({ message: "Dự toán đã chốt, không thể import" }, { status: 409 });
  }
  if (existing && existing.items.length > 0) {
    const woCount = await prisma.workOrder.count({
      where: { budgetItemId: { in: existing.items.map((i) => i.id) } },
    });
    if (woCount > 0) {
      return NextResponse.json(
        { message: `Budget hiện có ${woCount} phiếu giao việc — không thể ghi đè. Xoá phiếu giao việc trước khi import.` },
        { status: 409 },
      );
    }
  }

  // Group components by (stage, name)
  const compKey = (s: string, n: string) => `${s}__${n.toLowerCase().trim()}`;
  const componentDefs = new Map<string, { stage: BudgetStage; name: string; sortOrder: number }>();
  let compSort = 0;
  for (const r of rows) {
    const k = compKey(r.stage, r.componentName);
    if (!componentDefs.has(k)) {
      componentDefs.set(k, { stage: r.stage, name: r.componentName.trim(), sortOrder: compSort++ });
    }
  }

  // Execute replacement
  const result = await prisma.$transaction(async (tx) => {
    // Wipe existing items + components
    if (existing) {
      await tx.projectBudgetItem.deleteMany({ where: { budgetId: existing.id } });
    }
    await tx.projectComponent.deleteMany({ where: { projectId: params.id } });

    // Ensure budget
    const budget = existing
      ? await tx.projectBudget.update({
          where: { id: existing.id },
          data: {
            totalLabor: BigInt(0),
            totalMaterial: BigInt(0),
            totalEquipment: BigInt(0),
            totalAmount: BigInt(0),
          },
        })
      : await tx.projectBudget.create({
          data: {
            projectId: params.id,
            createdById: user.id,
            totalLabor: BigInt(0),
            totalMaterial: BigInt(0),
            totalEquipment: BigInt(0),
            totalAmount: BigInt(0),
          },
        });

    // Create components
    const compIdByKey = new Map<string, string>();
    const compEntries = Array.from(componentDefs.entries());
    for (const [k, def] of compEntries) {
      const created = await tx.projectComponent.create({
        data: {
          projectId: params.id,
          stage: def.stage,
          name: def.name,
          sortOrder: def.sortOrder,
        },
      });
      compIdByKey.set(k, created.id);
    }

    // Create items
    let sortRank = 0;
    let createdCount = 0;
    for (const r of rows) {
      const componentId = compIdByKey.get(compKey(r.stage, r.componentName))!;
      const laborAmount = Math.round(r.quantity * r.nc);
      const materialAmount = Math.round(r.quantity * r.vt);
      const equipmentAmount = Math.round(r.quantity * r.mm);
      const amount = laborAmount + materialAmount + equipmentAmount;

      await tx.projectBudgetItem.create({
        data: {
          budgetId: budget.id,
          componentId,
          stage: r.stage,
          category: BudgetCategory.labor,
          phase: BudgetPhase.mong,
          phaseCode: "02",
          name: r.name,
          unit: r.unit,
          quantity: new Prisma.Decimal(r.quantity),
          unitPrice: BigInt(r.nc),
          amount: BigInt(amount),
          laborUnitPrice: BigInt(r.nc),
          laborAmount: BigInt(laborAmount),
          materialUnitPrice: BigInt(r.vt),
          materialAmount: BigInt(materialAmount),
          equipmentUnitPrice: BigInt(r.mm),
          equipmentAmount: BigInt(equipmentAmount),
          sortRank: sortRank++,
          normCode: r.normCode,
        },
      });
      createdCount++;
    }

    await recomputeBudgetTotals(tx, budget.id);
    return { budgetId: budget.id, createdCount, componentCount: componentDefs.size };
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "project_budget",
    entityId: result.budgetId,
    action: "update",
    summary: `Import Excel dự toán: ${result.componentCount} cấu kiện, ${result.createdCount} công tác`,
    metadata: { componentCount: result.componentCount, itemCount: result.createdCount },
  });

  return NextResponse.json({
    ok: true,
    componentCount: result.componentCount,
    itemCount: result.createdCount,
  });
}

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "text" in v && typeof (v as { text: unknown }).text === "string") {
    return (v as { text: string }).text.trim();
  }
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    return r == null ? "" : String(r).trim();
  }
  return String(v).trim();
}

function cellNum(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
    if (typeof r === "string") {
      const n = Number(r.replace(/[,\s]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}
