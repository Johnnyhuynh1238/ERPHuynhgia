import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Inbox, Package } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout } from "@/app/ks-ql/sub/_components/sub-layout";

export const dynamic = "force-dynamic";

type ParsedItem = {
  ten?: string;
  sl?: number;
  dvt?: string;
  name?: string;
  qty?: number;
  unit?: string;
};

function itemQty(it: ParsedItem) {
  if (typeof it.qty === "number") return it.qty;
  if (typeof it.sl === "number") return it.sl;
  return 0;
}

function poCode(id: string) {
  return `PO-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export default async function ReceiveListPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      laborMode: "subcontract",
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const proposals = await prisma.materialProposal.findMany({
    where: {
      projectId: project.id,
      status: "accepted",
      orderStatus: { in: ["ordered", "received"] },
      closedAt: null,
    },
    orderBy: { orderedAt: "desc" },
    select: {
      id: true,
      description: true,
      parsedItems: true,
      orderStatus: true,
      orderedAt: true,
      receipts: { select: { itemSeq: true, receivedQty: true, qcChecked: true, photos: true } },
    },
  });

  return (
    <SubLayout
      title="Nhận vật tư"
      subtitle={project.name}
      backHref={`/ks-ql/sub/${project.id}/material`}
    >
      {proposals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          Hiện không có PO nào chờ nhận.
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => {
            const items = (p.parsedItems as ParsedItem[] | null) ?? [];
            const totalItems = items.length;
            const recvByIdx = new Map(p.receipts.map((r) => [r.itemSeq, Number(r.receivedQty)]));
            const doneCount = items.reduce((acc, it, i) => {
              const need = itemQty(it);
              const got = recvByIdx.get(i) ?? 0;
              return acc + (need > 0 && got + 1e-6 >= need ? 1 : 0);
            }, 0);
            const qcDone = p.receipts.filter((r) => r.qcChecked).length;
            const photoTotal = p.receipts.reduce(
              (acc, r) => acc + ((r.photos as unknown[] | null)?.length ?? 0),
              0,
            );
            return (
              <Link
                key={p.id}
                href={`/ks-ql/sub/${project.id}/material/receive/${p.id}`}
                className="block rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 transition hover:border-[#ff8a3d]/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[#ff8a3d]/10 p-2 text-[#ff8a3d]">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-[11px] font-mono font-semibold text-[#8892b0]">
                        {poCode(p.id)}
                      </div>
                      <div className="line-clamp-2 text-sm font-semibold text-[#f0f2ff]">
                        {p.description}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#8892b0]">
                        {p.orderedAt
                          ? `Đặt: ${new Date(p.orderedAt).toLocaleDateString("vi-VN")}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      p.orderStatus === "received"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-cyan-500/20 text-cyan-300"
                    }`}
                  >
                    {p.orderStatus === "received" ? "Đã nhận" : "Đang nhận"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#8892b0]">
                  <span>
                    Nhận: <span className="font-semibold text-[#f0f2ff]">{doneCount}</span>/{totalItems} dòng
                  </span>
                  <span>·</span>
                  <span>QC: {qcDone}/{totalItems}</span>
                  <span>·</span>
                  <span>Ảnh: {photoTotal}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-xs text-[#8892b0]">
        <div className="mb-1 flex items-center gap-2 font-semibold text-[#f0f2ff]">
          <Inbox className="h-4 w-4" />
          Lưu ý
        </div>
        Sau khi KT bấm <b>Hoàn tất PO</b>, đơn này sẽ không hiện trong danh sách nữa. Liên hệ KT nếu cần mở lại.
      </div>
    </SubLayout>
  );
}
