import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentTargetType, TaskStatus } from "@prisma/client";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { getPortalExpiry as resolveExpiry } from "@/lib/customer-portal";
import { getCustomerPortalOverview, normalizePaymentSchedule } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";

const completedStatuses: TaskStatus[] = [TaskStatus.done, TaskStatus.inspected, TaskStatus.internal_approved, TaskStatus.completed];

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function money(value: number | null | undefined) {
  return `${Math.round(value || 0).toLocaleString("vi-VN")} đ`;
}

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("vi-VN") : "Chưa cập nhật";
}

export default async function CustomerDashboardPage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const [overview, payments, drawings, projectComments, pendingAck, runningTask] = await Promise.all([
    getCustomerPortalOverview(project.id),
    prisma.paymentSchedule.findMany({
      where: { projectId: project.id },
      orderBy: [{ type: "asc" }, { installmentNo: "asc" }, { phaseNumber: "asc" }],
      select: {
        id: true,
        type: true,
        installmentNo: true,
        phaseNumber: true,
        description: true,
        milestoneDescription: true,
        amount: true,
        dueDate: true,
        expectedDate: true,
        status: true,
        paidAt: true,
        paidAmount: true,
        actualPaidDate: true,
        actualPaidAmount: true,
        receiptUrl: true,
        paymentNote: true,
        notes: true,
      },
    }),
    prisma.projectDrawing.findMany({
      where: { projectId: project.id },
      orderBy: [{ displayOrder: "asc" }, { uploadedAt: "desc" }],
      take: 6,
      select: { id: true, name: true, description: true, fileSizeBytes: true, uploadedAt: true },
    }),
    prisma.customerComment.findMany({
      where: { projectId: project.id, targetType: CommentTargetType.project, targetId: project.id, parentId: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        author: { select: { id: true, fullName: true } },
        threadReplies: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, fullName: true } } } },
        replies: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, fullName: true } } } },
      },
    }),
    prisma.task.findMany({
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
    }),
    prisma.task.findFirst({
      where: { projectId: project.id, isActive: true, visibleToCustomer: true, status: TaskStatus.in_progress },
      select: { id: true, code: true, name: true, progressPercent: true },
      orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
    }),
  ]);

  if (!overview) notFound();

  const normalizedPayments = payments.map(normalizePaymentSchedule);
  const paidTotal = normalizedPayments.reduce((sum, payment) => sum + (payment.status === "paid" ? payment.paidAmount || payment.amount : 0), 0);
  const contractValue = overview.project.contractValue || normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const nextPayment = normalizedPayments.find((payment) => payment.status === "pending" || payment.status === "overdue") || null;
  const expiry = resolveExpiry(project.actualEndDate);
  const showExpiryBanner = Boolean(expiry && daysBetween(new Date(), expiry) <= 7);
  const currentPhase = overview.project.currentPhase;

  return (
    <div className="space-y-4 pb-2">
      <section className="overflow-hidden rounded-3xl border border-[#252840] bg-gradient-to-br from-[#242132] via-[#1a1d2e] to-[#13151f] p-4 shadow-xl">
        <div className="text-xs text-[#fbbf24]">Cổng thông tin chủ nhà</div>
        <h1 className="mt-1 text-2xl font-bold text-[#f8fafc]">{overview.project.name}</h1>
        <div className="mt-1 text-sm text-[#a8b0c8]">Xin chào {overview.project.customerName}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-lg font-bold text-[#fb923c]">{overview.project.overallProgress}%</div>
            <div className="text-[#96a0ba]">Tiến độ</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-lg font-bold text-[#f8fafc]">{overview.project.doneCount}/{overview.project.totalCount}</div>
            <div className="text-[#96a0ba]">Task xong</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-lg font-bold text-[#f8fafc]">{currentPhase?.name || "-"}</div>
            <div className="text-[#96a0ba]">Giai đoạn</div>
          </div>
        </div>
        <div className="mt-4 h-2 rounded-full bg-[#252840]">
          <div className="h-2 rounded-full bg-gradient-to-r from-[#fb923c] to-[#facc15]" style={{ width: `${overview.project.overallProgress}%` }} />
        </div>
      </section>

      {showExpiryBanner ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Link sẽ hết hạn vào {expiry?.toLocaleDateString("vi-VN")}. Vui lòng tải nhật ký thi công.
          <div className="mt-2">
            <Link className="text-amber-300 underline" href={`/cn/${params.token}/journal`}>
              Tải nhật ký ngay
            </Link>
          </div>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="text-sm font-semibold text-[#f8fafc]">Thông tin nhà</div>
          <div className="mt-3 space-y-2 text-sm text-[#d9def3]">
            <div className="flex justify-between gap-3"><span className="text-[#8892b0]">Mã dự án</span><span>{overview.project.code}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[#8892b0]">Địa chỉ</span><span className="text-right">{overview.project.address || "Chưa cập nhật"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[#8892b0]">Diện tích</span><span>{overview.project.areaM2 ? `${overview.project.areaM2} m²` : "Chưa cập nhật"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[#8892b0]">Dự kiến bàn giao</span><span>{dateText(overview.project.expectedEndDate)}</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="text-sm font-semibold text-[#f8fafc]">Hợp đồng & tài chính</div>
          <div className="mt-3 space-y-2 text-sm text-[#d9def3]">
            <div className="flex justify-between"><span className="text-[#8892b0]">Giá trị</span><span>{money(contractValue)}</span></div>
            <div className="flex justify-between"><span className="text-[#8892b0]">Đã thu</span><span className="text-emerald-300">{money(paidTotal)}</span></div>
            <div className="flex justify-between"><span className="text-[#8892b0]">Còn lại</span><span>{money(Math.max(0, contractValue - paidTotal))}</span></div>
            {nextPayment ? <div className="rounded-xl bg-[#13151f] p-3 text-xs text-[#d9def3]">Sắp tới: {nextPayment.description} · {money(nextPayment.amount)} · {dateText(nextPayment.dueDate)}</div> : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-[#f8fafc]">Tiến độ hôm nay</div>
          <Link href={`/cn/${params.token}/timeline`} className="text-xs text-[#fb923c] underline">Xem tiến độ</Link>
        </div>
        {runningTask ? (
          <Link href={`/cn/${params.token}/tasks/${runningTask.id}`} className="block rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm text-[#d9def3]">
            <div className="font-semibold text-[#f8fafc]">{runningTask.code} · {runningTask.name}</div>
            <div className="mt-2 h-2 rounded-full bg-[#252840]"><div className="h-2 rounded-full bg-[#fb923c]" style={{ width: `${runningTask.progressPercent || 0}%` }} /></div>
          </Link>
        ) : <div className="text-sm text-[#8892b0]">Hiện chưa có task đang thi công.</div>}
      </section>

      {pendingAck.length ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="mb-2 text-sm font-semibold text-amber-100">Cần bạn xác nhận ({pendingAck.length})</div>
          <div className="space-y-2 text-sm">
            {pendingAck.map((task) => (
              <Link key={task.id} href={`/cn/${params.token}/tasks/${task.id}`} className="block rounded-xl border border-amber-500/20 bg-[#13151f] p-3 text-amber-100">
                {task.code} · {task.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-sm font-semibold text-[#f8fafc]">Đội ngũ phụ trách</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {overview.team.filter((member) => member.id).map((member) => (
            <div key={`${member.role}-${member.id}`} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
              <div className="text-xs text-[#8892b0]">{member.role}</div>
              <div className="font-semibold text-[#f8fafc]">{member.fullName}</div>
              <div className="text-[#8892b0]">{member.phone || "Chưa cập nhật SĐT"}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-[#f8fafc]">Bản vẽ PDF</div>
          <span className="text-xs text-[#8892b0]">{drawings.length} file</span>
        </div>
        <div className="space-y-2">
          {drawings.length === 0 ? <div className="text-sm text-[#8892b0]">Chưa có bản vẽ được chia sẻ.</div> : null}
          {drawings.map((drawing) => (
            <a key={drawing.id} href={`/api/drawings/${drawing.id}/file?token=${params.token}`} target="_blank" className="block rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
              <div className="font-semibold text-[#f8fafc]">{drawing.name}</div>
              <div className="text-xs text-[#8892b0]">{drawing.description || "PDF bản vẽ"} · {Math.round(drawing.fileSizeBytes / 1024).toLocaleString("vi-VN")} KB</div>
            </a>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-sm font-semibold text-[#f8fafc]">Bình luận chung</div>
        <form action={`/cn/${params.token}/comments/new`} method="post" className="space-y-2">
          <input type="hidden" name="targetType" value={CommentTargetType.project} />
          <input type="hidden" name="targetId" value={project.id} />
          <textarea name="content" rows={3} placeholder="Nhắn câu hỏi hoặc ghi chú cho đội thi công..." className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm text-[#f8fafc] outline-none placeholder:text-[#647089]" />
          <button className="w-full rounded-xl bg-[#f97316] px-4 py-2 text-sm font-semibold text-white" type="submit">Gửi bình luận</button>
        </form>
        <div className="mt-4 space-y-3">
          {projectComments.length === 0 ? <div className="text-sm text-[#8892b0]">Chưa có bình luận chung.</div> : null}
          {projectComments.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
              <div className="text-xs text-[#8892b0]">{comment.authorName || comment.author?.fullName || "Chủ nhà"} · {comment.createdAt.toLocaleDateString("vi-VN")}</div>
              <div className="mt-1 text-[#f8fafc]">{comment.content}</div>
              {[...comment.replies, ...comment.threadReplies].map((reply) => (
                <div key={reply.id} className="mt-2 rounded-lg bg-[#1a1d2e] p-2 text-xs text-[#d9def3]">
                  <span className="font-semibold text-[#fb923c]">{reply.author?.fullName || ("authorName" in reply ? reply.authorName : null) || "Nhân sự"}: </span>{reply.content}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
