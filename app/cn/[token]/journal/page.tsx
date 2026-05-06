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
    <div className="space-y-4 pb-2">
      <section className="rounded-3xl border border-[#252840] bg-gradient-to-br from-[#242132] to-[#13151f] p-4">
        <div className="text-xs text-[#8892b0]">Timeline thi công theo ngày</div>
        <h1 className="mt-1 text-xl font-bold text-[#f8fafc]">Nhật ký công trình</h1>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <form action={`/api/customer/${params.token}/journal/download/pdf`} method="post">
            <button type="submit" className="w-full rounded-2xl border border-[#2d3249] bg-[#13151f] px-3 py-3 text-sm font-semibold text-[#f8fafc]">Tạo PDF tóm tắt</button>
          </form>
          <form action={`/api/customer/${params.token}/journal/download/zip`} method="post">
            <button type="submit" className="w-full rounded-2xl bg-[#f97316] px-3 py-3 text-sm font-semibold text-white">Tạo ZIP đầy đủ</button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {typeOptions.map((option) => (
            <a key={option.value} href={query(params.token, option.value, selectedPhase)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${selectedType === option.value ? "border-[#f97316] bg-[#f97316] text-white" : "border-[#2d3249] bg-[#13151f] text-[#a8b0c8]"}`}>
              {option.label}
            </a>
          ))}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          <a href={query(params.token, selectedType, "all")} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${selectedPhase === "all" ? "border-[#f97316] bg-[#f97316] text-white" : "border-[#2d3249] bg-[#13151f] text-[#a8b0c8]"}`}>Mọi giai đoạn</a>
          {phases.map((phase) => (
            <a key={phase.id} href={query(params.token, selectedType, phase.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${selectedPhase === phase.id ? "border-[#f97316] bg-[#f97316] text-white" : "border-[#2d3249] bg-[#13151f] text-[#a8b0c8]"}`}>
              {phase.name}
            </a>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {events.length === 0 ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Chưa có sự kiện phù hợp bộ lọc.</div>
        ) : null}

        {events.map((event) => (
          <article key={event.id} className="rounded-3xl border border-[#252840] bg-[#1a1d2e] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-[#8892b0]">{dateText(event.date)} · {timeText(event.date)}{event.phaseName ? ` · ${event.phaseName}` : ""}</div>
                <h2 className="mt-1 font-semibold text-[#f8fafc]">{event.title}</h2>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${eventTone(event.type)}`}>{eventLabel(event.type)}</span>
            </div>

            {event.description ? <div className="mt-2 text-sm text-[#d9def3]">{event.description}</div> : null}
            {event.taskId ? <a href={`/cn/${params.token}/tasks/${event.taskId}`} className="mt-2 inline-block text-xs text-[#fb923c] underline">Xem task {event.taskCode}</a> : null}

            {event.photos?.length ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {event.photos.slice(0, 6).map((photo, index) => (
                  <a key={`${event.id}-photo-${index}`} href={photo.url} target="_blank" className="block overflow-hidden rounded-xl border border-[#2d3249] bg-[#13151f]">
                    <img src={photo.thumbnailUrl || photo.url} alt={event.title} className="h-24 w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : null}

            <div className="mt-4 border-t border-[#252840] pt-3">
              <div className="mb-2 text-xs text-[#8892b0]">{event.commentCount} bình luận</div>
              <form action={`/cn/${params.token}/comments/new`} method="post" className="space-y-2">
                <input type="hidden" name="targetType" value={event.targetType || CommentTargetType.journal_entry} />
                <input type="hidden" name="targetId" value={event.targetId} />
                <textarea name="content" rows={2} placeholder="Bình luận về sự kiện này..." className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-sm text-[#f8fafc] outline-none placeholder:text-[#647089]" />
                <button type="submit" className="w-full rounded-xl bg-[#f97316] px-4 py-2 text-sm font-semibold text-white">Gửi bình luận</button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
