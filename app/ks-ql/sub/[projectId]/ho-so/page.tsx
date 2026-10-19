import { notFound, redirect } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { SubLayout } from "@/app/ks-ql/sub/_components/sub-layout";
import { findKsProject, ksDocWhere } from "@/lib/ks-ql-project-docs";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  contract: "Hợp đồng",
  estimate: "Dự toán",
  drawing: "Bản vẽ",
  legal: "Pháp lý",
  other: "Khác",
};

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
}

// Hồ sơ dự án cho KS: file PDF admin đã cấp quyền (bấm xem, nút tải) + toàn bộ ảnh 3D của dự án.
export default async function KsProjectDocsPage({ params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await findKsProject(params.projectId, user.id);
  if (!project) notFound();

  const [docs, groups] = await Promise.all([
    prisma.projectDocument.findMany({
      where: { projectId: project.id, ...ksDocWhere(user.id) },
      select: { id: true, title: true, category: true, fileName: true, fileSize: true, uploadedAt: true },
      orderBy: [{ category: "asc" }, { uploadedAt: "desc" }],
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

  return (
    <SubLayout title="Hồ sơ dự án" subtitle={project.name} backHref={`/ks-ql/sub/${project.id}/menu`}>
      <section>
        <h2 className="mb-3 text-lg font-bold text-[#f0f2ff]">Bản vẽ · tài liệu ({docs.length})</h2>
        {docs.length === 0 ? (
          <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] px-5 py-6 text-center text-base text-[#8892b0]">
            Admin chưa chia sẻ hồ sơ nào cho anh.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {docs.map((d) => (
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
                      {CATEGORY_LABEL[d.category] ?? d.category} · {fmtSize(d.fileSize)} · {fmtDate(d.uploadedAt)}
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
            ))}
          </div>
        )}
      </section>

      {groups.map((g) => (
        <section key={g.id} className="mt-4">
          <h2 className="mb-3 text-lg font-bold text-[#f0f2ff]">
            {g.title} ({g.photos.length})
          </h2>
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
        </section>
      ))}
    </SubLayout>
  );
}
