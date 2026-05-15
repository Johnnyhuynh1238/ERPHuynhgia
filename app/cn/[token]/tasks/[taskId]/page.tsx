import { CommentTargetType, TaskCategory, TaskStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AcknowledgmentForm } from "../../_components/acknowledgment-form";
import { CustomerPhotoAlbum } from "../../_components/customer-photo-album";

const completedStatuses: TaskStatus[] = [TaskStatus.done, TaskStatus.inspected, TaskStatus.internal_approved, TaskStatus.completed];

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("vi-VN") : "Chưa cập nhật";
}

function dateTimeText(value: Date | null | undefined) {
  return value ? value.toLocaleString("vi-VN") : "Chưa cập nhật";
}

function statusText(status: TaskStatus) {
  if (status === TaskStatus.internal_approved) return "Đã duyệt nội bộ";
  if (status === TaskStatus.completed) return "Đã hoàn tất";
  if (status === TaskStatus.inspected) return "Đã kiểm tra";
  if (status === TaskStatus.done) return "Đã xong";
  if (status === TaskStatus.in_progress) return "Đang thi công";
  if (status === TaskStatus.delayed) return "Chậm tiến độ";
  return "Chưa bắt đầu";
}

function statusClass(status: TaskStatus) {
  if (completedStatuses.includes(status)) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === TaskStatus.in_progress) return "border-orange-500/30 bg-orange-500/10 text-orange-200";
  if (status === TaskStatus.delayed) return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-[#2d3249] bg-[#13151f] text-[#a8b0c8]";
}

const backTargets: Record<string, { href: (token: string) => string; label: string }> = {
  timeline: { href: (token) => `/cn/${token}/timeline`, label: "← Tiến độ" },
  dashboard: { href: (token) => `/cn/${token}/dashboard`, label: "← Tổng quan" },
  journal: { href: (token) => `/cn/${token}/journal`, label: "← Nhật ký" },
};

export default async function CustomerTaskDetailPage({
  params,
  searchParams,
}: {
  params: { token: string; taskId: string };
  searchParams?: { from?: string };
}) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();
  const back = backTargets[searchParams?.from || ""] || backTargets.journal;

  const task = await prisma.task.findFirst({
    where: { id: params.taskId, projectId: project.id, isActive: true, visibleToCustomer: true },
    include: {
      projectPhase: { select: { id: true, code: true, name: true } },
      assignedEngineer: { select: { id: true, fullName: true, phone: true } },
      qcItems: {
        orderBy: { orderIndex: "asc" },
        include: {
          progress: { include: { updater: { select: { fullName: true } } } },
          photos: { select: { id: true, url: true, uploadedAt: true }, orderBy: { uploadedAt: "desc" } },
        },
      },
      taskPhotos: {
        orderBy: { createdAt: "desc" },
        take: 80,
        select: {
          id: true,
          photoUrl: true,
          thumbnailUrl: true,
          caption: true,
          takenAt: true,
          createdAt: true,
          user: { select: { fullName: true } },
        },
      },
      customerComments: {
        where: { parentId: null },
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, fullName: true } },
          replies: { include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
          threadReplies: { include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
        },
      },
      customerAcknowledgments: true,
      customerTaskRating: true,
      customerKsRating: true,
    },
  });

  if (!task) notFound();

  const canAck =
    task.isMilestone &&
    task.category === TaskCategory.major_milestone &&
    task.status === TaskStatus.internal_approved &&
    task.customerAcknowledgments.length === 0 &&
    !task.customerTaskRating &&
    !task.customerKsRating;
  const commentsLocked = task.status === TaskStatus.internal_approved || task.status === TaskStatus.completed;
  const photosByDate = task.taskPhotos.reduce<Record<string, typeof task.taskPhotos>>((groups, photo) => {
    const key = dateText(photo.takenAt || photo.createdAt);
    groups[key] = groups[key] || [];
    groups[key].push(photo);
    return groups;
  }, {});
  const qcFallback = task.qcItems.length === 0 ? task.qcChecklist.split("\n").map((item) => item.trim()).filter(Boolean) : [];

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <a href={back.href(params.token)} className="mb-3 inline-block text-sm font-semibold text-[#ff8a3d]">{back.label}</a>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs owner-muted">{task.projectPhase?.name || task.phase}</div>
            <h1 className="mt-1 text-xl font-bold text-white">{task.code} · {task.name}</h1>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusClass(task.status)}`}>{statusText(task.status)}</span>
        </div>
        <div className="mt-4 owner-progress-track"><div className="owner-progress-fill" style={{ width: `${task.progressPercent || 0}%` }} /></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="owner-card"><div className="font-bold text-white">{task.progressPercent || 0}%</div><div className="owner-muted">Tiến độ</div></div>
          <div className="owner-card"><div className="font-bold text-white">{dateText(task.plannedEndDate)}</div><div className="owner-muted">Dự kiến</div></div>
          <div className="owner-card"><div className="truncate font-bold text-white">{task.assignedEngineer?.fullName || "-"}</div><div className="owner-muted">Kỹ sư</div></div>
        </div>
      </section>

      <nav className="grid grid-cols-3 gap-2 text-center text-xs">
        <a href="#album" className="owner-card block py-2 font-semibold text-white">Album</a>
        <a href="#qc" className="owner-card block py-2 font-semibold text-white">QC</a>
        <a href="#comments" className="owner-card block py-2 font-semibold text-white">Bình luận</a>
      </nav>

      <section id="album" className="owner-section">
        <div className="mb-3 flex items-center justify-between">
          <div className="owner-section-title mb-0">ALBUM CÔNG VIỆC</div>
          <span className="text-xs owner-muted">{task.taskPhotos.length} ảnh</span>
        </div>
        {task.taskPhotos.length === 0 ? <div className="text-sm owner-muted">Chưa có ảnh công việc.</div> : null}
        <div className="space-y-4">
          {Object.entries(photosByDate).map(([date, photos]) => (
            <div key={date}>
              <div className="mb-2 text-xs font-semibold owner-muted">{date}</div>
              <CustomerPhotoAlbum
                photos={photos.map((photo) => ({
                  id: photo.id,
                  url: `/api/customer/${params.token}/tasks/${task.id}/photos/${photo.id}/file?variant=photo`,
                  thumbnailUrl: `/api/customer/${params.token}/tasks/${task.id}/photos/${photo.id}/file?variant=thumb`,
                  caption: photo.caption || task.name,
                }))}
              />
            </div>
          ))}
        </div>
      </section>

      <section id="qc" className="owner-section">
        <div className="owner-section-title">KIỂM TRA CHẤT LƯỢNG</div>
        <div className="space-y-3">
          {qcFallback.map((item, index) => (
            <div key={index} className="owner-card text-sm text-neutral-300">{item}</div>
          ))}
          {task.qcItems.map((item) => {
            const passed = item.progress?.status === "passed";
            return (
              <div key={item.id} className="owner-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{item.content}</div>
                    <div className="mt-1 text-xs owner-muted">{item.progress?.updater?.fullName || "Chưa cập nhật"} · {dateTimeText(item.progress?.updatedAt)}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${passed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-[#444] bg-[#1a1a1a] text-neutral-400"}`}>{passed ? "Đạt" : "Chờ"}</span>
                </div>
                {item.progress?.note ? <div className="mt-2 text-sm text-neutral-300">{item.progress.note}</div> : null}
                {item.photos.length ? (
                  <CustomerPhotoAlbum
                    photos={item.photos.map((photo) => ({
                      id: photo.id,
                      url: `/api/customer/${params.token}/tasks/${task.id}/qc-photos/${photo.id}/file`,
                      caption: item.content,
                    }))}
                    gridClassName="mt-3 grid grid-cols-4 gap-2"
                    thumbnailClassName="h-16"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section id="comments" className="owner-section">
        <div className="owner-section-title">BÌNH LUẬN</div>
        {commentsLocked ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Task đã nghiệm thu/hoàn tất nên không nhận bình luận mới.</div>
        ) : (
          <form action={`/cn/${params.token}/comments/new`} method="post" className="space-y-2">
            <input type="hidden" name="targetType" value={CommentTargetType.task} />
            <input type="hidden" name="targetId" value={task.id} />
            <input type="hidden" name="taskId" value={task.id} />
            <textarea required name="content" rows={3} className="owner-textarea placeholder:text-neutral-500" placeholder="Nhập bình luận..." />
            <button className="owner-button w-full" type="submit">Gửi bình luận</button>
          </form>
        )}

        <div className="mt-4 space-y-3">
          {task.customerComments.length === 0 ? <div className="text-sm owner-muted">Chưa có bình luận.</div> : null}
          {task.customerComments.map((comment) => (
            <div key={comment.id} className="owner-comment">
              <div className="text-xs owner-muted">{comment.authorName || comment.author?.fullName || "Chủ nhà"} · {dateTimeText(comment.createdAt)}</div>
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

      {canAck ? <AcknowledgmentForm action={`/cn/${params.token}/acknowledge/${task.id}`} /> : null}
      {!canAck && task.customerAcknowledgments[0] ? (
        <section className="owner-section border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-200">
          Đã nghiệm thu lúc {dateTimeText(task.customerAcknowledgments[0].acknowledgedAt)}
        </section>
      ) : null}
    </div>
  );
}
