import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

const KHOAN_GROUP_NAME = "Khoán";

// GET: cây nhóm → hạng mục → công tác (section=kl) kèm VT con (section=vt) + danh sách khoán (section=khoan)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const groups = await prisma.estimateGroup.findMany({
    where: { projectId: params.id },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          lines: {
            orderBy: { sortOrder: "asc" },
            include: {
              norm: { select: { name: true, unit: true } },
              materialPrice: { select: { id: true, name: true, unit: true } },
            },
          },
        },
      },
    },
  });

  const mapVt = (l: (typeof groups)[number]["items"][number]["lines"][number]) => ({
    id: l.id,
    name: l.name,
    unit: l.unit,
    quantity: Number(l.quantity),
    directUnitPrice: l.directUnitPrice != null ? Number(l.directUnitPrice) : null,
    note: l.note,
    materialPriceId: l.materialPriceId,
    materialPriceName: l.materialPrice?.name ?? null,
  });

  const outGroups: {
    id: string;
    name: string;
    isKhoan: boolean;
    items: unknown[];
  }[] = [];
  const khoan: unknown[] = [];

  for (const g of groups) {
    const isKhoan = g.name === KHOAN_GROUP_NAME;
    const items = g.items.map((it) => {
      const all = it.lines;
      const vtByParent = new Map<string, ReturnType<typeof mapVt>[]>();
      for (const l of all) {
        if (l.section === "vt" && l.parentLineId) {
          const arr = vtByParent.get(l.parentLineId) ?? [];
          arr.push(mapVt(l));
          vtByParent.set(l.parentLineId, arr);
        }
      }
      // dòng khoán gom riêng
      for (const l of all) {
        if (l.section === "khoan") {
          khoan.push({
            id: l.id,
            name: l.name,
            unit: l.unit,
            quantity: Number(l.quantity),
            directUnitPrice: l.directUnitPrice != null ? Number(l.directUnitPrice) : null,
            khoanGroup: l.khoanGroup ?? "khac",
            note: l.note,
          });
        }
      }
      return {
        id: it.id,
        name: it.name,
        status: it.status,
        qaThread: it.qaThread,
        lines: all
          .filter((l) => l.section === "kl")
          .map((l) => ({
            id: l.id,
            normCode: l.normCode,
            normName: l.norm?.name ?? null,
            name: l.name,
            unit: l.unit,
            formula: l.formula,
            quantity: Number(l.quantity),
            status: l.status,
            aiQuestion: l.aiQuestion,
            aiAnswer: l.aiAnswer,
            fixRequest: l.fixRequest,
            note: l.note,
            vtChildren: vtByParent.get(l.id) ?? [],
          })),
      };
    });
    if (!isKhoan) outGroups.push({ id: g.id, name: g.name, isKhoan, items });
  }

  return NextResponse.json({ groups: outGroups, khoan });
}

// POST: tạo dòng tay (không auto)
//   {kind:"vt", parentLineId, name, unit, quantity?, directUnitPrice?, note?, materialPriceId?}
//   {kind:"khoan", khoanGroup:"nc"|"khac", name, unit, quantity?, directUnitPrice?, note?}
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  const name = String(body.name ?? "").trim();
  const unit = String(body.unit ?? "").trim();
  if (!name) return NextResponse.json({ message: "Thiếu tên" }, { status: 400 });
  if (!unit) return NextResponse.json({ message: "Thiếu đơn vị" }, { status: 400 });

  const qty = body.quantity == null || body.quantity === "" ? 0 : Number(body.quantity);
  if (!Number.isFinite(qty) || qty < 0) return NextResponse.json({ message: "Khối lượng không hợp lệ" }, { status: 400 });

  let directUnitPrice: number | null = null;
  if (body.directUnitPrice != null && body.directUnitPrice !== "") {
    const p = Math.round(Number(body.directUnitPrice));
    if (!Number.isFinite(p) || p < 0) return NextResponse.json({ message: "Đơn giá không hợp lệ" }, { status: 400 });
    directUnitPrice = p;
  }
  const note = String(body.note ?? "").trim() || null;

  if (kind === "cong-tac") {
    const itemId = String(body.itemId ?? "").trim();
    const item = await prisma.estimateItem.findFirst({
      where: { id: itemId, group: { projectId: params.id } },
      select: { id: true },
    });
    if (!item) return NextResponse.json({ message: "Không tìm thấy hạng mục" }, { status: 400 });
    const last = await prisma.estimateLine.aggregate({ where: { itemId }, _max: { sortOrder: true } });
    const line = await prisma.estimateLine.create({
      data: {
        itemId,
        section: "kl",
        name,
        unit,
        quantity: qty,
        formula: String(body.formula ?? "").trim() || null,
        note,
        status: "edited",
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: line.id });
  }

  if (kind === "vt") {
    const parentId = String(body.parentLineId ?? "").trim();
    const parent = await prisma.estimateLine.findUnique({ where: { id: parentId }, select: { id: true, itemId: true } });
    if (!parent) return NextResponse.json({ message: "Không tìm thấy công tác" }, { status: 400 });
    // kiểm tra công tác thuộc dự án này
    const item = await prisma.estimateItem.findFirst({
      where: { id: parent.itemId, group: { projectId: params.id } },
      select: { id: true },
    });
    if (!item) return NextResponse.json({ message: "Công tác không thuộc dự án" }, { status: 400 });

    let materialPriceId: string | null = null;
    if (body.materialPriceId) {
      const mp = await prisma.materialPrice.findUnique({ where: { id: String(body.materialPriceId) }, select: { id: true } });
      if (mp) materialPriceId = mp.id;
    }
    const last = await prisma.estimateLine.aggregate({ where: { itemId: parent.itemId }, _max: { sortOrder: true } });
    const line = await prisma.estimateLine.create({
      data: {
        itemId: parent.itemId,
        parentLineId: parent.id,
        section: "vt",
        name,
        unit,
        quantity: qty,
        directUnitPrice,
        materialPriceId,
        note,
        status: "edited",
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: line.id });
  }

  if (kind === "khoan") {
    const khoanGroup = body.khoanGroup === "nc" ? "nc" : "khac";
    // đảm bảo có nhóm + hạng mục "Khoán" cho dự án
    let group = await prisma.estimateGroup.findFirst({
      where: { projectId: params.id, name: KHOAN_GROUP_NAME },
      select: { id: true },
    });
    if (!group) {
      const lastG = await prisma.estimateGroup.aggregate({ where: { projectId: params.id }, _max: { sortOrder: true } });
      group = await prisma.estimateGroup.create({
        data: { projectId: params.id, name: KHOAN_GROUP_NAME, sortOrder: (lastG._max.sortOrder ?? 0) + 1 },
        select: { id: true },
      });
    }
    let item = await prisma.estimateItem.findFirst({
      where: { groupId: group.id, name: KHOAN_GROUP_NAME },
      select: { id: true },
    });
    if (!item) {
      item = await prisma.estimateItem.create({
        data: { groupId: group.id, name: KHOAN_GROUP_NAME, status: "approved", sortOrder: 0 },
        select: { id: true },
      });
    }
    const last = await prisma.estimateLine.aggregate({ where: { itemId: item.id }, _max: { sortOrder: true } });
    const line = await prisma.estimateLine.create({
      data: {
        itemId: item.id,
        section: "khoan",
        khoanGroup,
        name,
        unit,
        quantity: qty,
        directUnitPrice,
        note,
        status: "edited",
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: line.id });
  }

  return NextResponse.json({ message: "kind không hợp lệ" }, { status: 400 });
}
