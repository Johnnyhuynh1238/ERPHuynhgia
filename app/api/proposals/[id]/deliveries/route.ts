import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { putObjectToMinio } from "@/lib/minio";
import { notifyMaterialProposalUpdate } from "@/lib/notify-material-proposal";

export const runtime = "nodejs";

const RECEIVER_ROLES = new Set<string>([
  UserRole.engineer,
  UserRole.construction_manager,
  UserRole.admin,
]);
const VIEWER_ROLES = new Set<string>([
  UserRole.engineer,
  UserRole.construction_manager,
  UserRole.admin,
  UserRole.accountant,
]);

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_KIND = 10;

type StoredPhoto = { key: string; contentType: string; width: number | null; height: number | null };
type ItemsSnapshotEntry = { itemSeq: number; qty: number };
type ParsedItem = { name?: string; ten?: string; qty?: number; sl?: number; unit?: string; dvt?: string };

function itemQty(it: ParsedItem) {
  if (typeof it.qty === "number") return it.qty;
  if (typeof it.sl === "number") return it.sl;
  return 0;
}
function itemName(it: ParsedItem) {
  return it.name ?? it.ten ?? "";
}
function itemUnit(it: ParsedItem) {
  return it.unit ?? it.dvt ?? "";
}

function safeBaseName(name: string) {
  return (
    (name || "img")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.(jpe?g|png|webp)$/i, "")
      .slice(0, 60) || "img"
  );
}

async function processPhotos(files: File[], keyPrefix: string): Promise<StoredPhoto[]> {
  const out: StoredPhoto[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // ignore
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `${keyPrefix}/${randomUUID()}-${safeBaseName(file.name)}.${ext}`;
    await putObjectToMinio({ key, body: buffer, contentType: file.type });
    out.push({ key, contentType: file.type, width, height });
  }
  return out;
}

function validateFiles(files: File[], label: string): string | null {
  if (files.length > MAX_FILES_PER_KIND) return `${label}: tối đa ${MAX_FILES_PER_KIND} ảnh`;
  for (const f of files) {
    if (!ALLOWED_TYPES.includes(f.type)) return `${label} - ${f.name}: không phải JPG/PNG/WEBP`;
    if (f.size > MAX_BYTES) return `${label} - ${f.name}: vượt 25MB`;
  }
  return null;
}

// POST: KS tạo 1 đợt nhận. FormData:
// - items: JSON string [{itemSeq, qty}] các dòng nhận trong đợt (qty > 0)
// - note: optional
// - invoicePhotos: >=1 File (ảnh phiếu giao NCC)
// - goodsPhotos:   >=1 File (ảnh hàng hoá)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!RECEIVER_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      ksId: true,
      projectId: true,
      orderStatus: true,
      status: true,
      closedAt: true,
      parsedItems: true,
      project: { select: { name: true } },
    },
  });
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy đơn" }, { status: 404 });
  if (proposal.closedAt) return NextResponse.json({ message: "PO đã đóng" }, { status: 400 });
  if (proposal.status !== "accepted" || proposal.orderStatus === "not_ordered") {
    return NextResponse.json({ message: "PO chưa đặt NCC" }, { status: 400 });
  }
  if (user.role === UserRole.engineer && proposal.ksId !== user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "Form không hợp lệ" }, { status: 400 });
  }

  const itemsRaw = formData.get("items");
  if (typeof itemsRaw !== "string") {
    return NextResponse.json({ message: "Thiếu danh sách item" }, { status: 400 });
  }
  let itemsSnapshot: ItemsSnapshotEntry[];
  try {
    const arr = JSON.parse(itemsRaw);
    if (!Array.isArray(arr)) throw new Error("not array");
    itemsSnapshot = arr
      .map((r) => ({ itemSeq: Number(r.itemSeq), qty: Number(r.qty) }))
      .filter((r) => Number.isInteger(r.itemSeq) && r.itemSeq >= 0 && Number.isFinite(r.qty) && r.qty > 0);
  } catch {
    return NextResponse.json({ message: "items JSON không hợp lệ" }, { status: 400 });
  }
  if (!itemsSnapshot.length) {
    return NextResponse.json({ message: "Phải nhận ít nhất 1 dòng >0" }, { status: 400 });
  }

  const parsedItems = (proposal.parsedItems as ParsedItem[] | null) ?? [];
  for (const row of itemsSnapshot) {
    if (row.itemSeq >= parsedItems.length) {
      return NextResponse.json({ message: `Dòng ${row.itemSeq} không tồn tại` }, { status: 400 });
    }
  }

  const invoiceFiles = formData.getAll("invoicePhotos").filter((x): x is File => x instanceof File);
  const goodsFiles = formData.getAll("goodsPhotos").filter((x): x is File => x instanceof File);
  if (invoiceFiles.length < 1) {
    return NextResponse.json({ message: "Bắt buộc ít nhất 1 ảnh phiếu giao hàng NCC" }, { status: 400 });
  }
  if (goodsFiles.length < 1) {
    return NextResponse.json({ message: "Bắt buộc ít nhất 1 ảnh hàng hoá" }, { status: 400 });
  }
  const err1 = validateFiles(invoiceFiles, "Phiếu giao");
  if (err1) return NextResponse.json({ message: err1 }, { status: 400 });
  const err2 = validateFiles(goodsFiles, "Hàng hoá");
  if (err2) return NextResponse.json({ message: err2 }, { status: 400 });

  const noteRaw = formData.get("note");
  const note = typeof noteRaw === "string" ? noteRaw.trim().slice(0, 500) || null : null;

  const deliveryId = randomUUID();
  const invoicePhotos = await processPhotos(
    invoiceFiles,
    `proposal-deliveries/${params.id}/${deliveryId}/invoice`,
  );
  const goodsPhotos = await processPhotos(
    goodsFiles,
    `proposal-deliveries/${params.id}/${deliveryId}/goods`,
  );

  // Transaction: tạo delivery + cộng dồn từng ItemReceipt.
  await prisma.$transaction(async (tx) => {
    await tx.materialProposalDelivery.create({
      data: {
        id: deliveryId,
        proposalId: params.id,
        receivedBy: user.id,
        invoicePhotos: invoicePhotos as unknown as Prisma.InputJsonValue,
        goodsPhotos: goodsPhotos as unknown as Prisma.InputJsonValue,
        itemsSnapshot: itemsSnapshot as unknown as Prisma.InputJsonValue,
        note,
      },
    });

    for (const row of itemsSnapshot) {
      const existing = await tx.materialProposalItemReceipt.findUnique({
        where: { proposalId_itemSeq: { proposalId: params.id, itemSeq: row.itemSeq } },
        select: { id: true, receivedQty: true },
      });
      if (existing) {
        await tx.materialProposalItemReceipt.update({
          where: { id: existing.id },
          data: {
            receivedQty: existing.receivedQty.add(new Prisma.Decimal(row.qty)),
            receivedAt: new Date(),
            receivedBy: user.id,
          },
        });
      } else {
        await tx.materialProposalItemReceipt.create({
          data: {
            proposalId: params.id,
            itemSeq: row.itemSeq,
            receivedQty: new Prisma.Decimal(row.qty),
            qcChecked: false,
            photos: [] as unknown as Prisma.InputJsonValue,
            receivedBy: user.id,
            receivedAt: new Date(),
          },
        });
      }
    }
  });

  // Auto-mark received khi tổng qty tích luỹ đạt đủ TẤT CẢ dòng.
  if (proposal.orderStatus === "ordered") {
    const allReceipts = await prisma.materialProposalItemReceipt.findMany({
      where: { proposalId: params.id },
      select: { itemSeq: true, receivedQty: true },
    });
    const map = new Map(allReceipts.map((r) => [r.itemSeq, Number(r.receivedQty)]));
    let allMet = parsedItems.length > 0;
    for (let i = 0; i < parsedItems.length; i += 1) {
      const need = itemQty(parsedItems[i]);
      const got = map.get(i) ?? 0;
      if (need <= 0 || got + 1e-6 < need) {
        allMet = false;
        break;
      }
    }
    if (allMet) {
      await prisma.materialProposal.update({
        where: { id: params.id },
        data: { orderStatus: "received", receivedAt: new Date() },
      });
    }
  }

  // Notify KT: có đợt nhận mới, đã có ảnh phiếu giao để đối chiếu công nợ.
  void (async () => {
    try {
      const accountants = await prisma.user.findMany({
        where: { role: "accountant", isActive: true },
        select: { id: true },
      });
      const projName = proposal.project?.name ?? "";
      const lines = itemsSnapshot
        .slice(0, 3)
        .map((r) => `${itemName(parsedItems[r.itemSeq])}: ${r.qty} ${itemUnit(parsedItems[r.itemSeq])}`)
        .join(", ");
      const extra = itemsSnapshot.length > 3 ? ` +${itemsSnapshot.length - 3} dòng` : "";
      await Promise.all(
        accountants.map((a) =>
          notifyMaterialProposalUpdate({
            proposalId: params.id,
            projectId: proposal.projectId,
            projectName: projName,
            recipientId: a.id,
            actorUserId: user.id,
            actorName: user.name ?? "KS",
            title: `KS đã nhận đợt mới: ${projName}`,
            body: `${lines}${extra}. Đã đính phiếu giao + ảnh hàng hoá.`,
          }),
        ),
      );
    } catch (err) {
      console.error("[delivery] notify KT failed", err);
    }
  })();

  return NextResponse.json({ ok: true, deliveryId });
}

// GET: list các đợt giao. Dùng cho cả KS xem lịch sử + KT xem đối chiếu.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!VIEWER_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: { id: true, ksId: true },
  });
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (user.role === UserRole.engineer && proposal.ksId !== user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const rows = await prisma.materialProposalDelivery.findMany({
    where: { proposalId: params.id },
    orderBy: { deliveredAt: "desc" },
    select: {
      id: true,
      deliveredAt: true,
      invoicePhotos: true,
      goodsPhotos: true,
      itemsSnapshot: true,
      note: true,
      receiver: { select: { id: true, fullName: true } },
    },
  });

  // Legacy: các đợt nhận trước khi có bảng MaterialProposalDelivery (flow cũ).
  // Ảnh nằm ở MaterialProposalItemReceipt.photos — trả về để KT vẫn xem được lúc ghi công nợ.
  const legacyRows = await prisma.materialProposalItemReceipt.findMany({
    where: { proposalId: params.id },
    orderBy: { itemSeq: "asc" },
    select: {
      itemSeq: true,
      receivedQty: true,
      receivedAt: true,
      photos: true,
      receiver: { select: { fullName: true } },
    },
  });
  const legacyReceipts = legacyRows
    .map((r) => ({
      itemSeq: r.itemSeq,
      receivedQty: Number(r.receivedQty),
      receivedAt: r.receivedAt.toISOString(),
      receiverName: r.receiver?.fullName ?? "",
      photos: (r.photos as unknown as Array<{ key: string; contentType?: string }>) ?? [],
    }))
    .filter((r) => r.photos.length > 0);

  return NextResponse.json({
    deliveries: rows.map((r) => ({
      id: r.id,
      deliveredAt: r.deliveredAt.toISOString(),
      invoicePhotos: r.invoicePhotos ?? [],
      goodsPhotos: r.goodsPhotos ?? [],
      itemsSnapshot: r.itemsSnapshot ?? [],
      note: r.note,
      receiverName: r.receiver.fullName,
    })),
    legacyReceipts,
  });
}
