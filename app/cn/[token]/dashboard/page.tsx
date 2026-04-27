import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPortalExpiry as resolveExpiry } from "@/lib/customer-portal";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default async function CustomerDashboardPage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project) notFound();
  if (!session) notFound();

  const [tasks, nextPayment, latestPhotos] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: project.id, isActive: true, visibleToCustomer: true },
      select: { id: true, status: true, isMilestone: true, code: true, name: true, actualEndDate: true },
      orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
    }),
    prisma.paymentSchedule.findFirst({
      where: { projectId: project.id, status: "not_collected" },
      orderBy: { expectedDate: "asc" },
      select: { phaseNumber: true, amount: true, expectedDate: true, milestoneDescription: true },
    }),
    prisma.eveningReportPhoto.findMany({
      where: { eveningReport: { projectId: project.id } },
      orderBy: { uploadedAt: "desc" },
      take: 4,
      select: { id: true, thumbnailUrl: true, photoUrl: true },
    }),
  ]);

  const doneCount = tasks.filter((t) => t.status === TaskStatus.done || t.status === TaskStatus.inspected).length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const runningTask = tasks.find((t) => t.status === TaskStatus.in_progress) || null;
  const pendingAck = await prisma.task.findMany({
    where: {
      projectId: project.id,
      isActive: true,
      visibleToCustomer: true,
      isMilestone: true,
      status: { in: [TaskStatus.done, TaskStatus.inspected] },
      customerAcknowledgments: { none: {} },
    },
    select: { id: true, code: true, name: true },
    orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
    take: 3,
  });

  const expiry = resolveExpiry(project.actualEndDate);
  const showExpiryBanner = Boolean(expiry && daysBetween(new Date(), expiry) <= 7);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xs text-[#8892b0]">Xin chào</div>
        <h1 className="text-xl font-semibold text-[#f0f2ff]">{project.customerName}</h1>
      </div>

      {showExpiryBanner ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Link sẽ hết hạn vào {expiry?.toLocaleDateString("vi-VN")}. Vui lòng tải PDF nhật ký thi công.
          <div className="mt-2">
            <Link className="text-amber-300 underline" href={`/cn/${params.token}/journal/export.pdf`}>
              Tải nhật ký ngay
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-sm text-[#8892b0]">Dự án của gia đình</div>
        <div className="text-lg font-semibold">{project.name}</div>
        <div className="text-xs text-[#8892b0]">{project.address}</div>
        <div className="mt-3 h-2 rounded-full bg-[#252840]">
          <div className="h-2 rounded-full bg-[#f97316]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 text-sm text-[#d9def3]">{doneCount}/{totalCount} task đã xong ({progress}%)</div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-sm font-semibold">Hôm nay</div>
        <div className="mt-1 text-sm text-[#d9def3]">
          {runningTask ? `${runningTask.code} · ${runningTask.name}` : "Hiện chưa có task đang thi công"}
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-2 text-sm font-semibold">Cần bạn xác nhận ({pendingAck.length})</div>
        <div className="space-y-2 text-sm">
          {pendingAck.length === 0 ? <div className="text-[#8892b0]">Chưa có task cần xác nhận</div> : null}
          {pendingAck.map((task) => (
            <Link key={task.id} href={`/cn/${params.token}/tasks/${task.id}`} className="block rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
              {task.code} · {task.name}
            </Link>
          ))}
        </div>
      </div>

      {nextPayment ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm">
          <div className="font-semibold">Thanh toán sắp tới</div>
          <div>Đợt {nextPayment.phaseNumber}/6</div>
          <div>{Math.round(Number(nextPayment.amount)).toLocaleString("vi-VN")} đ</div>
          <div>Hạn: {new Date(nextPayment.expectedDate).toLocaleDateString("vi-VN")}</div>
          <div className="text-[#8892b0]">{nextPayment.milestoneDescription}</div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-2 text-sm font-semibold">Hình ảnh mới nhất</div>
        <div className="grid grid-cols-4 gap-2">
          {latestPhotos.map((photo) => (
            <a key={photo.id} href={photo.photoUrl} target="_blank" className="block overflow-hidden rounded-lg border border-[#2d3249]">
              <img src={photo.thumbnailUrl} className="h-16 w-full object-cover" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
