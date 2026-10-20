import { notFound, redirect } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout } from "@/app/ks-ql/sub/_components/sub-layout";
import { findKsProject, ksDocWhere } from "@/lib/ks-ql-project-docs";
import { ensureProjectDocGroups, parseSubfolders } from "@/lib/project-doc-groups";
import { DOC_STATUS_LABEL, type DocStatus } from "@/lib/project-doc-groups-shared";

export const dynamic = "force-dynamic";

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
}

// Hồ sơ dự án cho KS: file được xem gom theo nhóm hồ sơ (cùng nhóm màn admin) → mục con,
// thanh chip nhảy nhanh tới nhóm; ảnh 3D nằm trong nhóm Bản vẽ.
export default async function KsProjectDocsPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await findKsProject(params.projectId, user.id);
  if (!project) notFound();

  await ensureProjectDocGroups(project.id);
  const [docs, docGroups, photoGroups] = await Promise.all([
    prisma.projectDocument.findMany({
      where: { projectId: project.id, isCurrent: true, ...ksDocWhere(user.id) },
      select: {
        id: true, title: true, category: true, fileName: true, fileSize: true, uploadedAt: true,
        groupId: true, subfolder: true, status: true, versionNo: true,
      },
      orderBy: { uploadedAt: "desc" },
    }),
    prisma.projectDocGroup.findMany({
      where: { projectId: project.id },
      select: { id: true, systemKey: true, name: true, icon: true, subfolders: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.designPhotoGroup.findMany({
      where: { projectId: project.id, photos: { some: {} } },
      select: {
        id: true,
        title: true,
        photos: { select: { id: true, caption: true }, orderBy: { displayOrder: "asc" } },
      },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  const api = `/api/ks-ql/projects/${project.id}`;
  type Doc = (typeof docs)[number];
  const photoCount = photoGroups.reduce((n, g) => n + g.photos.length, 0);
  const banVeId = docGroups.find((g) => g.systemKey === "ban_ve")?.id ?? null;

  // Nhóm có file (hoặc nhóm Bản vẽ khi có ảnh 3D); file không thuộc nhóm nào → "Khác".
  const sections = docGroups
    .map((g) => {
      const rows = docs.filter((d) => d.groupId === g.id);
      const subs = parseSubfolders(g.subfolders);
      const buckets: Array<{ label: string | null; rows: Doc[] }> = subs
        .map((s) => ({ label: s as string | null, rows: rows.filter((d) => d.subfolder === s) }))
        .filter((b) => b.rows.length);
      const rest = rows.filter((d) => !d.subfolder || !subs.includes(d.subfolder));
      if (rest.length) buckets.push({ label: buckets.length ? "Khác" : null, rows: rest });
      return { id: g.id, name: g.name, icon: g.icon, count: rows.length, buckets, photos: g.id === banVeId };
    })
    .filter((s) => s.count > 0 || (s.photos && photoCount > 0));
  const known = new Set(docGroups.map((g) => g.id));
  const loose = docs.filter((d) => !d.groupId || !known.has(d.groupId));
  if (loose.length) sections.push({ id: "khac", name: "Khác", icon: "📎", count: loose.length, buckets: [{ label: null, rows: loose }], photos: false });
  if (!banVeId && photoCount > 0) sections.push({ id: "anh-3d", name: "Phối cảnh 3D", icon: "📸", count: 0, buckets: [], photos: true });

  const docRow = (d: Doc) => {
    const st = d.status && d.status in DOC_STATUS_LABEL ? DOC_STATUS_LABEL[d.status as DocStatus] : null;
    return (
      <div
        key={d.id}
        className="flex items-center gap-3 rounded-2xl border-2 border-[#ff8a3d]/40 bg-[#1a1d2e] py-3 pl-4 pr-3"
      >
        <a
          href={`${api}/docs/${d.id}`}
          target="_blank"
          rel="noopener"
          className="ksql-tap flex min-w-0 flex-1 items-center gap-3"
        >
          <FileText className="h-8 w-8 shrink-0 text-orange-300" />
          <div className="min-w-0 flex-1">
            <div className="break-words text-base font-bold text-[#f0f2ff]">{d.title}</div>
            <div className="mt-1 text-sm text-[#8892b0]">
              {d.versionNo > 1 ? `Bản V${d.versionNo} · ` : ""}
              {st ? `${st} · ` : ""}
              {fmtSize(d.fileSize)} · {fmtDate(d.uploadedAt)}
            </div>
          </div>
        </a>
        <a
          href={`${api}/docs/${d.id}?download=1`}
          aria-label={`Tải ${d.title}`}
          className="ksql-tap flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#252840] text-orange-300"
        >
          <Download className="h-6 w-6" />
        </a>
      </div>
    );
  };

  const photoBlock = photoGroups.map((g) => (
    <div key={g.id} className="mt-3">
      <div className="mb-2 text-sm font-bold uppercase tracking-wide text-orange-300">
        📸 {g.title} ({g.photos.length})
      </div>
      <div className="grid grid-cols-2 gap-3">
        {g.photos.map((ph) => (
          <a
            key={ph.id}
            href={`${api}/design-photos/${ph.id}`}
            target="_blank"
            rel="noopener"
            className="block overflow-hidden rounded-xl border-2 border-[#252840] bg-[#13151f]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${api}/design-photos/${ph.id}?variant=thumb`}
              alt={ph.caption || g.title}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
            {ph.caption ? <div className="px-2 py-1 text-xs text-[#8892b0]">{ph.caption}</div> : null}
          </a>
        ))}
      </div>
    </div>
  ));

  return (
    <SubLayout title="Hồ sơ dự án" subtitle={project.name} backHref={`/ks-ql/sub/${project.id}/menu`}>
      {sections.length === 0 ? (
        <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] px-5 py-6 text-center text-base text-[#8892b0]">
          Admin chưa chia sẻ hồ sơ nào cho anh.
        </div>
      ) : (
        <>
          {/* Thanh nhảy nhanh tới nhóm */}
          <nav className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#nhom-${s.id}`}
                className="ksql-tap flex shrink-0 items-center gap-2 rounded-full border-2 border-[#252840] bg-[#13151f] px-4 py-2 text-base font-semibold text-[#f0f2ff]"
              >
                <span>{s.icon}</span>
                <span className="whitespace-nowrap">{s.name}</span>
                <span className="rounded-full bg-[#252840] px-2 text-sm text-orange-300">
                  {s.count + (s.photos ? photoCount : 0)}
                </span>
              </a>
            ))}
          </nav>

          <div className="flex flex-col gap-4">
            {sections.map((s) => (
              <details
                key={s.id}
                id={`nhom-${s.id}`}
                open
                className="group scroll-mt-4 rounded-2xl border-2 border-[#252840] bg-[#13151f] p-3"
              >
                <summary className="ksql-tap flex cursor-pointer list-none items-center gap-3 rounded-xl px-1 py-1 [&::-webkit-details-marker]:hidden">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ff8a3d]/15 text-2xl">{s.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold text-[#f0f2ff]">{s.name}</span>
                    <span className="block text-sm text-[#8892b0]">
                      {s.count} file{s.photos && photoCount ? ` · ${photoCount} ảnh 3D` : ""}
                    </span>
                  </span>
                  <span className="text-2xl text-[#8892b0] transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="mt-3">
                  {s.buckets.map((b, i) => (
                    <div key={b.label ?? `b${i}`} className={i ? "mt-4" : ""}>
                      {b.label ? (
                        <div className="mb-2 text-sm font-bold uppercase tracking-wide text-orange-300">
                          {b.label} ({b.rows.length})
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-3">{b.rows.map(docRow)}</div>
                    </div>
                  ))}
                  {s.photos ? photoBlock : null}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </SubLayout>
  );
}
