import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout, BigCard } from "@/app/ks-ql/sub/_components/sub-layout";

export const dynamic = "force-dynamic";

function statusLabel(p: { status: string; orderStatus: string }) {
  if (p.status === "declined") return { label: "Bị từ chối", tone: "danger" as const };
  if (p.status === "pending") return { label: "Chờ duyệt", tone: "warn" as const };
  if (p.orderStatus === "not_ordered") return { label: "Đã duyệt · chưa đặt", tone: "primary" as const };
  if (p.orderStatus === "ordered") return { label: "Đang về", tone: "primary" as const };
  if (p.orderStatus === "received") return { label: "Đã nhận", tone: "success" as const };
  return { label: "Đã trả tiền", tone: "success" as const };
}

function summarizeItems(parsed: unknown): string {
  if (!Array.isArray(parsed) || parsed.length === 0) return "(không có chi tiết)";
  const first = parsed
    .slice(0, 3)
    .map((it: any) => `${it.name} ${it.qty} ${it.unit}`)
    .join(" · ");
  return parsed.length > 3 ? `${first} · …` : first;
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
        proposals.map((p) => {
          const st = statusLabel({ status: p.status, orderStatus: p.orderStatus });
          return (
            <Link
              key={p.id}
              href={`/ks-ql/sub/${project.id}/material/propose/${p.id}`}
              className="block rounded-2xl border-2 border-[#252840] bg-[#13151f] px-5 py-4 transition hover:border-[#ff8a3d]/40"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs text-[#8892b0]">
                  {new Date(p.createdAt).toLocaleString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    st.tone === "danger"
                      ? "bg-[#D26B6B]/20 text-[#D26B6B]"
                      : st.tone === "warn"
                        ? "bg-[#E0B855]/20 text-[#E0B855]"
                        : st.tone === "success"
                          ? "bg-[#6FA677]/20 text-[#6FA677]"
                          : "bg-[#ff8a3d]/20 text-[#ff8a3d]"
                  }`}
                >
                  {st.label}
                </span>
              </div>
              <div className="text-base text-[#f5ede4]">{summarizeItems(p.parsedItems)}</div>
            </Link>
          );
        })
      )}
    </SubLayout>
  );
}
