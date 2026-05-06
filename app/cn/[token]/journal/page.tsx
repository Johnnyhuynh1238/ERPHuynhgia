import { CommentTargetType } from "@prisma/client";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { buildCustomerJournalEvents } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";

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

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <div className="owner-section-title">NHẬT KÝ CÔNG TRÌNH</div>
        <div className="text-sm owner-muted">Timeline thi công theo ngày, ảnh, QC, nghiệm thu và thanh toán.</div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <form action={`/api/customer/${params.token}/journal/download/pdf`} method="post">
            <button type="submit" className="owner-card w-full text-sm font-semibold text-white">Tạo PDF tóm tắt</button>
          </form>
          <form action={`/api/customer/${params.token}/journal/download/zip`} method="post">
            <button type="submit" className="owner-button w-full">Tạo ZIP đầy đủ</button>
          </form>
        </div>
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

        {events.map((event) => (
          <article key={event.id} className="owner-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs owner-muted">{dateText(event.date)} · {timeText(event.date)}{event.phaseName ? ` · ${event.phaseName}` : ""}</div>
                <h2 className="mt-1 font-semibold text-white">{event.title}</h2>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${eventTone(event.type)}`}>{eventLabel(event.type)}</span>
            </div>

            {event.description ? <div className="mt-2 text-sm text-neutral-300">{event.description}</div> : null}
            {event.taskId ? <a href={`/cn/${params.token}/tasks/${event.taskId}`} className="mt-2 inline-block text-xs font-semibold text-[#ff8a3d] underline">Xem task {event.taskCode}</a> : null}

            {event.photos?.length ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {event.photos.slice(0, 6).map((photo, index) => (
                  <a key={`${event.id}-photo-${index}`} href={photo.url} target="_blank" className="block overflow-hidden rounded-lg bg-[#1a1a1a]">
                    <img src={photo.thumbnailUrl || photo.url} alt={event.title} className="h-24 w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : null}

            <div className="mt-4 border-t border-[#3a3a3a] pt-3">
              <div className="mb-2 text-xs owner-muted">{event.commentCount} bình luận</div>
              <form action={`/cn/${params.token}/comments/new`} method="post" className="space-y-2">
                <input type="hidden" name="targetType" value={event.targetType || CommentTargetType.journal_entry} />
                <input type="hidden" name="targetId" value={event.targetId} />
                <textarea name="content" rows={2} placeholder="Bình luận về sự kiện này..." className="owner-textarea placeholder:text-neutral-500" />
                <button type="submit" className="owner-button w-full">Gửi bình luận</button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
