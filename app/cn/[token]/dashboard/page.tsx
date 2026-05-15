import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentTargetType, ProjectDocumentCategory, TaskStatus } from "@prisma/client";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { getPortalExpiry as resolveExpiry } from "@/lib/customer-portal";
import { getCustomerPortalOverview, normalizePaymentSchedule } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";
import { DesignPhotoCarousel, type DesignGroup } from "../_components/design-photo-carousel";

const CATEGORY_LABEL: Record<ProjectDocumentCategory, string> = {
  contract: "Hợp đồng",
  estimate: "Báo giá",
  drawing: "Bản vẽ",
  legal: "Pháp lý",
  other: "Khác",
};

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

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default async function CustomerDashboardPage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const [overview, payments, drawings, projectComments, pendingAck, designGroupsRaw] = await Promise.all([
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
    prisma.projectDocument.findMany({
      where: { projectId: project.id, visibleToCustomer: true },
      orderBy: { uploadedAt: "desc" },
      take: 12,
      select: { id: true, title: true, category: true, fileName: true, fileSize: true, uploadedAt: true },
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
    prisma.designPhotoGroup.findMany({
      where: { projectId: project.id, visibleToCustomer: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      include: {
        photos: {
          orderBy: [{ displayOrder: "asc" }, { uploadedAt: "asc" }],
          select: { id: true },
        },
      },
    }),
  ]);

  if (!overview) notFound();

  const normalizedPayments = payments.map(normalizePaymentSchedule);
  const paidTotal = normalizedPayments.reduce((sum, payment) => sum + (payment.status === "paid" ? payment.paidAmount || payment.amount : 0), 0);
  const contractValue = overview.project.contractValue || normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const nextPayment = normalizedPayments
    .filter((payment) => (payment.status === "pending" || payment.status === "overdue") && payment.dueDate)
    .sort((a, b) => (a.dueDate as Date).getTime() - (b.dueDate as Date).getTime())[0] || null;
  const expiry = resolveExpiry(project.actualEndDate);
  const showExpiryBanner = Boolean(expiry && daysBetween(new Date(), expiry) <= 7);
  const currentPhase = overview.project.currentPhase;

  const visibleGroups = designGroupsRaw.filter((group) => group.photos.length > 0);
  const designGroups: DesignGroup[] = shuffle(visibleGroups).map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    photos: shuffle(group.photos).map((photo) => ({
      id: photo.id,
      groupId: group.id,
      groupTitle: group.title,
      photoUrl: `/api/customer/${params.token}/design-photos/${photo.id}/file?variant=photo`,
      thumbnailUrl: `/api/customer/${params.token}/design-photos/${photo.id}/file?variant=thumb`,
    })),
  }));

  return (
    <div className="owner-portal-page">
      {showExpiryBanner ? (
        <section className="owner-section border border-amber-500/30 bg-amber-500/10 text-sm text-amber-100">
          Link sẽ hết hạn vào {expiry?.toLocaleDateString("vi-VN")}. Vui lòng tải nhật ký thi công.
          <div className="mt-2">
            <Link className="font-semibold text-amber-200 underline" href={`/cn/${params.token}/journal`}>
              Tải nhật ký ngay
            </Link>
          </div>
        </section>
      ) : null}

      <section className="owner-section">
        <div className="owner-section-title">TỔNG QUAN DỰ ÁN</div>
        <h1 className="text-xl font-bold text-white">{overview.project.name}</h1>
        <div className="mt-1 text-sm owner-muted">{overview.project.customerName}</div>
        <div className="mt-4 owner-progress-track">
          <div className="owner-progress-fill" style={{ width: `${overview.project.overallProgress}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="owner-card">
            <div className="text-lg font-bold text-[#ff8a3d]">{overview.project.overallProgress}%</div>
            <div className="owner-muted">Tiến độ</div>
          </div>
          <div className="owner-card">
            <div className="text-lg font-bold text-white">{overview.project.doneCount}/{overview.project.totalCount}</div>
            <div className="owner-muted">Task xong</div>
          </div>
          <div className="owner-card">
            <div className="truncate text-lg font-bold text-white">{currentPhase?.name || "-"}</div>
            <div className="owner-muted">Giai đoạn</div>
          </div>
        </div>
      </section>

      <DesignPhotoCarousel groups={designGroups} />

      <section className="owner-section">
        <div className="owner-section-title">THÔNG TIN NHÀ</div>
        <div className="owner-info-row"><span>Mã dự án</span><span>{overview.project.code}</span></div>
        <div className="owner-info-row"><span>Địa chỉ</span><span className="text-right">{overview.project.address || "Chưa cập nhật"}</span></div>
        <div className="owner-info-row"><span>Dự kiến bàn giao</span><span>{dateText(overview.project.expectedEndDate)}</span></div>
      </section>

      <section className="owner-section">
        <div className="owner-section-title">HỢP ĐỒNG</div>
        <div className="owner-info-row"><span>Giá trị</span><span>{money(contractValue)}</span></div>
        <div className="owner-info-row"><span>Đã thu</span><span className="text-emerald-300">{money(paidTotal)}</span></div>
        <div className="owner-info-row"><span>Còn lại</span><span>{money(Math.max(0, contractValue - paidTotal))}</span></div>
        {nextPayment ? <div className="owner-card mt-3 text-sm">Sắp tới: {nextPayment.description} · {money(nextPayment.amount)} · {dateText(nextPayment.dueDate)}</div> : null}
      </section>

      {pendingAck.length ? (
        <section className="owner-section border border-amber-500/30 bg-amber-500/10">
          <div className="owner-section-title text-amber-100">CẦN XÁC NHẬN ({pendingAck.length})</div>
          <div className="space-y-2 text-sm">
            {pendingAck.map((task) => (
              <Link key={task.id} href={`/cn/${params.token}/tasks/${task.id}?from=dashboard`} className="owner-card block text-amber-100">
                {task.code} · {task.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="owner-section">
        <div className="owner-section-title">ĐỘI NGŨ</div>
        <div className="grid gap-2">
          {overview.team.filter((member) => member.id).map((member) => (
            <div key={`${member.role}-${member.id}`} className="owner-card text-sm">
              <div className="text-xs owner-muted">{member.role}</div>
              <div className="font-semibold text-white">{member.fullName}</div>
              <div className="owner-muted">{member.phone || "Chưa cập nhật SĐT"}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="owner-section">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="owner-section-title mb-0">HỒ SƠ</div>
          <span className="text-xs owner-muted">{drawings.length} file</span>
        </div>
        <div className="space-y-2">
          {drawings.length === 0 ? <div className="text-sm owner-muted">Chưa có hồ sơ được chia sẻ.</div> : null}
          {drawings.map((doc) => (
            <a key={doc.id} href={`/api/projects/${project.id}/documents/${doc.id}/file?token=${params.token}`} target="_blank" className="owner-card block text-sm">
              <div className="font-semibold text-white">{doc.title}</div>
              <div className="text-xs owner-muted">{CATEGORY_LABEL[doc.category]} · {doc.fileName} · {Math.round(doc.fileSize / 1024).toLocaleString("vi-VN")} KB</div>
            </a>
          ))}
        </div>
      </section>

      <section className="owner-section">
        <div className="owner-section-title">BÌNH LUẬN CHUNG</div>
        <details className="owner-comment-toggle">
          <summary className="owner-button w-full cursor-pointer text-center">Viết bình luận</summary>
          <form action={`/cn/${params.token}/comments/new`} method="post" className="mt-3 space-y-2">
            <input type="hidden" name="targetType" value={CommentTargetType.project} />
            <input type="hidden" name="targetId" value={project.id} />
            <textarea name="content" rows={3} placeholder="Nhắn câu hỏi hoặc ghi chú cho đội thi công..." className="owner-textarea placeholder:text-neutral-500" />
            <button className="owner-button w-full" type="submit">Gửi bình luận</button>
          </form>
        </details>
        <div className="mt-4 space-y-3">
          {projectComments.length === 0 ? <div className="text-sm owner-muted">Chưa có bình luận chung.</div> : null}
          {projectComments.map((comment) => (
            <div key={comment.id} className="owner-comment">
              <div className="text-xs owner-muted">{comment.authorName || comment.author?.fullName || "Chủ nhà"} · {comment.createdAt.toLocaleDateString("vi-VN")}</div>
              <div className="mt-1 text-white">{comment.content}</div>
              {[...comment.replies, ...comment.threadReplies].map((reply) => (
                <div key={reply.id} className="owner-reply">
                  <span className="font-semibold text-[#ff8a3d]">{reply.author?.fullName || ("authorName" in reply ? reply.authorName : null) || "Nhân sự"}: </span>{reply.content}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
