import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import {
  buildCustomerJournalEvents,
  getCustomerConstructionDiaryEntries,
  hasProjectConstructionDiary,
} from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";
import { CustomerPhotoAlbum } from "../_components/customer-photo-album";

const typeOptions = [
  { value: "all", label: "Tất cả" },
  { value: "report", label: "Nhật ký" },
  { value: "photo", label: "Ảnh tiến độ" },
  { value: "qc", label: "Ảnh QC" },
];

function dateText(value: Date) {
  return value.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function timeText(value: Date) {
  return value.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function eventDotClass(type: string) {
  if (type === "photo") return "bg-sky-400";
  if (type === "qc") return "bg-violet-400";
  return "bg-neutral-400";
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

function buildPhotoUrls(
  event: { type: string; targetId: string; taskId?: string },
  photo: { id?: string; url: string; thumbnailUrl?: string | null },
  index: number,
  token: string,
) {
  if (event.type === "qc") {
    const url = `/api/customer/${token}/journal/qc-logs/${event.targetId}/photos/${index}/file`;
    return { url, thumbnailUrl: url };
  }
  if (event.type === "photo" && event.taskId && photo.id) {
    const url = `/api/customer/${token}/tasks/${event.taskId}/photos/${photo.id}/file`;
    return { url, thumbnailUrl: `${url}?variant=thumb` };
  }
  return { url: photo.url, thumbnailUrl: photo.thumbnailUrl || null };
}

function isValidYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function ymdVn(value: Date) {
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
  searchParams?: { type?: string; phase?: string; view?: string; date?: string };
}) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  if (await hasProjectConstructionDiary(project.id)) {
    return renderConstructionDiaryView({ token: params.token, projectId: project.id, searchParams });
  }

  const photoGalleryMode = searchParams?.view === "photos";
  const selectedPhase = searchParams?.phase || "all";
  const selectedType = photoGalleryMode ? "all" : searchParams?.type || "all";

  const [phases, events] = await Promise.all([
    prisma.projectPhase.findMany({
      where: { projectId: project.id },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    buildCustomerJournalEvents(project.id, { phase: selectedPhase, type: photoGalleryMode ? "all" : selectedType }),
  ]);

  if (photoGalleryMode) {
    const photoEvents = events.filter((event) => (event.type === "photo" || event.type === "qc") && event.photos?.length);
    const flatPhotos = photoEvents.flatMap((event) =>
      (event.photos || []).map((photo, index) => {
        const { url, thumbnailUrl } = buildPhotoUrls(event, photo, index, params.token);
        return {
          id: `${event.id}-photo-${index}`,
          url,
          thumbnailUrl,
          caption: `${dateText(event.date)} · ${event.title}`,
        };
      }),
    );

    return (
      <div className="owner-portal-page">
        <section className="owner-section">
          <div className="flex items-center justify-between gap-3">
            <div className="owner-section-title mb-0">TOÀN BỘ ẢNH</div>
            <a href={`/cn/${params.token}/journal`} className="owner-chip shrink-0">← Nhật ký</a>
          </div>
          <div className="mt-1 text-sm owner-muted">{flatPhotos.length} ảnh từ thi công và QC.</div>
        </section>
        <section className="owner-section">
          {flatPhotos.length === 0 ? (
            <div className="text-sm owner-muted">Chưa có ảnh nào được chia sẻ.</div>
          ) : (
            <CustomerPhotoAlbum photos={flatPhotos} gridClassName="grid grid-cols-3 gap-2" thumbnailClassName="h-28" />
          )}
        </section>
      </div>
    );
  }

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

  const hasActiveFilter = selectedType !== "all" || selectedPhase !== "all";

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="owner-section-title mb-0">NHẬT KÝ CÔNG TRÌNH</div>
            <div className="mt-1 text-sm owner-muted">Cập nhật thi công, ảnh tiến độ và ảnh QC.</div>
          </div>
          <details className="owner-filter-toggle shrink-0">
            <summary className={`owner-chip cursor-pointer ${hasActiveFilter ? "orange" : ""}`} aria-label="Bộ lọc">
              <span aria-hidden>⚙</span>
            </summary>
            <div className="owner-filter-panel">
              <div className="text-xs owner-muted">Loại</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {typeOptions.map((option) => (
                  <a key={option.value} href={query(params.token, option.value, selectedPhase)} className={`owner-chip ${selectedType === option.value ? "orange" : ""}`}>
                    {option.label}
                  </a>
                ))}
              </div>
              <div className="mt-3 text-xs owner-muted">Giai đoạn</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <a href={query(params.token, selectedType, "all")} className={`owner-chip ${selectedPhase === "all" ? "orange" : ""}`}>Mọi giai đoạn</a>
                {phases.map((phase) => (
                  <a key={phase.id} href={query(params.token, selectedType, phase.id)} className={`owner-chip ${selectedPhase === phase.id ? "orange" : ""}`}>
                    {phase.name}
                  </a>
                ))}
              </div>
            </div>
          </details>
        </div>
        <a href={`/cn/${params.token}/journal?view=photos`} className="owner-card mt-4 block py-2 text-center text-sm font-semibold text-white">Xem toàn bộ ảnh</a>
      </section>

      <section className="owner-section">
        <div className="owner-section-title">DÒNG THỜI GIAN</div>
        {events.length === 0 ? (
          <div className="text-sm owner-muted">Chưa có sự kiện phù hợp bộ lọc.</div>
        ) : null}

        {Array.from(groupedByDay.entries()).map(([day, group]) => (
          <div key={day} className="owner-timeline-day">
            <div className="owner-day-header">
              <span className="font-semibold text-white">{group.label}</span>
              <span className="text-xs owner-muted">{group.events.length} log</span>
            </div>
            <div className="owner-timeline">
              {group.events.map((event) => {
                const photos = event.photos?.length
                  ? event.photos.map((photo, index) => {
                      const urls = buildPhotoUrls(event, photo, index, params.token);
                      return {
                        id: `${event.id}-photo-${index}`,
                        url: urls.url,
                        thumbnailUrl: urls.thumbnailUrl,
                        caption: event.title,
                      };
                    })
                  : [];
                const progressText = event.progressFrom != null && event.progressTo != null
                  ? `${event.progressFrom}% → ${event.progressTo}%`
                  : null;
                const metaParts: string[] = [timeText(event.date)];
                if (event.phaseName) metaParts.push(event.phaseName);
                if (progressText) metaParts.push(`${event.actor || "KS"} cập nhật ${progressText}`);
                else if (event.actor) metaParts.push(event.actor);
                if (event.description && !progressText) metaParts.push(event.description);
                return (
                  <div key={event.id} className="owner-timeline-event">
                    <span className={`owner-timeline-dot ${eventDotClass(event.type)}`} aria-hidden />
                    <div className="min-w-0">
                      <div className="font-semibold text-white">
                        {event.taskId ? (
                          <a href={`/cn/${params.token}/tasks/${event.taskId}?from=journal`} className="text-[#ffb37b] underline decoration-[#ff8a3d]/40 underline-offset-2">
                            {event.title}
                          </a>
                        ) : (
                          <span>{event.title}</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs owner-muted">
                        <span className="truncate">{metaParts.join(" · ")}</span>
                        {photos.length ? (
                          <CustomerPhotoAlbum
                            photos={photos}
                            triggerLabel={`Xem ảnh (${photos.length})`}
                            triggerClassName="font-semibold text-[#ffb37b] underline"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

async function renderConstructionDiaryView({
  token,
  projectId,
  searchParams,
}: {
  token: string;
  projectId: string;
  searchParams?: { date?: string };
}) {
  const rawDate = searchParams?.date?.trim();
  const activeDate = rawDate && isValidYmd(rawDate) ? rawDate : null;

  const entries = await getCustomerConstructionDiaryEntries(projectId, { entryDate: activeDate });

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <div className="owner-section-title mb-0">NHẬT KÝ THI CÔNG</div>
        <div className="mt-1 text-sm owner-muted">
          Kỹ sư giám sát cập nhật mỗi ngày: công tác đã làm và ảnh hiện trường.
        </div>
        <details className="mt-3" open={Boolean(activeDate)}>
          <summary
            className={`owner-chip cursor-pointer inline-flex items-center gap-1 ${activeDate ? "orange" : ""}`}
            style={{ listStyle: "none" }}
            aria-label="Lọc theo ngày"
          >
            <span aria-hidden>📅</span>
            <span className="text-xs">{activeDate ? ymdToVn(activeDate) : "Lọc theo ngày"}</span>
          </summary>
          <form
            method="get"
            action={`/cn/${token}/journal`}
            className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="diary-date" className="text-xs owner-muted">Chọn ngày</label>
              <input
                id="diary-date"
                type="date"
                name="date"
                defaultValue={activeDate || ""}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <button type="submit" className="owner-chip orange cursor-pointer">Lọc</button>
            {activeDate ? (
              <a href={`/cn/${token}/journal`} className="owner-chip cursor-pointer">Xoá lọc</a>
            ) : null}
          </form>
        </details>
      </section>

      <section className="owner-section">
        {entries.length === 0 ? (
          <div className="text-sm owner-muted">
            {activeDate ? "Ngày này chưa có nhật ký." : "Chưa có nhật ký."}
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {entries.map((entry) => {
            const photos = entry.photos.map((photo, index) => {
              const url = `/api/customer/${token}/diary/photos/file?key=${encodeURIComponent(photo.key)}`;
              return {
                id: `${entry.id}-photo-${index}`,
                url,
                thumbnailUrl: url,
                caption: `${ymdToVn(ymdVn(entry.entryDate))} · Ảnh ${index + 1}`,
              };
            });
            const isDraft = !entry.savedAt;
            return (
              <article key={entry.id} className="owner-card p-4">
                <header className="mb-2 flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <div className="font-semibold text-white">{ymdToVn(ymdVn(entry.entryDate))}</div>
                    {isDraft ? (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        Đang cập nhật
                      </span>
                    ) : null}
                  </div>
                  {entry.reporter ? (
                    <div className="text-xs owner-muted">KS: {entry.reporter}</div>
                  ) : null}
                </header>
                {entry.tasksDone ? (
                  <p className="whitespace-pre-wrap text-sm text-white/90">{entry.tasksDone}</p>
                ) : (
                  <p className="text-sm owner-muted italic">Không có ghi chú công tác.</p>
                )}
                {photos.length ? (
                  <div className="mt-3">
                    <CustomerPhotoAlbum
                      photos={photos}
                      gridClassName="grid grid-cols-3 gap-2"
                      thumbnailClassName="h-24"
                    />
                    <div className="mt-1 text-xs owner-muted">{photos.length} ảnh</div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ymdToVn(ymd: string) {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}
