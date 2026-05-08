import { CommentTargetType } from "@prisma/client";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { buildCustomerJournalEvents } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";
import { CustomerJournalDownloadButtons } from "../_components/customer-journal-download-buttons";
import { CustomerPhotoAlbum } from "../_components/customer-photo-album";

const typeOptions = [
  { value: "all", label: "Tất cả" },
  { value: "report", label: "Nhật ký" },
  { value: "photo", label: "Ảnh" },
  { value: "qc", label: "QC" },
  { value: "acknowledgment", label: "Nghiệm thu" },
  { value: "payment", label: "Thanh toán" },
];

function dateText(value: Date) {
  return value.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function timeText(value: Date) {
  return value.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function eventLabel(type: string) {
  if (type === "report") return "Nhật ký";
  if (type === "photo") return "Ảnh tiến độ";
  if (type === "qc") return "QC";
  if (type === "acknowledgment") return "Nghiệm thu";
  if (type === "payment") return "Thanh toán";
  return "Sự kiện";
}

function eventTone(type: string) {
  if (type === "photo") return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  if (type === "qc") return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  if (type === "acknowledgment") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (type === "payment") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-[#2d3249] bg-[#13151f] text-[#d9def3]";
}

function query(token: string, type: string, phase: string) {
  return `/cn/${token}/journal?type=${type}&phase=${phase}`;
}

function dayKeyVn(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export default async function CustomerJournalPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { type?: string; phase?: string; view?: string };
}) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const selectedPhase = searchParams?.phase || "all";
  const selectedType = searchParams?.view === "photos" ? "photo" : searchParams?.type || "all";

  const [phases, events] = await Promise.all([
    prisma.projectPhase.findMany({
      where: { projectId: project.id },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    buildCustomerJournalEvents(project.id, { phase: selectedPhase, type: selectedType }),
  ]);
  const eventComments = events.length
    ? await prisma.customerComment.findMany({
        where: {
          projectId: project.id,
          parentId: null,
          OR: events.map((event) => ({ targetType: event.targetType, targetId: event.targetId })),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          author: { select: { fullName: true } },
          replies: { include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
          threadReplies: { include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
        },
      })
    : [];
  const commentsByTarget = eventComments.reduce<Record<string, typeof eventComments>>((groups, comment) => {
    const key = `${comment.targetType}:${comment.targetId}`;
    groups[key] = groups[key] || [];
    groups[key].push(comment);
    return groups;
  }, {});

  const groupedByDay = new Map<string, { label: string; events: typeof events }>();
  for (const event of events) {
    const key = dayKeyVn(event.date);
    const existing = groupedByDay.get(key);
    if (existing) {
      existing.events.push(event);
      continue;
    }
    groupedByDay.set(key, { label: dateText(event.date), events: [event] });
  }

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <div className="owner-section-title">NHẬT KÝ CÔNG TRÌNH</div>
        <div className="text-sm owner-muted">Timeline thi công theo ngày, ảnh, QC, nghiệm thu và thanh toán.</div>
        <a href={`/cn/${params.token}/journal?view=photos`} className="owner-card mt-4 block py-2 text-center text-sm font-semibold text-white">Xem toàn bộ ảnh</a>
        <CustomerJournalDownloadButtons token={params.token} />
      </section>

      <section className="owner-section">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {typeOptions.map((option) => (
            <a key={option.value} href={query(params.token, option.value, selectedPhase)} className={`owner-chip shrink-0 ${selectedType === option.value ? "orange" : ""}`}>
              {option.label}
            </a>
          ))}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          <a href={query(params.token, selectedType, "all")} className={`owner-chip shrink-0 ${selectedPhase === "all" ? "orange" : ""}`}>Mọi giai đoạn</a>
          {phases.map((phase) => (
            <a key={phase.id} href={query(params.token, selectedType, phase.id)} className={`owner-chip shrink-0 ${selectedPhase === phase.id ? "orange" : ""}`}>
              {phase.name}
            </a>
          ))}
        </div>
      </section>

      <section className="owner-section space-y-3">
        <div className="owner-section-title">DÒNG THỜI GIAN</div>
        {events.length === 0 ? (
          <div className="text-sm owner-muted">Chưa có sự kiện phù hợp bộ lọc.</div>
        ) : null}

        {Array.from(groupedByDay.entries()).map(([day, group], dayIndex) => (
          <details key={day} className="owner-card" open={dayIndex === 0}>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-white">{group.label}</div>
                <div className="text-xs owner-muted">{group.events.length} log</div>
              </div>
            </summary>

            <div className="mt-3 space-y-2">
              {group.events.map((event) => (
                <details key={event.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs owner-muted">{timeText(event.date)}{event.phaseName ? ` · ${event.phaseName}` : ""}</div>
                        <h2 className="mt-1 truncate font-semibold text-white">{event.title}</h2>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${eventTone(event.type)}`}>{eventLabel(event.type)}</span>
                    </div>
                  </summary>

                  <div className="mt-3 border-t border-[#3a3a3a] pt-3">
                    {event.description ? <div className="text-sm text-neutral-300">{event.description}</div> : null}
                    {event.taskId ? <a href={`/cn/${params.token}/tasks/${event.taskId}`} className="mt-2 inline-block text-xs font-semibold text-[#ff8a3d] underline">Xem task {event.taskCode}</a> : null}

                    {event.type === "payment" && event.photos?.length ? (
                      <a href={`/api/payment-schedules/${event.targetId}/receipt?token=${params.token}`} target="_blank" className="owner-button mt-3 w-full">Xem biên lai</a>
                    ) : event.photos?.length ? (
                      <CustomerPhotoAlbum
                        photos={event.photos.map((photo, index) => {
                          const qcPhotoUrl = event.type === "qc" ? `/api/customer/${params.token}/journal/qc-logs/${event.targetId}/photos/${index}/file` : null;
                          return {
                            id: `${event.id}-photo-${index}`,
                            url: qcPhotoUrl || photo.url,
                            thumbnailUrl: qcPhotoUrl || photo.thumbnailUrl,
                            caption: event.title,
                          };
                        })}
                        gridClassName="mt-3 grid grid-cols-3 gap-2"
                        triggerLabel={event.type === "photo" ? `Xem album ảnh (${event.photos.length} ảnh)` : undefined}
                        compactTrigger={event.type === "photo"}
                      />
                    ) : null}

                    <div className="mt-4 border-t border-[#3a3a3a] pt-3">
                      <div className="mb-2 text-xs owner-muted">{commentsByTarget[`${event.targetType}:${event.targetId}`]?.length ?? event.commentCount} bình luận</div>
                      <form action={`/cn/${params.token}/comments/new`} method="post" className="space-y-2">
                        <input type="hidden" name="targetType" value={event.targetType || CommentTargetType.journal_entry} />
                        <input type="hidden" name="targetId" value={event.targetId} />
                        <textarea required name="content" rows={2} placeholder="Bình luận về sự kiện này..." className="owner-textarea placeholder:text-neutral-500" />
                        <button type="submit" className="owner-button w-full">Gửi bình luận</button>
                      </form>
                      <div className="mt-3 space-y-2">
                        {(commentsByTarget[`${event.targetType}:${event.targetId}`] || []).map((comment) => (
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
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
