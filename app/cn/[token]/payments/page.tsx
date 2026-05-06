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
      <article key={payment.id} className="rounded-3xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-[#8892b0]">Đợt {payment.installmentNo}</div>
            <h2 className="font-semibold text-[#f8fafc]">{payment.description}</h2>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusClass(payment.status)}`}>{statusText(payment.status)}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-[#13151f] p-3">
            <div className="text-xs text-[#8892b0]">Số tiền</div>
            <div className="font-semibold text-[#f8fafc]">{money(payment.amount)}</div>
          </div>
          <div className="rounded-2xl bg-[#13151f] p-3">
            <div className="text-xs text-[#8892b0]">Hạn thu</div>
            <div className="font-semibold text-[#f8fafc]">{dateText(payment.dueDate)}</div>
          </div>
          {payment.status === "paid" ? (
            <>
              <div className="rounded-2xl bg-emerald-500/10 p-3">
                <div className="text-xs text-emerald-200/70">Đã thu</div>
                <div className="font-semibold text-emerald-200">{money(payment.paidAmount || payment.amount)}</div>
              </div>
              <div className="rounded-2xl bg-emerald-500/10 p-3">
                <div className="text-xs text-emerald-200/70">Ngày thu</div>
                <div className="font-semibold text-emerald-200">{dateText(payment.paidAt)}</div>
              </div>
            </>
          ) : null}
        </div>

        {dueSoon ? <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">Đợt này đến hạn trong {days} ngày.</div> : null}
        {payment.receiptUrl ? <a href={payment.receiptUrl} target="_blank" className="mt-3 block rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-200">Xem biên lai</a> : null}
        {payment.paymentNote ? <div className="mt-3 rounded-xl bg-[#13151f] p-3 text-sm text-[#d9def3]">{payment.paymentNote}</div> : null}

        <div className="mt-4 border-t border-[#252840] pt-4">
          <div className="mb-2 text-sm font-semibold text-[#f8fafc]">Trao đổi về đợt này</div>
          <form action={`/cn/${params.token}/comments/new`} method="post" className="space-y-2">
            <input type="hidden" name="targetType" value={CommentTargetType.payment_schedule} />
            <input type="hidden" name="targetId" value={payment.id} />
            <textarea name="content" rows={2} placeholder="Nhập câu hỏi về đợt thanh toán..." className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm text-[#f8fafc] outline-none placeholder:text-[#647089]" />
            <button type="submit" className="w-full rounded-xl bg-[#f97316] px-4 py-2 text-sm font-semibold text-white">Gửi bình luận</button>
          </form>
          <div className="mt-3 space-y-2">
            {paymentComments.map((comment) => (
              <div key={comment.id} className="rounded-xl bg-[#13151f] p-3 text-sm">
                <div className="text-xs text-[#8892b0]">{comment.authorName || comment.author?.fullName || "Chủ nhà"} · {dateText(comment.createdAt)}</div>
                <div className="mt-1 text-[#f8fafc]">{comment.content}</div>
                {[...comment.replies, ...comment.threadReplies].map((reply) => (
                  <div key={reply.id} className="mt-2 rounded-lg bg-[#1a1d2e] p-2 text-xs text-[#d9def3]">
                    <span className="font-semibold text-[#fb923c]">{reply.author?.fullName || ("authorName" in reply ? reply.authorName : null) || "Nhân sự"}: </span>{reply.content}
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
    <div className="space-y-4 pb-2">
      <section className="rounded-3xl border border-[#252840] bg-gradient-to-br from-[#242132] to-[#13151f] p-4">
        <div className="text-xs text-[#8892b0]">Theo dõi hợp đồng và thanh toán</div>
        <h1 className="mt-1 text-xl font-bold text-[#f8fafc]">Tài chính</h1>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-white/5 p-3"><div className="text-sm font-bold text-[#f8fafc]">{money(contractValue)}</div><div className="text-[#8892b0]">Tổng</div></div>
          <div className="rounded-2xl bg-white/5 p-3"><div className="text-sm font-bold text-emerald-300">{money(paidTotal)}</div><div className="text-[#8892b0]">Đã thu</div></div>
          <div className="rounded-2xl bg-white/5 p-3"><div className="text-sm font-bold text-amber-200">{money(remaining)}</div><div className="text-[#8892b0]">Còn lại</div></div>
        </div>
        <div className="mt-4 h-2 rounded-full bg-[#252840]"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${paidPercent}%` }} /></div>
      </section>

      <section className="space-y-3">
        <div className="text-sm font-semibold text-[#f8fafc]">Theo hợp đồng</div>
        {contractPayments.length === 0 ? <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Chưa có lịch thanh toán hợp đồng.</div> : null}
        {contractPayments.map(renderPayment)}
      </section>

      {addendumPayments.length ? (
        <section className="space-y-3">
          <div className="text-sm font-semibold text-[#f8fafc]">Phụ lục phát sinh</div>
          {addendumPayments.map(renderPayment)}
        </section>
      ) : null}
    </div>
  );
}
