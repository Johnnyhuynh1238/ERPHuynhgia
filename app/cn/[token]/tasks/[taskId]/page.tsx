import { CommentTargetType, TaskCategory, TaskStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AcknowledgmentForm } from "../../_components/acknowledgment-form";

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

export default async function CustomerTaskDetailPage({ params }: { params: { token: string; taskId: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

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
    <div className="space-y-4 pb-2">
      <section className="rounded-3xl border border-[#252840] bg-gradient-to-br from-[#242132] to-[#13151f] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-[#8892b0]">{task.projectPhase?.name || task.phase}</div>
            <h1 className="mt-1 text-xl font-bold text-[#f8fafc]">{task.code} · {task.name}</h1>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusClass(task.status)}`}>{statusText(task.status)}</span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-[#252840]"><div className="h-2 rounded-full bg-[#f97316]" style={{ width: `${task.progressPercent || 0}%` }} /></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-white/5 p-3"><div className="font-bold text-[#f8fafc]">{task.progressPercent || 0}%</div><div className="text-[#8892b0]">Tiến độ</div></div>
          <div className="rounded-2xl bg-white/5 p-3"><div className="font-bold text-[#f8fafc]">{dateText(task.plannedEndDate)}</div><div className="text-[#8892b0]">Dự kiến</div></div>
          <div className="rounded-2xl bg-white/5 p-3"><div className="font-bold text-[#f8fafc]">{task.assignedEngineer?.fullName || "-"}</div><div className="text-[#8892b0]">Kỹ sư</div></div>
        </div>
      </section>

      <nav className="grid grid-cols-3 gap-2 text-center text-xs">
        <a href="#album" className="rounded-2xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-[#d9def3]">Album</a>
        <a href="#qc" className="rounded-2xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-[#d9def3]">QC</a>
        <a href="#comments" className="rounded-2xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-[#d9def3]">Bình luận</a>
      </nav>

      <section id="album" className="rounded-3xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-[#f8fafc]">Album công việc</div>
          <span className="text-xs text-[#8892b0]">{task.taskPhotos.length} ảnh</span>
        </div>
        {task.taskPhotos.length === 0 ? <div className="text-sm text-[#8892b0]">Chưa có ảnh công việc.</div> : null}
        <div className="space-y-4">
          {Object.entries(photosByDate).map(([date, photos]) => (
            <div key={date}>
              <div className="mb-2 text-xs font-semibold text-[#8892b0]">{date}</div>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <a key={photo.id} href={photo.photoUrl} target="_blank" className="block overflow-hidden rounded-xl border border-[#2d3249] bg-[#13151f]">
                    <img alt={photo.caption || task.name} src={photo.thumbnailUrl || photo.photoUrl} className="h-24 w-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="qc" className="rounded-3xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-sm font-semibold text-[#f8fafc]">Kiểm tra chất lượng</div>
        <div className="space-y-3">
          {qcFallback.map((item, index) => (
            <div key={index} className="rounded-2xl border border-[#2d3249] bg-[#13151f] p-3 text-sm text-[#d9def3]">{item}</div>
          ))}
          {task.qcItems.map((item) => {
            const passed = item.progress?.status === "passed";
            return (
              <div key={item.id} className="rounded-2xl border border-[#2d3249] bg-[#13151f] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#f8fafc]">{item.content}</div>
                    <div className="mt-1 text-xs text-[#8892b0]">{item.progress?.updater?.fullName || "Chưa cập nhật"} · {dateTimeText(item.progress?.updatedAt)}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${passed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-[#2d3249] bg-[#1a1d2e] text-[#8892b0]"}`}>{passed ? "Đạt" : "Chờ"}</span>
                </div>
                {item.progress?.note ? <div className="mt-2 text-sm text-[#d9def3]">{item.progress.note}</div> : null}
                {item.photos.length ? (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {item.photos.map((photo) => (
                      <a key={photo.id} href={photo.url} target="_blank" className="block overflow-hidden rounded-lg border border-[#2d3249]">
                        <img alt={item.content} src={photo.url} className="h-16 w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section id="comments" className="rounded-3xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 text-sm font-semibold text-[#f8fafc]">Bình luận</div>
        {commentsLocked ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Task đã nghiệm thu/hoàn tất nên không nhận bình luận mới.</div>
        ) : (
          <form action={`/cn/${params.token}/comments/new`} method="post" className="space-y-2">
            <input type="hidden" name="targetType" value={CommentTargetType.task} />
            <input type="hidden" name="targetId" value={task.id} />
            <input type="hidden" name="taskId" value={task.id} />
            <textarea required name="content" rows={3} className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm text-[#f8fafc] outline-none placeholder:text-[#647089]" placeholder="Nhập bình luận..." />
            <button className="w-full rounded-xl bg-[#f97316] px-4 py-2 text-sm font-semibold text-white" type="submit">Gửi bình luận</button>
          </form>
        )}

        <div className="mt-4 space-y-3">
          {task.customerComments.length === 0 ? <div className="text-sm text-[#8892b0]">Chưa có bình luận.</div> : null}
          {task.customerComments.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm">
              <div className="text-xs text-[#8892b0]">{comment.authorName || comment.author?.fullName || "Chủ nhà"} · {dateTimeText(comment.createdAt)}</div>
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

      {canAck ? <AcknowledgmentForm action={`/cn/${params.token}/acknowledge/${task.id}`} /> : null}
      {!canAck && task.customerAcknowledgments[0] ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Đã nghiệm thu lúc {dateTimeText(task.customerAcknowledgments[0].acknowledgedAt)}
        </div>
      ) : null}
    </div>
  );
}
