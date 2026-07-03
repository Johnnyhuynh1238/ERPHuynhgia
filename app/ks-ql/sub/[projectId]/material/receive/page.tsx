import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Inbox } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout } from "@/app/ks-ql/sub/_components/sub-layout";
import { normalizeItem } from "../_components/proposal-card";

export const dynamic = "force-dynamic";

function poCode(id: string) {
  return `PO-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
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
      orderStatus: true,
      orderedAt: true,
      parsedItems: true,
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
          {proposals.map((p, cardIdx) => {
            const items = ((p.parsedItems as unknown[] | null) ?? []).map(normalizeItem);
            const totalItems = items.length;
            const recvByIdx = new Map(p.receipts.map((r) => [r.itemSeq, Number(r.receivedQty)]));
            const doneCount = items.reduce((acc, it, i) => {
              const got = recvByIdx.get(i) ?? 0;
              return acc + (it.sl > 0 && got + 1e-6 >= it.sl ? 1 : 0);
            }, 0);
            const qcDone = p.receipts.filter((r) => r.qcChecked).length;
            const photoTotal = p.receipts.reduce(
              (acc, r) => acc + ((r.photos as unknown[] | null)?.length ?? 0),
              0,
            );
            const isDone = p.orderStatus === "received";
            const pct = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0;
            const accent = isDone ? "emerald" : "cyan";
            return (
              <Link
                key={p.id}
                href={`/ks-ql/sub/${project.id}/material/receive/${p.id}`}
                className="ksql-tap ksql-card-in relative block overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 pl-5 hover:border-[#ff8a3d]/60 active:bg-[#13151f]"
                style={{ animationDelay: `${Math.min(cardIdx, 8) * 45}ms` }}
              >
                <span
                  className={`absolute inset-y-0 left-0 w-1 ${isDone ? "bg-emerald-400" : "bg-cyan-400"}`}
                />

                {/* Hàng 1: trạng thái + mã PO (phụ) */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      isDone
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-cyan-500/15 text-cyan-300"
                    }`}
                  >
                    {isDone ? "Đã nhận đủ" : "Đang nhận"}
                  </span>
                  <span className="font-mono text-[11px] text-[#5a627a]">{poCode(p.id)}</span>
                </div>

                {/* Hàng 2: tiến độ nhận — thông tin chính, to nhất */}
                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span
                    className={`text-2xl font-bold leading-none tabular-nums ${
                      isDone ? "text-emerald-300" : "text-[#f0f2ff]"
                    }`}
                  >
                    {doneCount}/{totalItems}
                  </span>
                  <span className="text-sm text-[#8892b0]">dòng nhận đủ</span>
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#252840]">
                  <div
                    className={`h-full rounded-full ${accent === "emerald" ? "bg-emerald-400" : "bg-cyan-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Vật tư trong đơn — nhận diện đơn */}
                {items.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {items.slice(0, 4).map((it, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-[#0f1220] px-2 py-1 text-xs text-[#8892b0]"
                      >
                        <b className="text-[#cfd4e8]">{it.ten}</b> · {it.sl}
                        {it.dvt}
                      </span>
                    ))}
                    {items.length > 4 && (
                      <span className="rounded-md px-1.5 py-1 text-xs text-[#5a627a]">
                        +{items.length - 4}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-2.5 line-clamp-1 text-sm text-[#cfd4e8]">{p.description}</div>
                )}

                {/* Footer: thông tin phụ, nhỏ nhất */}
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#5a627a]">
                  <span>Đặt {p.orderedAt ? fmtDate(new Date(p.orderedAt)) : "—"}</span>
                  <span>·</span>
                  <span>QC {qcDone}/{totalItems}</span>
                  <span>·</span>
                  <span>Ảnh {photoTotal}</span>
                  <ChevronRight className="ml-auto h-4 w-4 text-[#5a627a]" />
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
