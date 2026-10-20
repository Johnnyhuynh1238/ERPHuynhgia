import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { plexMono, plexSans } from "@/lib/fonts";
import { findKsProject, ksDocWhere } from "@/lib/ks-ql-project-docs";
import { ensureProjectDocGroups, parseSubfolders } from "@/lib/project-doc-groups";
import { DOC_STATUS_LABEL, fileExtension, type DocStatus } from "@/lib/project-doc-groups-shared";
import "./ho-so-ks.css";

export const dynamic = "force-dynamic";

const NEW_DAYS = 7;

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });
}

// Hồ sơ dự án cho KS: danh mục nhóm hồ sơ (cùng nhóm màn admin) đánh số → bấm nhóm (?g=<id>)
// xem file theo mục con; ảnh 3D nằm trong nhóm Bản vẽ. Nhóm chỉ-admin (HĐ chủ nhà) bị loại ở ksDocWhere.
export default async function KsProjectDocsPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { g?: string };
}) {
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
      select: { id: true, systemKey: true, name: true, subfolders: true },
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
  const base = `/ks-ql/sub/${project.id}/ho-so`;
  type Doc = (typeof docs)[number];
  const photoCount = photoGroups.reduce((n, g) => n + g.photos.length, 0);
  const banVeId = docGroups.find((g) => g.systemKey === "ban_ve")?.id ?? null;
  const newSince = Date.now() - NEW_DAYS * 86400000;

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
      return { id: g.id, name: g.name, count: rows.length, buckets, photos: g.id === banVeId };
    })
    .filter((s) => s.count > 0 || (s.photos && photoCount > 0));
  const known = new Set(docGroups.map((g) => g.id));
  const loose = docs.filter((d) => !d.groupId || !known.has(d.groupId));
  if (loose.length) sections.push({ id: "khac", name: "Khác", count: loose.length, buckets: [{ label: null, rows: loose }], photos: false });
  if (!banVeId && photoCount > 0) sections.push({ id: "anh-3d", name: "Phối cảnh 3D", count: 0, buckets: [], photos: true });

  const fileCount = (s: (typeof sections)[number]) => s.count + (s.photos ? photoCount : 0);
  const newCount = (s: (typeof sections)[number]) =>
    s.buckets.reduce((n, b) => n + b.rows.filter((d) => d.uploadedAt.getTime() >= newSince).length, 0);
  const subLine = (s: (typeof sections)[number]) => {
    const parts: string[] = s.buckets.map((b) => b.label).filter((l): l is string => !!l);
    if (s.photos && photoCount) parts.push(`${photoCount} ảnh 3D`);
    return parts.length ? parts.join(" · ") : s.id === "khac" ? "Chưa xếp nhóm" : `${s.count} file`;
  };
  const lastUpload = docs[0]?.uploadedAt ?? null;
  const frame = `kshs ${plexSans.variable} ${plexMono.variable}`;

  const activeIdx = searchParams.g ? sections.findIndex((s) => s.id === searchParams.g) : -1;
  const active = activeIdx >= 0 ? sections[activeIdx] : null;

  if (!active) {
    const total = sections.reduce((n, s) => n + fileCount(s), 0);
    return (
      <div className={frame}>
        <div className="wrap">
          <div className="top">
            <Link href={`/ks-ql/sub/${project.id}/menu`} className="back">‹ Dự án</Link>
            <div className="eyebrow">Hồ sơ dự án · <span className="num">{total}</span> file</div>
            <h1>{project.name}</h1>
            {lastUpload ? (
              <div className="meta">
                {project.customerName ? `${project.customerName} · ` : ""}Cập nhật <b className="num">{fmtDate(lastUpload)}</b>
              </div>
            ) : null}
          </div>
          <div className="rule" />
          {sections.length === 0 ? (
            <p className="empty">Admin chưa chia sẻ hồ sơ nào cho anh.</p>
          ) : (
            <>
              <div className="list">
                {sections.map((s, i) => {
                  const fresh = newCount(s);
                  return (
                    <Link key={s.id} href={`${base}?g=${s.id}`} className="row ksql-tap">
                      <span className="idx num">{String(i + 1).padStart(2, "0")}</span>
                      <div style={{ minWidth: 0 }}>
                        <b>
                          {s.name}
                          {fresh ? <span className="new num">{fresh} MỚI</span> : null}
                        </b>
                        <small>{subLine(s)}</small>
                      </div>
                      <div className="c">
                        <em className="num">{fileCount(s)}</em>
                        <span>{s.photos && !s.count ? "ảnh" : "file"}</span>
                      </div>
                      <span className="go">›</span>
                    </Link>
                  );
                })}
              </div>
              <div className="foot">Chỉ hiện nhóm admin đã chia sẻ cho anh.</div>
            </>
          )}
        </div>
      </div>
    );
  }

  const docRow = (d: Doc) => {
    const st = d.status && d.status in DOC_STATUS_LABEL ? DOC_STATUS_LABEL[d.status as DocStatus] : null;
    const ext = fileExtension(d.fileName).toUpperCase();
    return (
      <div key={d.id} className="f">
        <a href={`${api}/docs/${d.id}`} target="_blank" rel="noopener" className="open ksql-tap">
          <b>{d.title}</b>
          <small>
            {ext ? <span className="tag num">{ext}</span> : null}
            {d.versionNo > 1 ? <><span className="num">V{d.versionNo}</span> · </> : null}
            {st ? <><span className={d.status === "approved" || d.status === "signed" ? "ok" : ""}>{st}</span> · </> : null}
            <span className="num">{fmtSize(d.fileSize)} · {fmtDate(d.uploadedAt)}</span>
          </small>
        </a>
        <a href={`${api}/docs/${d.id}?download=1`} className="dl ksql-tap" aria-label={`Tải ${d.title}`}>Tải về</a>
      </div>
    );
  };

  return (
    <div className={frame}>
      <div className="wrap">
        <div className="top">
          <Link href={base} className="back">‹ Hồ sơ dự án</Link>
          <div className="eyebrow">
            Nhóm <span className="num">{String(activeIdx + 1).padStart(2, "0")}</span>
            {active.count ? <> · <span className="num">{active.count}</span> file</> : null}
            {active.photos && photoCount ? <> · <span className="num">{photoCount}</span> ảnh</> : null}
          </div>
          <h1>{active.name}</h1>
          <div className="meta">{project.name}</div>
        </div>
        {active.buckets.map((b, i) => (
          <div key={b.label ?? `b${i}`}>
            <div className="sec">
              <span>{b.label ?? "Tài liệu"}</span>
              <span className="num">{b.rows.length}</span>
            </div>
            {b.rows.map(docRow)}
          </div>
        ))}
        {active.photos
          ? photoGroups.map((g) => (
              <div key={g.id}>
                <div className="sec">
                  <span>{g.title}</span>
                  <span className="num">{g.photos.length}</span>
                </div>
                <div className="ph">
                  {g.photos.map((ph) => (
                    <a key={ph.id} href={`${api}/design-photos/${ph.id}`} target="_blank" rel="noopener">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${api}/design-photos/${ph.id}?variant=thumb`} alt={ph.caption || g.title} loading="lazy" />
                      {ph.caption ? <span>{ph.caption}</span> : null}
                    </a>
                  ))}
                </div>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
