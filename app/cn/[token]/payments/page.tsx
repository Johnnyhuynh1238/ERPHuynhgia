import { CommentTargetType } from "@prisma/client";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { normalizePaymentSchedule } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";

function money(value: number | null | undefined) {
  return `${Math.round(value || 0).toLocaleString("vi-VN")} đ`;
}

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("vi-VN") : "Chưa cập nhật";
}

function daysUntil(value: Date | null) {
  if (!value) return null;
  const today = new Date();
  const a = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const b = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.ceil((b - a) / (24 * 60 * 60 * 1000));
}

function statusText(status: string) {
  if (status === "paid") return "Đã thu";
  if (status === "overdue") return "Quá hạn";
  if (status === "cancelled") return "Đã hủy";
  return "Chờ thu";
}

function statusClass(status: string) {
  if (status === "paid") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "overdue") return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-amber-500/30 bg-amber-500/10 text-amber-200";
}

export default async function CustomerPaymentsPage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const [projectInfo, rows, comments] = await Promise.all([
    prisma.project.findUnique({ where: { id: project.id }, select: { contractValue: true } }),
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
    prisma.customerComment.findMany({
      where: { projectId: project.id, targetType: CommentTargetType.payment_schedule, parentId: null },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, fullName: true } },
        replies: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, fullName: true } } } },
        threadReplies: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, fullName: true } } } },
      },
    }),
  ]);

  const payments = rows.map(normalizePaymentSchedule);
  const scheduleTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const contractValue = projectInfo?.contractValue ? Number(projectInfo.contractValue) : scheduleTotal;
  const paidTotal = payments.reduce((sum, payment) => sum + (payment.status === "paid" ? payment.paidAmount || payment.amount : 0), 0);
  const remaining = Math.max(0, contractValue - paidTotal);
  const paidPercent = contractValue > 0 ? Math.round((paidTotal / contractValue) * 100) : 0;
  const contractPayments = payments.filter((payment) => payment.type === "contract");
  const addendumPayments = payments.filter((payment) => payment.type === "addendum");

  const renderPayment = (payment: (typeof payments)[number]) => {
    const paymentComments = comments.filter((comment) => comment.targetId === payment.id);
    const days = daysUntil(payment.dueDate);
    const dueSoon = payment.status !== "paid" && days !== null && days >= 0 && days <= 30;

    return (
      <article key={payment.id} className="owner-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs owner-muted">Đợt {payment.installmentNo}</div>
            <h2 className="font-semibold text-white">{payment.description}</h2>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusClass(payment.status)}`}>{statusText(payment.status)}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-[#1a1a1a] p-3">
            <div className="text-xs owner-muted">Số tiền</div>
            <div className="font-semibold text-white">{money(payment.amount)}</div>
          </div>
          <div className="rounded-xl bg-[#1a1a1a] p-3">
            <div className="text-xs owner-muted">Hạn thu</div>
            <div className="font-semibold text-white">{dateText(payment.dueDate)}</div>
          </div>
          {payment.status === "paid" ? (
            <>
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <div className="text-xs text-emerald-200/70">Đã thu</div>
                <div className="font-semibold text-emerald-200">{money(payment.paidAmount || payment.amount)}</div>
              </div>
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <div className="text-xs text-emerald-200/70">Ngày thu</div>
                <div className="font-semibold text-emerald-200">{dateText(payment.paidAt)}</div>
              </div>
            </>
          ) : null}
        </div>

        {dueSoon ? <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">Đợt này đến hạn trong {days} ngày.</div> : null}
        {payment.receiptUrl ? <a href={payment.receiptUrl} target="_blank" className="owner-button mt-3 w-full">Xem biên lai</a> : null}
        {payment.paymentNote ? <div className="owner-card mt-3 bg-[#1a1a1a] text-sm">{payment.paymentNote}</div> : null}

        <div className="mt-4 border-t border-[#3a3a3a] pt-4">
          <div className="mb-2 text-sm font-semibold text-white">Trao đổi về đợt này</div>
          <form action={`/cn/${params.token}/comments/new`} method="post" className="space-y-2">
            <input type="hidden" name="targetType" value={CommentTargetType.payment_schedule} />
            <input type="hidden" name="targetId" value={payment.id} />
            <textarea name="content" rows={2} placeholder="Nhập câu hỏi về đợt thanh toán..." className="owner-textarea placeholder:text-neutral-500" />
            <button type="submit" className="owner-button w-full">Gửi bình luận</button>
          </form>
          <div className="mt-3 space-y-2">
            {paymentComments.map((comment) => (
              <div key={comment.id} className="owner-comment bg-[#1a1a1a]">
                <div className="text-xs owner-muted">{comment.authorName || comment.author?.fullName || "Chủ nhà"} · {dateText(comment.createdAt)}</div>
                <div className="mt-1 text-white">{comment.content}</div>
                {[...comment.replies, ...comment.threadReplies].map((reply) => (
                  <div key={reply.id} className="owner-reply">
                    <span className="font-semibold text-[#ff8a3d]">{reply.author?.fullName || ("authorName" in reply ? reply.authorName : null) || "Nhân sự"}: </span>{reply.content}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <div className="owner-section-title">TÀI CHÍNH</div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="owner-card"><div className="text-sm font-bold text-white">{money(contractValue)}</div><div className="owner-muted">Tổng</div></div>
          <div className="owner-card"><div className="text-sm font-bold text-emerald-300">{money(paidTotal)}</div><div className="owner-muted">Đã thu</div></div>
          <div className="owner-card"><div className="text-sm font-bold text-amber-200">{money(remaining)}</div><div className="owner-muted">Còn lại</div></div>
        </div>
        <div className="mt-4 owner-progress-track"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPercent}%` }} /></div>
      </section>

      <section className="owner-section space-y-3">
        <div className="owner-section-title">THEO HỢP ĐỒNG</div>
        {contractPayments.length === 0 ? <div className="text-sm owner-muted">Chưa có lịch thanh toán hợp đồng.</div> : null}
        {contractPayments.map(renderPayment)}
      </section>

      {addendumPayments.length ? (
        <section className="owner-section space-y-3">
          <div className="owner-section-title">PHỤ LỤC PHÁT SINH</div>
          {addendumPayments.map(renderPayment)}
        </section>
      ) : null}
    </div>
  );
}
