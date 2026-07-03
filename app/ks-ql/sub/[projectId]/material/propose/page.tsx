import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, PackageCheck, PlusCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout, BigCard } from "@/app/ks-ql/sub/_components/sub-layout";
import { normalizeItem } from "../_components/proposal-card";

export const dynamic = "force-dynamic";

type ProposalStatus = "pending" | "accepted" | "declined";
type OrderStatus = "not_ordered" | "ordered" | "received" | "paid";

/** Trạng thái tổng hợp duy nhất theo góc nhìn KS (không phân biệt Ghi CN / TT — việc của KT). */
function ksState(status: ProposalStatus, orderStatus: OrderStatus) {
  if (status === "declined")
    return { label: "Bị từ chối — sửa & gửi lại", chip: "bg-red-500/15 text-red-300", stripe: "bg-red-400" };
  if (status === "pending")
    return { label: "Chờ TPTC duyệt", chip: "bg-amber-500/15 text-amber-300", stripe: "bg-amber-400" };
  if (orderStatus === "not_ordered")
    return { label: "Đã duyệt · chờ đặt hàng", chip: "bg-blue-500/15 text-blue-300", stripe: "bg-blue-400" };
  if (orderStatus === "ordered")
    return { label: "Đã đặt · hàng đang về", chip: "bg-cyan-500/15 text-cyan-300", stripe: "bg-cyan-400" };
  return { label: "Đã nhận đủ", chip: "bg-emerald-500/15 text-emerald-300", stripe: "bg-emerald-400" };
}

function fmtTime(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${HH}:${MM}`;
}

export default async function ProposeListPage({ params }: { params: { projectId: string } }) {
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
    where: { projectId: project.id, ksId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      description: true,
      status: true,
      orderStatus: true,
      parsedItems: true,
      createdAt: true,
      closedAt: true,
    },
  });

  return (
    <SubLayout
      title="Đề xuất vật tư"
      subtitle={`${proposals.length} đề xuất gần đây`}
      backHref={`/ks-ql/sub/${project.id}/material`}
    >
      <BigCard
        icon={<PlusCircle className="h-8 w-8" />}
        title="TẠO ĐỀ XUẤT MỚI"
        subtitle="Thêm vật tư cần cho công trình"
        href={`/ks-ql/sub/${project.id}/material/propose/new`}
      />

      {proposals.length === 0 ? (
        <div className="mt-2 rounded-2xl border-2 border-[#252840] bg-[#13151f] px-5 py-8 text-center text-base text-[#8892b0]">
          Chưa có đề xuất nào.
        </div>
      ) : (
        proposals.map((p, cardIdx) => {
          const st = ksState(p.status as ProposalStatus, p.orderStatus as OrderStatus);
          const items = ((p.parsedItems as unknown[] | null) ?? []).map(normalizeItem);
          const canReceive =
            (p.orderStatus === "ordered" || p.orderStatus === "received") && !p.closedAt;
          return (
            <div
              key={p.id}
              className="ksql-tap ksql-card-in relative overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 pl-5 hover:border-[#ff8a3d]/60 active:bg-[#13151f]"
              style={{ animationDelay: `${Math.min(cardIdx, 8) * 45}ms` }}
            >
              {/* Cả card bấm vào chi tiết đề xuất */}
              <Link
                href={`/ks-ql/sub/${project.id}/material/propose/${p.id}`}
                className="absolute inset-0"
                aria-label="Chi tiết đề xuất"
              />
              <span className={`absolute inset-y-0 left-0 w-1 ${st.stripe}`} />

              {/* Hàng 1: trạng thái (chính) + ngày gửi (phụ) */}
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${st.chip}`}>
                  {st.label}
                </span>
                <span className="text-[11px] text-[#5a627a]">{fmtTime(p.createdAt)}</span>
              </div>

              {/* Vật tư — nhận diện đơn */}
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
                <div className="mt-2.5 line-clamp-2 text-sm text-[#cfd4e8]">{p.description}</div>
              )}

              {/* Hành động: đơn đã đặt/đang nhận → nhảy thẳng màn nhận hàng */}
              {canReceive ? (
                <Link
                  href={`/ks-ql/sub/${project.id}/material/receive/${p.id}`}
                  className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#ff8a3d]/15 px-3.5 py-2 text-[13px] font-bold text-orange-300 transition active:scale-[0.98] hover:bg-[#ff8a3d]/25"
                >
                  <PackageCheck className="h-4 w-4" />
                  Nhận hàng
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <div className="mt-3 flex items-center justify-end">
                  <ChevronRight className="h-4 w-4 text-[#5a627a]" />
                </div>
              )}
            </div>
          );
        })
      )}
    </SubLayout>
  );
}
