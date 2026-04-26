import { notFound } from "next/navigation";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { PHASE_LABEL } from "@/lib/task-display";
import { AcknowledgmentForm } from "../../_components/acknowledgment-form";

export default async function CustomerTaskDetailPage({
  params,
}: {
  params: { token: string; taskId: string };
}) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const task = await prisma.task.findFirst({
    where: {
      id: params.taskId,
      projectId: project.id,
      isActive: true,
      visibleToCustomer: true,
    },
    include: {
      qcItems: {
        orderBy: { orderIndex: "asc" },
        include: {
          progress: {
            include: {
              updater: { select: { fullName: true } },
            },
          },
          photos: {
            select: { id: true, url: true, uploadedAt: true },
            orderBy: { uploadedAt: "desc" },
          },
        },
      },
      taskPhotos: { orderBy: { createdAt: "desc" }, take: 12 },
      customerComments: {
        orderBy: { createdAt: "desc" },
        include: {
          replies: { include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
        },
      },
      customerAcknowledgments: true,
    },
  });

  if (!task) notFound();

  const canAck =
    task.isMilestone &&
    (task.status === TaskStatus.done || task.status === TaskStatus.inspected) &&
    task.customerAcknowledgments.length === 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <h1 className="text-lg font-semibold">{task.code} · {task.name}</h1>
        <div className="mt-1 text-sm text-[#8892b0]">{PHASE_LABEL[task.phase]} · {task.status}</div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm">
        <div className="font-semibold">Kiểm tra chất lượng</div>
        <div className="mt-2 space-y-2">
          {task.qcChecklist.split("\n").filter(Boolean).map((item, idx) => {
            const hit = task.qcItems[idx]?.progress?.status === "passed";
            return (
              <div key={idx} className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2">
                <span>{hit ? "✅" : "⏳"}</span> {item}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm">
        <div className="font-semibold">Hoạt động QC</div>
        <div className="mt-2 space-y-2">
          {task.qcItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-[#2d3249] bg-[#13151f] p-3">
              <div>{item.progress?.updater?.fullName || "-"} · {item.progress?.updatedAt ? new Date(item.progress.updatedAt).toLocaleString("vi-VN") : "-"}</div>
              <div className="text-xs text-[#8892b0]">{item.content}</div>
              <div className="grid grid-cols-4 gap-1 pt-2">
                {item.photos.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank"><img alt="qc" src={photo.url} className="h-14 w-full rounded object-cover" /></a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm">
        <div className="font-semibold">Ảnh công việc</div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {task.taskPhotos.map((photo) => (
            <a key={photo.id} href={photo.photoUrl} target="_blank"><img src={photo.thumbnailUrl} className="h-16 w-full rounded object-cover" /></a>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm">
        <div className="font-semibold">Bình luận</div>
        <form action={`/cn/${params.token}/comments/new`} method="post" className="mt-2">
          <input type="hidden" name="taskId" value={task.id} />
          <textarea required name="content" rows={2} className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2" placeholder="Nhập bình luận..." />
          <button className="mt-2 rounded-lg bg-[#f97316] px-3 py-1 text-xs font-semibold text-black">Gửi bình luận</button>
        </form>

        <div className="mt-3 space-y-2">
          {task.customerComments.map((comment) => (
            <div key={comment.id} className="rounded-lg border border-[#2d3249] bg-[#13151f] p-3">
              <div className="text-xs text-[#8892b0]">Bạn · {new Date(comment.createdAt).toLocaleString("vi-VN")}</div>
              <div>{comment.content}</div>
              {comment.replies.map((reply) => (
                <div key={reply.id} className="mt-2 rounded border border-[#39405f] bg-[#1c2233] p-2 text-xs">
                  <span className="font-semibold">{reply.author.fullName}: </span>{reply.content}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {canAck ? (
        <AcknowledgmentForm action={`/cn/${params.token}/acknowledge/${task.id}`} />
      ) : (
        task.customerAcknowledgments[0] ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">✅ Đã nghiệm thu lúc {new Date(task.customerAcknowledgments[0].acknowledgedAt).toLocaleString("vi-VN")}</div>
        ) : null
      )}
    </div>
  );
}
