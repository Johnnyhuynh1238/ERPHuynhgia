import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { notifyMaterialProposalUpdate } from "@/lib/notify-material-proposal";

export const runtime = "nodejs";

const RECEIVER_ROLES = new Set<string>([
  UserRole.engineer,
  UserRole.construction_manager,
  UserRole.admin,
]);

type ParsedItem = {
  ten?: string;
  sl?: number;
  dvt?: string;
  name?: string;
  qty?: number;
  unit?: string;
};

function itemQty(it: ParsedItem): number {
  if (typeof it.qty === "number") return it.qty;
  if (typeof it.sl === "number") return it.sl;
  return 0;
}

const upsertSchema = z.object({
  receivedQty: z.coerce.number().min(0),
  qcChecked: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

const PROPOSAL_SELECT = {
  id: true,
  projectId: true,
  status: true,
  orderStatus: true,
  closedAt: true,
  parsedItems: true,
  description: true,
  project: { select: { name: true } },
} as const;

async function loadProposal(proposalId: string, userId: string, role: string) {
  if (role === UserRole.admin || role === UserRole.construction_manager) {
    return prisma.materialProposal.findUnique({
      where: { id: proposalId },
      select: PROPOSAL_SELECT,
    });
  }
  return prisma.materialProposal.findFirst({
    where: {
      id: proposalId,
      project: {
        memberAssignments: { some: { userId, role: "pm_engineer" } },
      },
    },
    select: PROPOSAL_SELECT,
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; seq: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  if (!RECEIVER_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Không có quyền nhận hàng" }, { status: 403 });
  }

  const seq = Number(params.seq);
  if (!Number.isInteger(seq) || seq < 0) {
    return NextResponse.json({ message: "Sai chỉ số dòng" }, { status: 400 });
  }

  const proposal = await loadProposal(params.id, user.id, user.role);
  if (!proposal) return NextResponse.json({ message: "Không tìm thấy đề xuất" }, { status: 404 });
  if (proposal.status !== "accepted") {
    return NextResponse.json({ message: "Đề xuất chưa được duyệt" }, { status: 400 });
  }
  if (proposal.orderStatus === "not_ordered") {
    return NextResponse.json({ message: "Chưa đặt NCC — không thể nhận" }, { status: 400 });
  }
  if (proposal.closedAt) {
    return NextResponse.json({ message: "PO đã đóng — KT đã hoàn tất" }, { status: 400 });
  }

  const items = (proposal.parsedItems as ParsedItem[] | null) ?? [];
  if (seq >= items.length) {
    return NextResponse.json({ message: "Dòng không tồn tại" }, { status: 400 });
  }
  const item = items[seq];
  const orderedQty = itemQty(item);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu sai", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.receivedQty > orderedQty * 1.5 && orderedQty > 0) {
    // Cho phép sai 50% (giao dư trong VN bình thường), trên thì chặn để tránh nhầm.
    return NextResponse.json(
      { message: `Số nhận (${parsed.data.receivedQty}) vượt 150% số đặt (${orderedQty}) — kiểm tra lại` },
      { status: 400 },
    );
  }

  const receipt = await prisma.materialProposalItemReceipt.upsert({
    where: {
      proposalId_itemSeq: { proposalId: proposal.id, itemSeq: seq },
    },
    create: {
      proposalId: proposal.id,
      itemSeq: seq,
      receivedQty: new Prisma.Decimal(parsed.data.receivedQty),
      qcChecked: parsed.data.qcChecked ?? false,
      note: parsed.data.note ?? null,
      receivedBy: user.id,
    },
    update: {
      receivedQty: new Prisma.Decimal(parsed.data.receivedQty),
      qcChecked: parsed.data.qcChecked ?? false,
      note: parsed.data.note ?? null,
      receivedBy: user.id,
      receivedAt: new Date(),
    },
    select: {
      id: true,
      itemSeq: true,
      receivedQty: true,
      qcChecked: true,
      photos: true,
      note: true,
      receivedAt: true,
    },
  });

  // Nếu tất cả item đã có receipt với qty >= ordered → tự bật orderStatus=received.
  if (proposal.orderStatus === "ordered") {
    const receipts = await prisma.materialProposalItemReceipt.findMany({
      where: { proposalId: proposal.id },
      select: { itemSeq: true, receivedQty: true },
    });
    const map = new Map(receipts.map((r) => [r.itemSeq, Number(r.receivedQty)]));
    let allMet = items.length > 0;
    for (let i = 0; i < items.length; i += 1) {
      const need = itemQty(items[i]);
      const got = map.get(i) ?? 0;
      if (got + 1e-6 < need) {
        allMet = false;
        break;
      }
    }
    if (allMet) {
      await prisma.materialProposal.update({
        where: { id: proposal.id },
        data: { orderStatus: "received", receivedAt: new Date() },
      });
    }
  }

  // Push KT để vào ghi công nợ. Không chặn response.
  void (async () => {
    try {
      const accountants = await prisma.user.findMany({
        where: { role: "accountant", isActive: true },
        select: { id: true },
      });
      const item = items[seq];
      const itemName = item.name ?? item.ten ?? `dòng ${seq + 1}`;
      const unit = item.unit ?? item.dvt ?? "";
      const projName = proposal.project?.name ?? "";
      await Promise.all(
        accountants.map((a) =>
          notifyMaterialProposalUpdate({
            proposalId: proposal.id,
            projectId: proposal.projectId,
            projectName: projName,
            recipientId: a.id,
            actorUserId: user.id,
            actorName: user.name ?? "KS",
            title: `KS đã nhận: ${itemName}`,
            body: `${projName}: ${parsed.data.receivedQty} ${unit}${
              parsed.data.qcChecked ? " · QC OK" : ""
            }`,
          }),
        ),
      );
    } catch (err) {
      console.error("[receipt] notify KT failed", err);
    }
  })();

  return NextResponse.json({
    receipt: {
      ...receipt,
      receivedQty: Number(receipt.receivedQty),
    },
  });
}
