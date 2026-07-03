import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Inbox } from "lucide-react";
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
            const isDone = p.orderStatus === "received";
            return (
              <Link
                key={p.id}
                href={`/ks-ql/sub/${project.id}/material/receive/${p.id}`}
                className="ksql-tap ksql-card-in block rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 hover:border-[#ff8a3d]/60 active:bg-[#13151f]"
                style={{ animationDelay: `${Math.min(cardIdx, 8) * 45}ms` }}
              >
                {/* Hàng 1: trạng thái + PO · ngày đặt */}
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
                  <span className="text-[11px] text-[#5a627a]">
                    <span className="font-mono">{poCode(p.id)}</span>
                    {p.orderedAt ? ` · Đặt ${fmtDate(new Date(p.orderedAt))}` : ""}
                  </span>
                </div>

                {/* Chủng loại hàng — to nhất */}
                {items.length > 0 ? (
                  <>
                    <div className="mt-2.5 text-[19px] font-bold leading-snug text-[#f0f2ff]">
                      {items[0].ten}
                      <span className="ml-1.5 text-[15px] font-semibold text-[#ff8a3d]">
                        {items[0].sl}
                        {items[0].dvt}
                      </span>
                    </div>
                    {items.length > 1 && (
                      <div className="mt-1 line-clamp-1 text-[13px] text-[#8892b0]">
                        +{items.length - 1} loại khác:{" "}
                        {items
                          .slice(1, 4)
                          .map((it) => it.ten)
                          .join(", ")}
                        {items.length > 4 ? ", …" : ""}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-2.5 line-clamp-2 text-[17px] font-bold leading-snug text-[#f0f2ff]">
                    {p.description}
                  </div>
                )}
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
